import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Dumbbell, Footprints, Activity, X } from "lucide-react";

declare const marten: any;

type Status = "planned" | "done" | "missed";
type Kind = "run" | "strength" | "rest" | "other";
type Session = { id: string; date: string; title: string; kind?: Kind; detail?: string; status: Status; note?: string };

const KEY = "session/";
const shared = { shared: true };

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const mondayOf = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));
const parse = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
};

function kindOf(title: string): Kind {
  const t = title.toLowerCase();
  if (/\b(run|jog|tempo|interval|stride|5k|10k)/.test(t)) return "run";
  if (/\b(strength|squat|deadlift|press|lift|gym|push|pull|core|weights)/.test(t)) return "strength";
  if (/\b(rest|off)\b/.test(t)) return "rest";
  return "other";
}

function KindIcon({ kind }: { kind?: Kind }) {
  if (kind === "run") return <Footprints size={18} />;
  if (kind === "strength") return <Dumbbell size={18} />;
  return <Activity size={18} />;
}

function StatusMark({ status }: { status: Status }) {
  if (status === "done")
    return (
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300">
        <Check size={16} />
      </span>
    );
  if (status === "missed")
    return (
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
        <X size={16} />
      </span>
    );
  return <span className="size-7 shrink-0 rounded-full border-2 border-marten-border" />;
}

