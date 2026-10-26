import { useEffect, useMemo, useRef, useState } from "react";
import { PieChart } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

declare const marten: any;

type Category = { name: string; group?: string; budgeted: number; spent: number };
type Month = { month: string; currency: string; updatedAt?: string; categories: Category[] };

const KEY = "month";
const shared = { shared: true };

const money = (n: number, currency: string) => {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return Math.round(n).toLocaleString();
  }
};

const monthLabel = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
};

const daysLeft = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return null;
  const now = new Date();
  if (now.getFullYear() !== y || now.getMonth() !== m - 1) return null;
  return new Date(y, m, 0).getDate() - now.getDate();
};

export default function Spending() {
  const [data, setData] = useState<Month | null>(null);
  const [ready, setReady] = useState(false);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const busy = useRef(false);

  useEffect(() => {
    let offStorage = () => {};
    let offAction = () => {};
    marten.ready.then(async (inMarten: boolean) => {
      if (!inMarten) return setReady(true);
      marten.ui.setActions([{ id: "refresh", title: "Refresh", icon: "refresh" }]);
      offAction = marten.ui.onAction((id: string) => id === "refresh" && refresh());
      const saved = await marten.storage.get(KEY, shared);
      if (saved?.categories) setData(saved);
      setReady(true);
      offStorage = marten.storage.subscribe(
        KEY,
        ({ key, value }: { key: string; value: Month | null }) => {
          if (key === KEY) setData(value?.categories ? value : null);
        },
        shared,
      );
    });
    return () => {
      offStorage();
      offAction();
    };
  }, []);

  async function refresh() {
    if (busy.current) return;
    busy.current = true;
    setAsking(true);
    setNote("");
    try {
      await marten.agent.ask("Refresh the Spending sketch with this month's budgeted and spent amounts from YNAB.");
      marten.ui.haptic("success");
    } catch (err: any) {
      setNote(err?.code === "no_agent" ? "Money isn't in this chat any more." : "Couldn't refresh just now. Try again in a minute.");
    } finally {
      busy.current = false;
      setAsking(false);
    }
  }

  const view = useMemo(() => {
    if (!data) return null;
    const rows = data.categories
      .map((c) => ({ ...c, name: String(c.name ?? ""), budgeted: Number(c.budgeted) || 0, spent: Number(c.spent) || 0 }))
      .filter((c) => c.budgeted > 0 || c.spent > 0)
      .map((c) => ({ ...c, left: c.budgeted - c.spent, share: c.budgeted > 0 ? c.spent / c.budgeted : c.spent > 0 ? 2 : 0 }))
      .sort((a, b) => b.share - a.share);
    const budgeted = rows.reduce((s, c) => s + c.budgeted, 0);
    const spent = rows.reduce((s, c) => s + c.spent, 0);
    const over = rows.filter((c) => c.left < 0);
    const chart = [...rows]
      .sort((a, b) => Math.max(b.budgeted, b.spent) - Math.max(a.budgeted, a.spent))
      .slice(0, 6)
      .map((c) => ({ name: c.name.length > 12 ? c.name.slice(0, 11) + "…" : c.name, Budgeted: c.budgeted, Spent: c.spent }));
    return { rows, budgeted, spent, over, chart };
  }, [data]);

  if (ready && !view) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <PieChart className="text-marten-muted" size={28} />
        <p className="text-marten-muted">No numbers yet. Money fills this in from your YNAB budget.</p>
        <button className="min-h-11 rounded-lg bg-marten-accent px-4 text-marten-accent-text disabled:opacity-60" disabled={asking} onClick={refresh}>
          {asking ? "Asking Money…" : "Fill it in"}
        </button>
        {note && <p className="text-sm text-marten-muted">{note}</p>}
      </div>
    );
  }
  if (!view || !data) return null;

  const left = daysLeft(data.month);
  const remaining = view.budgeted - view.spent;

  return (
    <div className="mx-auto max-w-3xl p-5">
      <p className="text-sm text-marten-muted">
        {monthLabel(data.month)}
        {left !== null && ` · ${left} ${left === 1 ? "day" : "days"} left`}
      </p>
      <p className="text-3xl font-semibold tabular-nums">
        {money(view.spent, data.currency)}
        <span className="text-lg font-normal text-marten-muted"> of {money(view.budgeted, data.currency)}</span>
      </p>
      <p className={"text-sm tabular-nums " + (remaining >= 0 ? "text-marten-muted" : "text-red-700 dark:text-red-300")}>
        {remaining >= 0 ? `${money(remaining, data.currency)} left` : `${money(-remaining, data.currency)} over`}
        {view.over.length > 0 && ` · ${view.over.length} ${view.over.length === 1 ? "category" : "categories"} over`}
      </p>
      {asking && <p className="mt-1 text-sm text-marten-muted">Refreshing…</p>}
      {note && <p className="mt-1 text-sm text-marten-muted">{note}</p>}

      {view.chart.length > 1 && (
        <div className="mt-5 h-56 rounded-xl border border-marten-border bg-marten-surface p-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={view.chart} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
              <CartesianGrid vertical={false} stroke="var(--marten-border)" />
              <XAxis dataKey="name" tick={{ fill: "var(--marten-muted)", fontSize: 11 }} tickLine={false} axisLine={false} interval={0} />
              <YAxis tick={{ fill: "var(--marten-muted)", fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v: number) => money(v, data.currency)} cursor={{ fill: "var(--marten-border)", opacity: 0.4 }} />
              <Bar dataKey="Budgeted" fill="var(--marten-chart-2)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              <Bar dataKey="Spent" fill="var(--marten-chart-1)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <ul className="mt-5 divide-y divide-marten-border">
        {view.rows.map((c) => {
          const pct = Math.min(100, Math.round(c.share * 100));
          const bar = c.left < 0 ? "bg-red-500 dark:bg-red-400" : c.share >= 0.8 ? "bg-amber-500 dark:bg-amber-400" : "bg-marten-accent";
          return (
            <li key={c.name} className="flex min-h-14 flex-col justify-center gap-1.5 py-2">
              <div className="flex items-baseline justify-between gap-3">
                <span>
                  {c.name}
                  {c.group && <span className="ml-2 text-sm text-marten-muted">{c.group}</span>}
                </span>
                <span className={"text-sm tabular-nums " + (c.left < 0 ? "text-red-700 dark:text-red-300" : "text-marten-muted")}>
                  {c.left < 0 ? `${money(-c.left, data.currency)} over` : `${money(c.left, data.currency)} left`}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-marten-border">
                <div className={"h-full rounded-full " + bar} style={{ width: `${pct}%` }} />
              </div>
              <span className="text-xs text-marten-muted tabular-nums">
                {money(c.spent, data.currency)} of {money(c.budgeted, data.currency)}
              </span>
            </li>
          );
        })}
      </ul>
      {data.updatedAt && (
        <p className="mt-4 text-xs text-marten-muted">
          Updated {new Date(data.updatedAt).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}
        </p>
      )}
    </div>
  );
}
