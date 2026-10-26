import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Flame, Trophy } from "lucide-react";

declare const marten: any;

type Settings = { name?: string; rule?: string; start?: string; days?: number };
type CheckIn = { date: string; who: string; name: string; note?: string };
type Member = { id: string; name: string; kind: string };

const CHECKIN = "checkin/";
const shared = { shared: true };

const pad = (n: number) => String(n).padStart(2, "0");
const localDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Day arithmetic on YYYY-MM-DD strings, in UTC so a clock change never skips or repeats a day. */
const shift = (day: string, by: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const keyOf = (c: CheckIn) => `${CHECKIN}${c.date}/${c.who}`;
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

function streaks(days: Set<string>, today: string) {
  let current = 0;
  let day = days.has(today) ? today : shift(today, -1);
  while (days.has(day)) {
    current++;
    day = shift(day, -1);
  }
  let best = 0;
  let run = 0;
  let prev = "";
  for (const d of [...days].sort()) {
    run = prev && shift(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return { current, best };
}

export default function Leaderboard() {
  const [settings, setSettings] = useState<Settings>({});
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [people, setPeople] = useState<Member[]>([]);
  const [ready, setReady] = useState(false);
  const [today, setToday] = useState(localDay());
  const handlers = useRef<Record<string, () => void>>({});

  useEffect(() => {
    let offStorage = () => {};
    let offAction = () => {};
    const tick = setInterval(() => setToday(localDay()), 60_000);
    marten.ready.then(async (inMarten: boolean) => {
      if (!inMarten) return setReady(true);
      marten.ui.setActions([
        { id: "checkin", title: "Check in", icon: "done" },
        { id: "late", title: "Log a past day", icon: "calendar" },
        { id: "settings", title: "Challenge", icon: "settings" },
      ]);
      offAction = marten.ui.onAction((id: string) => handlers.current[id]?.());
      const [rows, saved, members] = await Promise.all([
        marten.storage.list(CHECKIN, shared),
        marten.storage.get("settings", shared),
        marten.members(),
      ]);
      setCheckIns(rows.map((r: { value: CheckIn }) => r.value));
      if (saved) setSettings(saved);
      setPeople(members.filter((m: Member) => m.kind === "person"));
      setReady(true);
      offStorage = marten.storage.subscribe(
        "",
        ({ key, value }: { key: string; value: any }) => {
          if (key === "settings") setSettings(value ?? {});
          if (key.startsWith(CHECKIN)) setCheckIns((all) => [...all.filter((c) => keyOf(c) !== key), ...(value ? [value] : [])]);
        },
        shared,
      );
    });
    return () => {
      clearInterval(tick);
      offStorage();
      offAction();
    };
  }, []);

  const board = useMemo(() => {
    const byName = new Map<string, Set<string>>();
    for (const p of people) byName.set(p.name, new Set());
    for (const c of checkIns) {
      if (settings.start && c.date < settings.start) continue;
      if (!byName.has(c.name)) byName.set(c.name, new Set());
      byName.get(c.name)!.add(c.date);
    }
    return [...byName.entries()]
      .map(([name, days]) => ({ name, total: days.size, today: days.has(today), ...streaks(days, today) }))
      .sort((a, b) => b.total - a.total || b.current - a.current || a.name.localeCompare(b.name));
  }, [checkIns, people, settings.start, today]);

  const viewer = marten.viewer as { id: string; name: string } | null;
  const mine = viewer ? checkIns.find((c) => c.date === today && c.name === viewer.name) : undefined;

  async function checkIn(date = today) {
    if (!viewer) return;
    const existing = checkIns.find((c) => c.date === date && c.name === viewer.name);
    if (existing) return;
    const entry: CheckIn = { date, who: viewer.id, name: viewer.name };
    setCheckIns((all) => [...all, entry]);
    marten.ui.haptic("success");
    await marten.storage.set(keyOf(entry), entry, shared);
  }

  async function logLate() {
    const choice = await marten.ui.choose({
      title: "Log a past day",
      options: [1, 2, 3].map((n) => {
        const day = shift(today, -n);
        const label = new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });
        return { id: day, title: n === 1 ? `Yesterday, ${label}` : label };
      }),
    });
    if (choice) checkIn(choice);
  }

  async function myToday() {
    if (!mine) return checkIn();
    const choice = await marten.ui.choose({
      title: "Today",
      options: [
        { id: "note", title: mine.note ? "Change your note" : "Add a note" },
        { id: "undo", title: "Undo today's check-in", destructive: true },
      ],
    });
    if (choice === "note") {
      const note = await marten.ui.prompt({ title: "A note for today", placeholder: "Ran 5k", value: mine.note ?? "", confirmLabel: "Save" });
      if (note === null) return;
      const next = { ...mine, note: note.trim() || undefined };
      setCheckIns((all) => all.map((c) => (keyOf(c) === keyOf(mine) ? next : c)));
      await marten.storage.set(keyOf(next), next, shared);
    } else if (choice === "undo") {
      if (!(await marten.ui.confirm({ title: "Undo today's check-in?", confirmLabel: "Undo", destructive: true }))) return;
      setCheckIns((all) => all.filter((c) => keyOf(c) !== keyOf(mine)));
      await marten.storage.delete(keyOf(mine), shared);
    }
  }

  async function editSettings() {
    const name = await marten.ui.prompt({ title: "Name the challenge", placeholder: "30 days, no sugar", value: settings.name ?? "", confirmLabel: "Next" });
    if (name === null) return;
    const rule = await marten.ui.prompt({ title: "What counts as a day done?", placeholder: "No added sugar all day", value: settings.rule ?? "", confirmLabel: "Next" });
    if (rule === null) return;
    const start = await marten.ui.prompt({ title: "Start date", placeholder: "YYYY-MM-DD", value: settings.start ?? today, confirmLabel: "Next" });
    if (start === null) return;
    const days = await marten.ui.prompt({ title: "How many days?", placeholder: "30", value: String(settings.days ?? 30), confirmLabel: "Save" });
    if (days === null) return;
    const next: Settings = {
      name: name.trim() || undefined,
      rule: rule.trim() || undefined,
      start: isDay(start.trim()) ? start.trim() : settings.start,
      days: Math.max(1, Math.round(Number(days)) || settings.days || 30),
    };
    setSettings(next);
    await marten.storage.set("settings", next, shared);
  }

  handlers.current = { checkin: () => checkIn(), late: logLate, settings: editSettings };

  if (!ready) return null;

  const started = !settings.start || settings.start <= today;
  const dayNumber = settings.start ? daysBetween(settings.start, today) + 1 : 0;
  const inToday = board.filter((b) => b.today);
  const notYet = board.filter((b) => !b.today);

  if (!settings.rule && checkIns.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <Trophy className="text-marten-muted" size={28} />
        <p className="text-marten-muted">No challenge yet. Tell Challenge what you want to do together, or set it up here.</p>
        <button className="min-h-11 rounded-lg bg-marten-accent px-4 text-marten-accent-text" onClick={editSettings}>
          Set up a challenge
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 p-5">
      <header>
        <p className="text-sm text-marten-muted tabular-nums">
          {!settings.start
            ? "Challenge"
            : !started
              ? `Starts ${new Date(`${settings.start}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" })}`
              : settings.days && dayNumber > settings.days
                ? `Finished · ${settings.days} days`
                : `Day ${dayNumber}${settings.days ? ` of ${settings.days}` : ""}`}
        </p>
        <h2 className="text-2xl font-semibold leading-tight">{settings.name ?? "Our challenge"}</h2>
        {settings.rule && <p className="text-marten-muted">{settings.rule}</p>}
      </header>

      {viewer && started && (
        <button
          className={
            "flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 font-medium " +
            (mine ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200" : "bg-marten-accent text-marten-accent-text")
          }
          onClick={myToday}
        >
          {mine ? (
            <>
              <Check size={18} /> You're in today{mine.note ? ` · ${mine.note}` : ""}
            </>
          ) : (
            "Check in for today"
          )}
        </button>
      )}

      {started && board.length > 0 && (
        <section className="rounded-xl border border-marten-border bg-marten-surface p-4">
          <p className="font-medium tabular-nums">
            Today: {inToday.length} of {board.length} in
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {inToday.map((b) => (
              <span key={b.name} className="rounded-lg bg-green-50 px-2 py-1 text-sm text-green-800 dark:bg-green-950 dark:text-green-200">
                ✓ {b.name}
              </span>
            ))}
            {notYet.map((b) => (
              <span key={b.name} className="rounded-lg border border-marten-border px-2 py-1 text-sm text-marten-muted">
                {b.name}
              </span>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-1 text-sm font-medium text-marten-muted">Leaderboard</h3>
        <ol className="divide-y divide-marten-border">
          {board.map((b, i) => (
            <li key={b.name} className="flex min-h-12 items-center gap-3">
              <span className="w-6 text-center text-marten-muted tabular-nums">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">{b.name}</span>
              {b.current > 0 && (
                <span className="flex items-center gap-1 text-sm text-orange-600 tabular-nums dark:text-orange-300" title={`Best streak ${b.best}`}>
                  <Flame size={16} /> {b.current}
                </span>
              )}
              <span className="w-16 text-right tabular-nums">
                {b.total} {b.total === 1 ? "day" : "days"}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-sm text-marten-muted">Days done in total, with the current streak. A missed day starts a new streak; the total stays.</p>
      </section>
    </div>
  );
}
