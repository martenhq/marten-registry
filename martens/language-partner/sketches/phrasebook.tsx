import { useEffect, useRef, useState } from "react";
import { BookOpen, Check, Trash2 } from "lucide-react";

declare const marten: any;

type Phrase = { id: string; phrase: string; translation?: string; note?: string; learned: boolean; addedAt?: string };
type Show = "learning" | "learned" | "all";

const KEY = "phrase/";
const shared = { shared: true };
const SHOW_LABEL: Record<Show, string> = { learning: "To learn", learned: "Learned", all: "All phrases" };

export default function Phrasebook() {
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [language, setLanguage] = useState("");
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<Show>("learning");
  const showRef = useRef<Show>("learning");
  showRef.current = show;

  useEffect(() => {
    let offStorage = () => {};
    let offAction = () => {};
    let offSearch = () => {};
    marten.ready.then(async (inMarten: boolean) => {
      setReady(true);
      if (!inMarten) return;
      marten.ui.setActions([
        { id: "add", title: "Add phrase", icon: "add" },
        { id: "show", title: "Show", icon: "filter" },
      ]);
      marten.ui.setSearch("Search phrases");
      offSearch = marten.ui.onSearch((text: string) => setQuery(text ?? ""));
      offAction = marten.ui.onAction((id: string) => (id === "add" ? add() : id === "show" ? pickShow() : null));
      const [rows, settings] = await Promise.all([marten.storage.list(KEY, shared), marten.storage.get("settings", shared)]);
      setPhrases(rows.map((r: { value: Phrase }) => r.value));
      if (settings?.language) setLanguage(settings.language);
      offStorage = marten.storage.subscribe(
        "",
        ({ key, value }: { key: string; value: any }) => {
          if (key === "settings") setLanguage(value?.language ?? "");
          if (key.startsWith(KEY)) setPhrases((all) => [...all.filter((p) => KEY + p.id !== key), ...(value ? [value] : [])]);
        },
        shared,
      );
    });
    return () => {
      offStorage();
      offAction();
      offSearch();
    };
  }, []);

  const save = async (p: Phrase) => {
    setPhrases((all) => [...all.filter((x) => x.id !== p.id), p]);
    await marten.storage.set(KEY + p.id, p, shared);
  };

  async function add() {
    const phrase = await marten.ui.prompt({ title: "Add a phrase", placeholder: "Muchas frutas", confirmLabel: "Next" });
    if (!phrase?.trim()) return;
    const translation = await marten.ui.prompt({ title: `What does "${phrase.trim()}" mean?`, placeholder: "Lots of fruit", confirmLabel: "Add" });
    if (translation === null || translation === undefined) return;
    if (showRef.current === "learned") setShow("learning");
    await save({ id: crypto.randomUUID(), phrase: phrase.trim(), translation: translation.trim(), learned: false, addedAt: new Date().toISOString() });
    marten.ui.haptic("success");
  }

  async function pickShow() {
    const choice = await marten.ui.choose({
      title: "Show",
      options: (Object.keys(SHOW_LABEL) as Show[]).map((id) => ({ id, title: SHOW_LABEL[id] })),
    });
    if (choice) setShow(choice as Show);
  }

  async function toggle(p: Phrase) {
    marten.ui.haptic("selection");
    await save({ ...p, learned: !p.learned });
  }

  async function remove(p: Phrase) {
    if (!(await marten.ui.confirm({ title: `Delete "${p.phrase}"?`, confirmLabel: "Delete", destructive: true }))) return;
    setPhrases((all) => all.filter((x) => x.id !== p.id));
    await marten.storage.delete(KEY + p.id, shared);
  }

  const learned = phrases.filter((p) => p.learned).length;
  const q = query.trim().toLowerCase();
  const shown = phrases
    .filter((p) => (show === "all" ? true : show === "learned" ? p.learned : !p.learned))
    .filter((p) => !q || `${p.phrase} ${p.translation ?? ""} ${p.note ?? ""}`.toLowerCase().includes(q))
    .sort((a, b) => (b.addedAt ?? "").localeCompare(a.addedAt ?? ""));

  if (ready && phrases.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <BookOpen className="text-marten-muted" size={28} />
        <p className="text-marten-muted">No phrases yet. Chat with Language Partner and the ones worth learning land here, or add your own.</p>
        <button className="min-h-11 rounded-lg bg-marten-accent px-4 text-marten-accent-text" onClick={add}>
          Add a phrase
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-5">
      <p className="text-sm text-marten-muted">{language || "Phrasebook"}</p>
      <p className="text-3xl font-semibold tabular-nums">
        {phrases.length - learned} <span className="text-lg font-normal text-marten-muted">to learn</span>
      </p>
      <p className="text-sm text-marten-muted tabular-nums">
        {learned} learned · showing {SHOW_LABEL[show].toLowerCase()}
      </p>

      {shown.length === 0 ? (
        <p className="py-12 text-center text-marten-muted">
          {q ? "No phrases match that." : show === "learned" ? "Nothing ticked yet. Keep going." : "All learned. Nicely done."}
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-marten-border">
          {shown.map((p) => (
            <li key={p.id} className="flex items-center gap-1">
              <button
                aria-label={p.learned ? `Mark ${p.phrase} as to learn` : `Mark ${p.phrase} as learned`}
                className="flex min-h-14 flex-1 items-center gap-3 py-2 text-left"
                onClick={() => toggle(p)}
              >
                <span
                  className={
                    "flex size-6 shrink-0 items-center justify-center rounded-full border " +
                    (p.learned ? "border-marten-accent bg-marten-accent text-marten-accent-text" : "border-marten-border")
                  }
                >
                  {p.learned && <Check size={14} />}
                </span>
                <span className="flex-1">
                  <span className={"block text-[17px] " + (p.learned ? "text-marten-muted line-through" : "")}>{p.phrase}</span>
                  {p.translation && <span className="block text-sm text-marten-muted">{p.translation}</span>}
                  {p.note && <span className="block text-sm italic text-marten-muted">{p.note}</span>}
                </span>
              </button>
              <button aria-label={`Delete ${p.phrase}`} className="flex size-11 shrink-0 items-center justify-center text-marten-muted" onClick={() => remove(p)}>
                <Trash2 size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
