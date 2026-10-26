import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Check, MoreHorizontal, Plus, Star } from "lucide-react";

declare const marten: any;

type Part = { id: string; label: string; done: boolean };
type Book = {
  id: string;
  title: string;
  author?: string;
  status: "current" | "nominated" | "done";
  nominatedBy?: string;
  meeting?: string;
  schedule: Part[];
  finishedAt?: string;
};
type Rating = { bookId: string; who: string; name: string; stars: number };

const BOOK = "book/";
const RATING = "rating/";
const shared = { shared: true };

const upsert = <T,>(all: T[], key: string, value: T | null, keyOf: (t: T) => string) => [
  ...all.filter((x) => keyOf(x) !== key),
  ...(value ? [value] : []),
];
const bookKey = (b: Book) => BOOK + b.id;
const ratingKey = (r: Rating) => `${RATING}${r.bookId}/${r.who}`;

function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          className={n <= Math.round(value) ? "fill-amber-400 text-amber-400 dark:fill-amber-300 dark:text-amber-300" : "text-marten-border"}
        />
      ))}
    </span>
  );
}

export default function Shelf() {
  const [books, setBooks] = useState<Book[]>([]);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [ready, setReady] = useState(false);
  const handlers = useRef<Record<string, () => void>>({});

  useEffect(() => {
    let offStorage = () => {};
    let offAction = () => {};
    marten.ready.then(async (inMarten: boolean) => {
      if (!inMarten) return setReady(true);
      marten.ui.setActions([{ id: "add", title: "Add book", icon: "add" }]);
      offAction = marten.ui.onAction((id: string) => handlers.current[id]?.());
      const [bookRows, ratingRows] = await Promise.all([marten.storage.list(BOOK, shared), marten.storage.list(RATING, shared)]);
      setBooks(bookRows.map((r: { value: Book }) => ({ ...r.value, schedule: r.value.schedule ?? [] })));
      setRatings(ratingRows.map((r: { value: Rating }) => r.value));
      setReady(true);
      offStorage = marten.storage.subscribe(
        "",
        ({ key, value }: { key: string; value: any }) => {
          if (key.startsWith(BOOK)) setBooks((all) => upsert(all, key, value ? { ...value, schedule: value.schedule ?? [] } : null, bookKey));
          if (key.startsWith(RATING)) setRatings((all) => upsert(all, key, value, ratingKey));
        },
        shared,
      );
    });
    return () => {
      offStorage();
      offAction();
    };
  }, []);

  const save = async (book: Book) => {
    setBooks((all) => upsert(all, bookKey(book), book, bookKey));
    await marten.storage.set(bookKey(book), book, shared);
  };

  const current = books.find((b) => b.status === "current");
  const nominated = books.filter((b) => b.status === "nominated");
  const done = books
    .filter((b) => b.status === "done")
    .sort((a, b) => (b.finishedAt ?? "").localeCompare(a.finishedAt ?? ""));

  const scores = useMemo(() => {
    const byBook: Record<string, Map<string, number>> = {};
    for (const r of ratings) (byBook[r.bookId] ??= new Map()).set(r.name, r.stars);
    const out: Record<string, { average: number; count: number; mine?: number }> = {};
    for (const [id, people] of Object.entries(byBook)) {
      const stars = [...people.values()];
      out[id] = {
        average: stars.reduce((s, n) => s + n, 0) / stars.length,
        count: stars.length,
        mine: marten.viewer ? people.get(marten.viewer.name) : undefined,
      };
    }
    return out;
  }, [ratings]);

  async function startReading(book: Book) {
    if (current && current.id !== book.id) {
      const ok = await marten.ui.confirm({
        title: `Finish ${current.title}?`,
        message: `${book.title} becomes the book you're reading, and ${current.title} moves to past picks.`,
        confirmLabel: "Start reading",
      });
      if (!ok) return;
      await save({ ...current, status: "done", finishedAt: new Date().toISOString() });
    }
    await save({ ...book, status: "current" });
    marten.ui.haptic("success");
  }

  async function add() {
    const title = await marten.ui.prompt({ title: "Add a book", placeholder: "Title", confirmLabel: "Next" });
    if (!title?.trim()) return;
    const author = await marten.ui.prompt({ title: `Who wrote ${title.trim()}?`, placeholder: "Author (optional)", confirmLabel: "Next" });
    const where = await marten.ui.choose({
      title: title.trim(),
      options: [
        { id: "nominated", title: "Nominate it" },
        { id: "current", title: "We're reading it now" },
      ],
    });
    if (!where) return;
    const book: Book = {
      id: crypto.randomUUID(),
      title: title.trim(),
      author: author?.trim() || undefined,
      status: "nominated",
      nominatedBy: marten.viewer?.name,
      schedule: [],
    };
    if (where === "current") await startReading(book);
    else {
      await save(book);
      marten.ui.haptic("success");
    }
  }
  handlers.current = { add };

  async function currentMenu(book: Book) {
    const choice = await marten.ui.choose({
      title: book.title,
      options: [
        { id: "meeting", title: "Set the meeting" },
        { id: "part", title: "Add a part to the schedule" },
        { id: "finish", title: "We've finished it" },
        { id: "delete", title: "Delete", destructive: true },
      ],
    });
    if (choice === "meeting") {
      const meeting = await marten.ui.prompt({ title: "When do you meet?", placeholder: "Thu 14 Nov, 7pm", value: book.meeting ?? "", confirmLabel: "Save" });
      if (meeting !== null) await save({ ...book, meeting: meeting.trim() || undefined });
    } else if (choice === "part") addPart(book);
    else if (choice === "finish") {
      await save({ ...book, status: "done", finishedAt: new Date().toISOString() });
      marten.ui.haptic("success");
    } else if (choice === "delete") remove(book);
  }

  async function addPart(book: Book) {
    const label = await marten.ui.prompt({ title: "Add to the schedule", placeholder: "Chapters 1–8 by the 12th", confirmLabel: "Add" });
    if (!label?.trim()) return;
    await save({ ...book, schedule: [...book.schedule, { id: crypto.randomUUID(), label: label.trim(), done: false }] });
  }

  async function togglePart(book: Book, part: Part) {
    marten.ui.haptic("selection");
    await save({ ...book, schedule: book.schedule.map((p) => (p.id === part.id ? { ...p, done: !p.done } : p)) });
  }

  async function nominationMenu(book: Book) {
    const choice = await marten.ui.choose({
      title: book.title,
      options: [
        { id: "read", title: "Make it the current book" },
        { id: "delete", title: "Delete", destructive: true },
      ],
    });
    if (choice === "read") startReading(book);
    else if (choice === "delete") remove(book);
  }

  async function pastMenu(book: Book) {
    const choice = await marten.ui.choose({
      title: book.title,
      options: [
        ...[5, 4, 3, 2, 1].map((n) => ({ id: String(n), title: `${"★".repeat(n)}${"☆".repeat(5 - n)}` })),
        { id: "delete", title: "Delete", destructive: true },
      ],
    });
    if (!choice) return;
    if (choice === "delete") return remove(book);
    const viewer = marten.viewer;
    if (!viewer) return;
    const rating: Rating = { bookId: book.id, who: viewer.id, name: viewer.name, stars: Number(choice) };
    setRatings((all) => upsert(all, ratingKey(rating), rating, ratingKey));
    await marten.storage.set(ratingKey(rating), rating, shared);
    marten.ui.haptic("success");
  }

  async function remove(book: Book) {
    if (!(await marten.ui.confirm({ title: `Delete ${book.title}?`, message: "Its schedule and ratings go too.", confirmLabel: "Delete", destructive: true }))) return;
    const gone = ratings.filter((r) => r.bookId === book.id);
    setBooks((all) => all.filter((b) => b.id !== book.id));
    setRatings((all) => all.filter((r) => r.bookId !== book.id));
    await Promise.all([marten.storage.delete(bookKey(book), shared), ...gone.map((r) => marten.storage.delete(ratingKey(r), shared))]);
  }

  if (!ready) return null;
  if (books.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <BookOpen className="text-marten-muted" size={28} />
        <p className="text-marten-muted">The shelf is empty. Nominate a book in the chat, or add the first one here.</p>
        <button className="min-h-11 rounded-lg bg-marten-accent px-4 text-marten-accent-text" onClick={add}>
          Add a book
        </button>
      </div>
    );
  }

  const partsDone = current ? current.schedule.filter((p) => p.done).length : 0;
  const progress = current?.schedule.length ? partsDone / current.schedule.length : 0;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-5">
      {current ? (
        <section className="rounded-xl border border-marten-border bg-marten-surface p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm text-marten-muted">Reading now</p>
              <h2 className="text-2xl font-semibold leading-tight">{current.title}</h2>
              {current.author && <p className="text-marten-muted">{current.author}</p>}
            </div>
            <button aria-label={`More for ${current.title}`} className="flex size-11 shrink-0 items-center justify-center text-marten-muted" onClick={() => currentMenu(current)}>
              <MoreHorizontal size={20} />
            </button>
          </div>
          <p className="mt-3 font-medium">{current.meeting ? `Meeting ${current.meeting}` : "No meeting set yet"}</p>
          {current.schedule.length > 0 && (
            <>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-marten-border">
                <div className="h-full rounded-full bg-marten-accent transition-all" style={{ width: `${progress * 100}%` }} />
              </div>
              <p className="mt-1 text-sm text-marten-muted tabular-nums">
                {partsDone} of {current.schedule.length} parts read
              </p>
              <ul className="mt-2 divide-y divide-marten-border">
                {current.schedule.map((part) => (
                  <li key={part.id}>
                    <button className="flex min-h-11 w-full items-center gap-3 text-left" onClick={() => togglePart(current, part)}>
                      <span
                        className={
                          "flex size-6 shrink-0 items-center justify-center rounded-full border " +
                          (part.done ? "border-marten-accent bg-marten-accent text-marten-accent-text" : "border-marten-border")
                        }
                      >
                        {part.done && <Check size={14} />}
                      </span>
                      <span className={part.done ? "text-marten-muted" : ""}>{part.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <button className="mt-2 flex min-h-11 items-center gap-2 text-sm text-marten-accent" onClick={() => addPart(current)}>
            <Plus size={16} /> Add to the schedule
          </button>
        </section>
      ) : (
        <section className="rounded-xl border border-dashed border-marten-border p-4 text-center text-marten-muted">
          No book picked yet. Make a nomination the current book, or ask Book Club to run the vote.
        </section>
      )}

      {nominated.length > 0 && (
        <section>
          <h3 className="mb-1 text-sm font-medium text-marten-muted">Nominated</h3>
          <ul className="divide-y divide-marten-border">
            {nominated.map((b) => (
              <li key={b.id}>
                <button className="flex min-h-12 w-full flex-col justify-center py-1 text-left" onClick={() => nominationMenu(b)}>
                  <span>{b.title}</span>
                  <span className="text-sm text-marten-muted">
                    {[b.author, b.nominatedBy && `nominated by ${b.nominatedBy}`].filter(Boolean).join(" · ")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {done.length > 0 && (
        <section>
          <h3 className="mb-1 text-sm font-medium text-marten-muted">Past picks</h3>
          <ul className="divide-y divide-marten-border">
            {done.map((b) => {
              const score = scores[b.id];
              return (
                <li key={b.id}>
                  <button className="flex min-h-12 w-full items-center gap-3 py-1 text-left" onClick={() => pastMenu(b)}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{b.title}</span>
                      <span className="block text-sm text-marten-muted">
                        {score ? `${score.count} ${score.count === 1 ? "rating" : "ratings"}${score.mine ? ` · you gave ${score.mine}` : " · tap to rate"}` : "Tap to rate"}
                      </span>
                    </span>
                    {score && (
                      <span className="flex shrink-0 items-center gap-2 tabular-nums">
                        <Stars value={score.average} />
                        <span className="text-sm">{score.average.toFixed(1)}</span>
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
