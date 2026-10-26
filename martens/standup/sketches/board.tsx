import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, ClipboardList } from "lucide-react";

declare const marten: any;

type Update = { date: string; who: string; name: string; done?: string; today?: string; blockers?: string; at: string };
type Blocker = { id: string; text: string; who: string; since: string; resolved?: boolean };
type Member = { id: string; name: string; kind: string };

const UPDATE = "update/";
const BLOCKER = "blocker/";
const shared = { shared: true };

const pad = (n: number) => String(n).padStart(2, "0");
const localDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const shift = (day: string, by: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
};
const daysOpen = (since: string, today: string) => Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${since}T00:00:00Z`)) / 86_400_000);
const updateKey = (u: Update) => `${UPDATE}${u.date}/${u.who}`;
const blockerKey = (b: Blocker) => BLOCKER + b.id;
const label = (day: string, today: string) =>
  day === today
    ? "Today"
    : day === shift(today, -1)
      ? "Yesterday"
      : new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });

export default function Board() {
  const [updates, setUpdates] = useState<Update[]>([]);
  const [blockers, setBlockers] = useState<Blocker[]>([]);
  const [people, setPeople] = useState<Member[]>([]);
  const [ready, setReady] = useState(false);
  const [today] = useState(localDay());
  const [day, setDay] = useState(today);
  const handlers = useRef<Record<string, () => void>>({});

  useEffect(() => {
    let offStorage = () => {};
    let offAction = () => {};
    marten.ready.then(async (inMarten: boolean) => {
      if (!inMarten) return setReady(true);
      marten.ui.setActions([{ id: "update", title: "Your update", icon: "edit" }]);
      offAction = marten.ui.onAction((id: string) => handlers.current[id]?.());
      const [updateRows, blockerRows, members] = await Promise.all([
        marten.storage.list(UPDATE, shared),
        marten.storage.list(BLOCKER, shared),
        marten.members(),
      ]);
      setUpdates(updateRows.map((r: { value: Update }) => r.value));
      setBlockers(blockerRows.map((r: { value: Blocker }) => r.value));
      setPeople(members.filter((m: Member) => m.kind === "person"));
      setReady(true);
      offStorage = marten.storage.subscribe(
        "",
        ({ key, value }: { key: string; value: any }) => {
          if (key.startsWith(UPDATE)) setUpdates((all) => [...all.filter((u) => updateKey(u) !== key), ...(value ? [value] : [])]);
          if (key.startsWith(BLOCKER)) setBlockers((all) => [...all.filter((b) => blockerKey(b) !== key), ...(value ? [value] : [])]);
        },
        shared,
      );
    });
    return () => {
      offStorage();
      offAction();
    };
  }, []);

  const viewer = marten.viewer as { id: string; name: string } | null;

  const rows = useMemo(() => {
    const byName = new Map<string, Update | undefined>();
    for (const p of people) byName.set(p.name, undefined);
    for (const u of updates.filter((u) => u.date === day).sort((a, b) => a.at.localeCompare(b.at))) byName.set(u.name, u);
    return [...byName.entries()]
      .map(([name, update]) => ({ name, update }))
      .sort((a, b) => Number(!a.update) - Number(!b.update) || a.name.localeCompare(b.name));
  }, [updates, people, day]);

  const open = blockers.filter((b) => !b.resolved).sort((a, b) => a.since.localeCompare(b.since));
  const posted = rows.filter((r) => r.update).length;

  async function editUpdate() {
    if (!viewer) return;
    const mine = updates.find((u) => u.date === today && u.name === viewer.name);
    const done = await marten.ui.prompt({ title: "What did you get done?", placeholder: "Shipped the export", value: mine?.done ?? "", confirmLabel: "Next" });
    if (done === null) return;
    const focus = await marten.ui.prompt({ title: "What are you on today?", placeholder: "Invoices", value: mine?.today ?? "", confirmLabel: "Next" });
    if (focus === null) return;
    const blocked = await marten.ui.prompt({ title: "Anything blocking you?", placeholder: "Nothing", value: mine?.blockers ?? "", confirmLabel: "Post" });
    if (blocked === null) return;
    const clean = (s: string) => s.trim() || undefined;
    const update: Update = {
      date: today,
      who: mine?.who ?? viewer.id,
      name: viewer.name,
      done: clean(done),
      today: clean(focus),
      blockers: /^(no|none|nothing|-|n\/a)\.?$/i.test(blocked.trim()) ? undefined : clean(blocked),
      at: new Date().toISOString(),
    };
    setUpdates((all) => [...all.filter((u) => updateKey(u) !== updateKey(update)), update]);
    setDay(today);
    marten.ui.haptic("success");
    const writes = [marten.storage.set(updateKey(update), update, shared)];
    const text = update.blockers;
    if (text && !open.some((b) => b.who === viewer.name && b.text === text)) {
      const blocker: Blocker = { id: crypto.randomUUID(), text, who: viewer.name, since: today };
      setBlockers((all) => [...all, blocker]);
      writes.push(marten.storage.set(blockerKey(blocker), blocker, shared));
    }
    await Promise.all(writes);
  }
  handlers.current = { update: editUpdate };

  async function resolve(blocker: Blocker) {
    if (!(await marten.ui.confirm({ title: "Mark as cleared?", message: `${blocker.who}: ${blocker.text}`, confirmLabel: "Cleared" }))) return;
    const next = { ...blocker, resolved: true };
    setBlockers((all) => all.map((b) => (b.id === blocker.id ? next : b)));
    marten.ui.haptic("success");
    await marten.storage.set(blockerKey(next), next, shared);
  }

  async function removeUpdate(update: Update) {
    if (!(await marten.ui.confirm({ title: `Delete ${update.name}'s update?`, confirmLabel: "Delete", destructive: true }))) return;
    setUpdates((all) => all.filter((u) => updateKey(u) !== updateKey(update)));
    await marten.storage.delete(updateKey(update), shared);
  }

  if (!ready) return null;

  if (updates.length === 0 && blockers.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <ClipboardList className="text-marten-muted" size={28} />
        <p className="text-marten-muted">No updates yet. Answer the morning ask in the chat, or post yours here.</p>
        <button className="min-h-11 rounded-lg bg-marten-accent px-4 text-marten-accent-text" onClick={editUpdate}>
          Post your update
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 p-5">
      {open.length > 0 && (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
          <p className="flex items-center gap-2 font-medium text-amber-900 dark:text-amber-100">
            <AlertTriangle size={18} /> {open.length} open {open.length === 1 ? "blocker" : "blockers"}
          </p>
          <ul className="mt-1 divide-y divide-amber-200 dark:divide-amber-900">
            {open.map((b) => {
              const age = daysOpen(b.since, today);
              return (
                <li key={b.id} className="flex min-h-11 items-center gap-3">
                  <span className="min-w-0 flex-1 text-amber-950 dark:text-amber-50">
                    <span className="font-medium">{b.who}</span>: {b.text}
                    {age > 0 && <span className="text-sm text-amber-800 dark:text-amber-200"> · {age === 1 ? "1 day" : `${age} days`}</span>}
                  </span>
                  <button
                    aria-label={`Mark ${b.who}'s blocker as cleared`}
                    className="flex size-11 shrink-0 items-center justify-center text-amber-800 dark:text-amber-200"
                    onClick={() => resolve(b)}
                  >
                    <Check size={18} />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <div className="flex items-center justify-between">
          <button aria-label="Previous day" className="flex size-11 items-center justify-center text-marten-muted" onClick={() => setDay(shift(day, -1))}>
            <ChevronLeft size={20} />
          </button>
          <div className="text-center">
            <p className="font-semibold">{label(day, today)}</p>
            <p className="text-sm text-marten-muted tabular-nums">
              {posted} of {rows.length} posted
            </p>
          </div>
          <button
            aria-label="Next day"
            className="flex size-11 items-center justify-center text-marten-muted disabled:opacity-30"
            disabled={day >= today}
            onClick={() => setDay(shift(day, 1))}
          >
            <ChevronRight size={20} />
          </button>
        </div>

        <ul className="mt-3 flex flex-col gap-3">
          {rows.map(({ name, update }) =>
            update ? (
              <li key={name} className="rounded-xl border border-marten-border bg-marten-surface p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{name}</p>
                  <button className="-mr-2 -mt-2 min-h-11 px-2 text-sm text-marten-muted" onClick={() => removeUpdate(update)}>
                    Delete
                  </button>
                </div>
                <dl className="mt-1 grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-1">
                  {update.today && (
                    <>
                      <dt className="text-sm text-marten-muted">Today</dt>
                      <dd>{update.today}</dd>
                    </>
                  )}
                  {update.done && (
                    <>
                      <dt className="text-sm text-marten-muted">Done</dt>
                      <dd>{update.done}</dd>
                    </>
                  )}
                  {update.blockers && (
                    <>
                      <dt className="text-sm text-marten-muted">Blocked</dt>
                      <dd className="text-amber-800 dark:text-amber-200">{update.blockers}</dd>
                    </>
                  )}
                </dl>
              </li>
            ) : (
              <li key={name} className="flex min-h-11 items-center rounded-xl border border-dashed border-marten-border px-4 text-marten-muted">
                {name} · no update yet
              </li>
            ),
          )}
        </ul>
      </section>
    </div>
  );
}
