import { useEffect, useMemo, useRef, useState } from "react";
import { Check, MoreHorizontal, Sparkles } from "lucide-react";

declare const marten: any;

type Chore = { id: string; name: string; rota: string[]; start: string; every?: number };
type Member = { id: string; name: string; kind: string };

const CHORE = "chore/";
const DONE = "done/";
const COVER = "cover/";
const shared = { shared: true };
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
};
function mondayOf(date: Date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return ymd(d);
}
const addWeeks = (monday: string, n: number) => {
  const d = parse(monday);
  d.setDate(d.getDate() + 7 * n);
  return ymd(d);
};
const weeksBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / WEEK_MS);

/** Who the rota puts on a chore in a given week, or null when it isn't due that week. */
function rotaPick(chore: Chore, monday: string) {
  if (!chore.rota.length) return null;
  const every = Math.max(1, chore.every ?? 1);
  const weeks = weeksBetween(mondayOf(parse(chore.start)), monday);
  if (weeks < 0 || weeks % every !== 0) return null;
  const turn = weeks / every;
  return chore.rota[turn % chore.rota.length]!;
}

const names = (text: string | null) =>
  String(text ?? "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);

export default function Chores() {
  const [chores, setChores] = useState<Chore[]>([]);
  const [marks, setMarks] = useState<Record<string, any>>({});
  const [people, setPeople] = useState<string[]>([]);
  const [viewer, setViewer] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const actions = useRef<Record<string, () => void>>({});

  const week = mondayOf(new Date());
  const nextWeek = addWeeks(week, 1);

  useEffect(() => {
    let alive = true;
    let offStorage = () => {};
    let offAction = () => {};
    marten.ready.then(async (inMarten: boolean) => {
      if (!alive) return;
      if (!inMarten) return setReady(true);
      marten.ui.setActions([{ id: "add", title: "Add chore", icon: "add" }]);
      offAction = marten.ui.onAction((id: string) => actions.current[id]?.());
      const [rows, members] = await Promise.all([marten.storage.list("", shared), marten.members()]);
      if (!alive) return;
      const loaded: Chore[] = [];
      const loadedMarks: Record<string, any> = {};
      for (const r of rows as { key: string; value: any }[]) {
        if (r.key.startsWith(CHORE)) loaded.push(r.value);
        else if (r.key.startsWith(DONE) || r.key.startsWith(COVER)) loadedMarks[r.key] = r.value;
      }
      setChores(loaded);
      setMarks(loadedMarks);
      setPeople(members.filter((m: Member) => m.kind === "person").map((m: Member) => m.name));
      setViewer(marten.viewer?.name ?? null);
      setReady(true);
      offStorage = marten.storage.subscribe(
        "",
        ({ key, value }: { key: string; value: any }) => {
          if (key.startsWith(CHORE)) setChores((all) => [...all.filter((c) => CHORE + c.id !== key), ...(value ? [value] : [])]);
          else if (key.startsWith(DONE) || key.startsWith(COVER))
            setMarks((all) => {
              const next = { ...all };
              if (value) next[key] = value;
              else delete next[key];
              return next;
            });
        },
        shared,
      );
    });
    return () => {
      alive = false;
      offStorage();
      offAction();
    };
  }, []);

  const whoFor = (c: Chore, monday: string) => marks[`${COVER}${c.id}/${monday}`]?.name ?? rotaPick(c, monday);
  const doneFor = (c: Chore) => marks[`${DONE}${c.id}/${week}`];

  const sorted = useMemo(() => [...chores].sort((a, b) => a.name.localeCompare(b.name)), [chores]);
  const thisWeek = sorted.filter((c) => whoFor(c, week));
  const later = sorted.filter((c) => !whoFor(c, week));
  const doneCount = thisWeek.filter((c) => doneFor(c)).length;
  const mine = viewer ? thisWeek.filter((c) => whoFor(c, week) === viewer && !doneFor(c)) : [];

  const saveChore = async (chore: Chore) => {
    setChores((all) => [...all.filter((c) => c.id !== chore.id), chore]);
    await marten.storage.set(CHORE + chore.id, chore, shared);
  };
  const setMark = async (key: string, value: any) => {
    setMarks((all) => {
      const next = { ...all };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });
    if (value) await marten.storage.set(key, value, shared);
    else await marten.storage.delete(key, shared);
  };

  async function add() {
    const name = (await marten.ui.prompt({ title: "Add a chore", placeholder: "Bins out", confirmLabel: "Next" }))?.trim();
    if (!name) return;
    const rota = names(
      await marten.ui.prompt({ title: "Who's on the rota, in order?", placeholder: "Names, separated by commas", value: people.join(", "), confirmLabel: "Next" }),
    );
    if (!rota.length) return;
    const every = await marten.ui.choose({
      title: `How often is ${name}?`,
      options: [
        { id: "1", title: "Every week" },
        { id: "2", title: "Every two weeks" },
        { id: "4", title: "Every four weeks" },
      ],
    });
    if (!every) return;
    await saveChore({ id: crypto.randomUUID(), name, rota, start: week, every: Number(every) });
    marten.ui.haptic("success");
  }

  async function toggle(c: Chore) {
    const key = `${DONE}${c.id}/${week}`;
    const isDone = !!marks[key];
    await setMark(key, isDone ? null : { by: viewer ?? whoFor(c, week), at: new Date().toISOString() });
    marten.ui.haptic(isDone ? "selection" : thisWeek.every((x) => x.id === c.id || doneFor(x)) ? "success" : "selection");
  }

  async function more(c: Chore) {
    const due = !!whoFor(c, week);
    const options = [
      ...(due ? [{ id: "cover", title: "Someone else this week" }] : []),
      { id: "rota", title: "Change the rota" },
      { id: "rename", title: "Rename" },
      { id: "delete", title: "Delete chore", destructive: true },
    ];
    const choice = await marten.ui.choose({ title: c.name, options });
    if (choice === "cover") {
      const pick = await marten.ui.pick({ title: `Who's doing ${c.name} this week?`, items: [...new Set([...c.rota, ...people])].map((n) => ({ id: n, title: n })), allowCustom: true });
      const who = (pick?.id ?? pick?.text ?? "").trim();
      if (!who) return;
      await setMark(`${COVER}${c.id}/${week}`, who === rotaPick(c, week) ? null : { name: who });
    } else if (choice === "rota") {
      const rota = names(await marten.ui.prompt({ title: `${c.name}: the rota, in order`, value: c.rota.join(", "), confirmLabel: "Save" }));
      // A changed rota starts again this week, so nobody gets two turns in a row from the old count.
      if (rota.length) await saveChore({ ...c, rota, start: week });
    } else if (choice === "rename") {
      const name = (await marten.ui.prompt({ title: "Rename chore", value: c.name, confirmLabel: "Save" }))?.trim();
      if (name) await saveChore({ ...c, name });
    } else if (choice === "delete") {
      if (!(await marten.ui.confirm({ title: `Delete ${c.name}?`, message: "Its rota goes for everyone.", confirmLabel: "Delete", destructive: true }))) return;
      setChores((all) => all.filter((x) => x.id !== c.id));
      await marten.storage.delete(CHORE + c.id, shared);
    }
  }

  actions.current = { add };

  if (!ready) return null;

  if (chores.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <Sparkles className="text-marten-muted" size={28} />
        <p className="text-marten-muted">No chores yet. Tell House what needs doing, or add the first one.</p>
        <button className="min-h-11 rounded-lg bg-marten-accent px-4 text-marten-accent-text" onClick={add}>
          Add a chore
        </button>
      </div>
    );
  }

  const weekLabel = parse(week).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

  return (
    <div className="mx-auto max-w-2xl p-5">
      <p className="text-sm text-marten-muted">Week of {weekLabel}</p>
      <p className="text-3xl font-semibold tabular-nums">
        {doneCount} of {thisWeek.length} done
      </p>
      {mine.length > 0 && <p className="mt-1 text-marten-muted">You're on {mine.map((c) => c.name).join(", ")}.</p>}

      {thisWeek.length > 0 && (
        <ul className="mt-5 divide-y divide-marten-border rounded-xl border border-marten-border bg-marten-surface">
          {thisWeek.map((c) => {
            const done = doneFor(c);
            const who = whoFor(c, week);
            const covered = !!marks[`${COVER}${c.id}/${week}`];
            return (
              <li key={c.id} className="flex min-h-14 items-center gap-1 pl-4">
                <button className="flex min-h-14 flex-1 items-center gap-3 text-left" onClick={() => toggle(c)}>
                  <span
                    className={
                      "flex size-6 shrink-0 items-center justify-center rounded-full border " +
                      (done ? "border-marten-accent bg-marten-accent text-marten-accent-text" : "border-marten-border")
                    }
                  >
                    {done && <Check size={14} />}
                  </span>
                  <span className="flex-1">
                    <span className={done ? "text-marten-muted line-through" : ""}>{c.name}</span>
                    <span className="block text-sm text-marten-muted">
                      {who}
                      {covered ? " (covering)" : ""} · next {whoFor(c, nextWeek) ?? "not next week"}
                    </span>
                  </span>
                </button>
                <button aria-label={`More for ${c.name}`} className="flex size-11 items-center justify-center text-marten-muted" onClick={() => more(c)}>
                  <MoreHorizontal size={18} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {later.length > 0 && (
        <>
          <p className="mt-6 text-sm text-marten-muted">Not this week</p>
          <ul className="divide-y divide-marten-border">
            {later.map((c) => {
              let ahead = 1;
              while (ahead < 52 && !whoFor(c, addWeeks(week, ahead))) ahead++;
              const monday = addWeeks(week, ahead);
              return (
                <li key={c.id} className="flex min-h-12 items-center gap-1">
                  <span className="flex-1">
                    {c.name}
                    <span className="block text-sm text-marten-muted">
                      {whoFor(c, monday) ?? "nobody"} · week of{" "}
                      {parse(monday).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                    </span>
                  </span>
                  <button aria-label={`More for ${c.name}`} className="flex size-11 items-center justify-center text-marten-muted" onClick={() => more(c)}>
                    <MoreHorizontal size={18} />
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
