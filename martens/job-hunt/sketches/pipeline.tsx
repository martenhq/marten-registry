import { useEffect, useRef, useState } from "react";
import { Briefcase } from "lucide-react";

declare const marten: any;

document.head.insertAdjacentHTML("beforeend", '<meta name="marten-layout" content="full">');

type Stage = "applied" | "interviewing" | "offer" | "closed";
type Application = { id: string; company: string; role?: string; stage: Stage; appliedOn?: string; next?: string; updatedAt?: string };

const KEY = "application/";
const shared = { shared: true };
const STAGES: { id: Stage; title: string; tint: string }[] = [
  { id: "applied", title: "Applied", tint: "bg-sky-500" },
  { id: "interviewing", title: "Interviewing", tint: "bg-violet-500" },
  { id: "offer", title: "Offer", tint: "bg-green-500" },
  { id: "closed", title: "Closed", tint: "bg-neutral-400" },
];

const stageOf = (a: Application): Stage => (STAGES.some((s) => s.id === a.stage) ? a.stage : "applied");
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function daysSince(date?: string) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [y, m, d] = date.split("-").map(Number);
  const then = new Date(y!, m! - 1, d!);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today.getTime() - then.getTime()) / 86400000);
}

export default function Pipeline() {
  const [apps, setApps] = useState<Application[]>([]);
  const [ready, setReady] = useState(false);
  const [showClosed, setShowClosed] = useState(true);
  const closedRef = useRef(true);
  closedRef.current = showClosed;

  useEffect(() => {
    let offStorage = () => {};
    let offAction = () => {};
    marten.ready.then(async (inMarten: boolean) => {
      setReady(true);
      if (!inMarten) return;
      marten.ui.setActions([
        { id: "add", title: "Add application", icon: "add" },
        { id: "filter", title: "Show", icon: "filter" },
      ]);
      offAction = marten.ui.onAction((id: string) => (id === "add" ? add() : id === "filter" ? pickFilter() : null));
      const rows = await marten.storage.list(KEY, shared);
      setApps(rows.map((r: { value: Application }) => r.value));
      offStorage = marten.storage.subscribe(
        KEY,
        ({ key, value }: { key: string; value: Application | null }) =>
          setApps((all) => [...all.filter((a) => KEY + a.id !== key), ...(value ? [value] : [])]),
        shared,
      );
    });
    return () => {
      offStorage();
      offAction();
    };
  }, []);

  const save = async (a: Application) => {
    const next = { ...a, updatedAt: new Date().toISOString() };
    setApps((all) => [...all.filter((x) => x.id !== a.id), next]);
    await marten.storage.set(KEY + a.id, next, shared);
  };

  async function add() {
    const company = await marten.ui.prompt({ title: "Which company?", placeholder: "Company name", confirmLabel: "Next" });
    if (!company?.trim()) return;
    const role = await marten.ui.prompt({ title: `What's the role at ${company.trim()}?`, placeholder: "Product designer", confirmLabel: "Add" });
    if (role === null || role === undefined) return;
    await save({ id: crypto.randomUUID(), company: company.trim(), role: role.trim(), stage: "applied", appliedOn: iso(new Date()) });
    marten.ui.haptic("success");
  }

  async function pickFilter() {
    const choice = await marten.ui.choose({
      title: "Show",
      options: [
        { id: "all", title: closedRef.current ? "✓ Everything" : "Everything" },
        { id: "open", title: closedRef.current ? "Hide closed" : "✓ Hide closed" },
      ],
    });
    if (choice) setShowClosed(choice === "all");
  }

  async function open(a: Application) {
    const options = [
      ...STAGES.filter((s) => s.id !== a.stage).map((s) => ({ id: s.id, title: `Move to ${s.title}` })),
      { id: "next", title: a.next ? "Change next step" : "Add next step" },
      { id: "delete", title: "Delete", destructive: true },
    ];
    const choice = await marten.ui.choose({ title: `${a.company}${a.role ? ` · ${a.role}` : ""}`, options });
    if (!choice) return;
    if (choice === "delete") {
      if (!(await marten.ui.confirm({ title: `Delete ${a.company}?`, message: "This removes it from the board.", confirmLabel: "Delete", destructive: true }))) return;
      setApps((all) => all.filter((x) => x.id !== a.id));
      await marten.storage.delete(KEY + a.id, shared);
      return;
    }
    if (choice === "next") {
      const next = await marten.ui.prompt({ title: "Next step", placeholder: "Phone screen Thursday 2pm", value: a.next ?? "", confirmLabel: "Save" });
      if (next === null || next === undefined) return;
      await save({ ...a, next: next.trim() || undefined });
      return;
    }
    await save({ ...a, stage: choice as Stage });
    marten.ui.haptic(choice === "offer" ? "success" : "selection");
  }

  const active = apps.filter((a) => a.stage !== "closed").length;
  const interviewing = apps.filter((a) => a.stage === "interviewing").length;
  const offers = apps.filter((a) => a.stage === "offer").length;
  const columns = STAGES.filter((s) => showClosed || s.id !== "closed");

  if (ready && apps.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <Briefcase className="text-marten-muted" size={28} />
        <p className="text-marten-muted">No applications yet. Tell Job Hunt where you've applied, or add the first one.</p>
        <button className="min-h-11 rounded-lg bg-marten-accent px-4 text-marten-accent-text" onClick={add}>
          Add an application
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-5">
      <p className="text-3xl font-semibold tabular-nums">
        {active} <span className="text-lg font-normal text-marten-muted">active</span>
      </p>
      <p className="text-sm text-marten-muted tabular-nums">
        {interviewing} interviewing · {offers} {offers === 1 ? "offer" : "offers"}
      </p>

      <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        {columns.map((stage) => {
          const cards = apps
            .filter((a) => stageOf(a) === stage.id)
            .sort((x, y) => (y.updatedAt ?? "").localeCompare(x.updatedAt ?? ""));
          return (
            <section key={stage.id} className="rounded-xl bg-marten-surface p-3">
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <span className={"size-2 rounded-full " + stage.tint} />
                {stage.title}
                <span className="font-normal text-marten-muted tabular-nums">{cards.length}</span>
              </h2>
              {cards.length === 0 ? (
                <p className="py-3 text-sm text-marten-muted">Nothing here.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {cards.map((a) => {
                    const days = daysSince(a.appliedOn);
                    const quiet = a.stage === "applied" && days !== null && days >= 10;
                    return (
                      <li key={a.id}>
                        <button
                          className="flex min-h-11 w-full flex-col items-start rounded-lg border border-marten-border bg-marten-bg p-3 text-left"
                          onClick={() => open(a)}
                        >
                          <span className="font-medium">{a.company}</span>
                          {a.role && <span className="text-sm text-marten-muted">{a.role}</span>}
                          {a.next && <span className="mt-1 text-sm">→ {a.next}</span>}
                          {days !== null && a.stage !== "closed" && (
                            <span className={"mt-1 text-xs tabular-nums " + (quiet ? "text-amber-700 dark:text-amber-300" : "text-marten-muted")}>
                              {days === 0 ? "Applied today" : `Applied ${days} ${days === 1 ? "day" : "days"} ago`}
                              {quiet ? " · time to follow up" : ""}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