export default function Plan() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [ready, setReady] = useState(false);
  const [week, setWeek] = useState(0);
  const weekRef = useRef(0);
  weekRef.current = week;

  useEffect(() => {
    let offStorage = () => {};
    let offAction = () => {};
    marten.ready.then(async (inMarten: boolean) => {
      setReady(true);
      if (!inMarten) return;
      marten.ui.setActions([{ id: "add", title: "Add session", icon: "add" }]);
      offAction = marten.ui.onAction((id: string) => id === "add" && add());
      const rows = await marten.storage.list(KEY, shared);
      setSessions(rows.map((r: { value: Session }) => r.value));
      offStorage = marten.storage.subscribe(
        KEY,
        ({ key, value }: { key: string; value: Session | null }) =>
          setSessions((all) => [...all.filter((s) => KEY + s.id !== key), ...(value ? [value] : [])]),
        shared,
      );
    });
    return () => {
      offStorage();
      offAction();
    };
  }, []);

  const save = async (s: Session) => {
    setSessions((all) => [...all.filter((x) => x.id !== s.id), s]);
    await marten.storage.set(KEY + s.id, s, shared);
  };

  async function add() {
    const title = await marten.ui.prompt({ title: "Add a session", placeholder: "Easy run, 30 min", confirmLabel: "Next" });
    if (!title?.trim()) return;
    const monday = addDays(mondayOf(new Date()), weekRef.current * 7);
    const day = await marten.ui.choose({
      title: "Which day?",
      options: Array.from({ length: 7 }, (_, i) => {
        const d = addDays(monday, i);
        return { id: iso(d), title: d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" }) };
      }),
    });
    if (!day) return;
    await save({ id: crypto.randomUUID(), date: day, title: title.trim(), kind: kindOf(title), status: "planned" });
    marten.ui.haptic("success");
  }

  async function open(s: Session) {
    const options = [
      ...(s.status !== "done" ? [{ id: "done", title: "Done" }] : []),
      ...(s.status !== "missed" ? [{ id: "missed", title: "Missed" }] : []),
      ...(s.status !== "planned" ? [{ id: "planned", title: "Back to planned" }] : []),
      { id: "delete", title: "Delete", destructive: true },
    ];
    const choice = await marten.ui.choose({ title: s.title, options });
    if (!choice) return;
    if (choice === "delete") {
      if (!(await marten.ui.confirm({ title: `Delete ${s.title}?`, confirmLabel: "Delete", destructive: true }))) return;
      setSessions((all) => all.filter((x) => x.id !== s.id));
      await marten.storage.delete(KEY + s.id, shared);
      return;
    }
    await save({ ...s, status: choice as Status });
    marten.ui.haptic(choice === "done" ? "success" : "selection");
  }

  const today = iso(new Date());
  const monday = addDays(mondayOf(new Date()), week * 7);
  const days = Array.from({ length: 7 }, (_, i) => iso(addDays(monday, i)));
  const thisWeek = sessions.filter((s) => s.date >= days[0]! && s.date <= days[6]! && s.kind !== "rest");
  const done = thisWeek.filter((s) => s.status === "done").length;
  const missed = thisWeek.filter((s) => s.status === "missed").length;
  const next = useMemo(
    () => [...sessions].filter((s) => s.status === "planned" && s.date >= today && s.kind !== "rest").sort((a, b) => a.date.localeCompare(b.date))[0],
    [sessions, today],
  );

  const weekLabel =
    week === 0 ? "This week" : week === 1 ? "Next week" : week === -1 ? "Last week" : `Week of ${monday.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
  const dayLabel = (date: string) =>
    date === today ? "Today" : parse(date).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

  if (ready && sessions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <Footprints className="text-marten-muted" size={28} />
        <p className="text-marten-muted">No plan yet. Tell Coach your goal and how much time you have, or add the first session.</p>
        <button className="min-h-11 rounded-lg bg-marten-accent px-4 text-marten-accent-text" onClick={add}>
          Add a session
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-5">
      {next && (
        <button className="mb-5 flex w-full items-center gap-3 rounded-xl bg-marten-accent p-4 text-left text-marten-accent-text" onClick={() => open(next)}>
          <KindIcon kind={next.kind} />
          <span className="flex-1">
            <span className="block text-sm opacity-80">Next up · {dayLabel(next.date)}</span>
            <span className="block text-lg font-semibold">{next.title}</span>
            {next.detail && <span className="block text-sm opacity-80">{next.detail}</span>}
          </span>
        </button>
      )}

      <div className="flex items-center justify-between gap-2">
        <button aria-label="Previous week" className="flex size-11 items-center justify-center text-marten-muted" onClick={() => setWeek((w) => w - 1)}>
          <ChevronLeft size={20} />
        </button>
        <div className="text-center">
          <p className="font-semibold">{weekLabel}</p>
          <p className="text-sm text-marten-muted tabular-nums">
            {thisWeek.length === 0 ? "Nothing planned" : `${done} of ${thisWeek.length} done${missed ? ` · ${missed} missed` : ""}`}
          </p>
        </div>
        <button aria-label="Next week" className="flex size-11 items-center justify-center text-marten-muted" onClick={() => setWeek((w) => w + 1)}>
          <ChevronRight size={20} />
        </button>
      </div>

      <ol className="mt-3 flex flex-col divide-y divide-marten-border">
        {days.map((date) => {
          const items = sessions.filter((s) => s.date === date);
          return (
            <li key={date} className="py-2">
              <p className={"text-sm " + (date === today ? "font-semibold text-marten-accent" : "text-marten-muted")}>{dayLabel(date)}</p>
              {items.length === 0 ? (
                <p className="min-h-8 py-1 text-sm text-marten-muted">Rest</p>
              ) : (
                items.map((s) => (
                  <button key={s.id} className="flex min-h-12 w-full items-center gap-3 text-left" onClick={() => open(s)}>
                    {s.kind === "rest" ? <span className="size-7 shrink-0" /> : <StatusMark status={s.status} />}
                    <span className="flex-1">
                      <span className={s.status === "missed" ? "text-marten-muted" : ""}>{s.title}</span>
                      {(s.note || s.detail) && <span className="block text-sm text-marten-muted">{s.note || s.detail}</span>}
                    </span>
                    <span className="text-marten-muted">
                      <KindIcon kind={s.kind} />
                    </span>
                  </button>
                ))
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
