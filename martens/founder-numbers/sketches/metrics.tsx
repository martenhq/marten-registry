import { useEffect, useMemo, useRef, useState } from "react";
import { TrendingDown, TrendingUp, Gauge } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

declare const marten: any;

type Kpi = { id: string; label: string; value: number; previous?: number | null; unit: "money" | "count" | "percent"; goodWhen?: "up" | "down" };
type Point = { week: string; [metric: string]: number | string };
type Week = { weekOf: string; currency?: string; updatedAt?: string; kpis: Kpi[]; trend?: Point[] };

const KEY = "week";
const shared = { shared: true };
const SERIES: { id: string; label: string; unit: Kpi["unit"] }[] = [
  { id: "mrr", label: "MRR", unit: "money" },
  { id: "signups", label: "Signups", unit: "count" },
  { id: "customers", label: "Customers", unit: "count" },
];

function format(raw: number, unit: Kpi["unit"], currency = "USD", compact = false) {
  const n = Number(raw) || 0;
  if (unit === "percent") return `${n.toFixed(n < 10 ? 1 : 0)}%`;
  const opts: Intl.NumberFormatOptions = compact ? { notation: "compact", maximumFractionDigits: 1 } : { maximumFractionDigits: 0 };
  if (unit === "money") {
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency, ...opts }).format(n);
    } catch {
      return new Intl.NumberFormat(undefined, opts).format(n);
    }
  }
  return new Intl.NumberFormat(undefined, opts).format(n);
}

const shortDate = (iso: string) => {
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

function Delta({ kpi, currency }: { kpi: Kpi; currency: string }) {
  if (kpi.previous === undefined || kpi.previous === null) return <span className="text-sm text-marten-muted">no last week</span>;
  const diff = Number(kpi.value) - Number(kpi.previous);
  if (diff === 0) return <span className="text-sm text-marten-muted">same as last week</span>;
  const good = (diff > 0) === ((kpi.goodWhen ?? "up") === "up");
  const Icon = diff > 0 ? TrendingUp : TrendingDown;
  const amount = kpi.unit === "percent" ? `${Math.abs(diff).toFixed(1)} pts` : format(Math.abs(diff), kpi.unit, currency, true);
  const pct = kpi.unit !== "percent" && kpi.previous !== 0 ? ` (${diff > 0 ? "+" : "−"}${Math.abs(Math.round((diff / Math.abs(kpi.previous)) * 100))}%)` : "";
  return (
    <span className={"flex items-center gap-1 text-sm tabular-nums " + (good ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300")}>
      <Icon size={14} />
      {diff > 0 ? "+" : "−"}
      {amount}
      {pct}
    </span>
  );
}

export default function Metrics() {
  const [data, setData] = useState<Week | null>(null);
  const [ready, setReady] = useState(false);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const [series, setSeries] = useState("mrr");
  const busy = useRef(false);

  useEffect(() => {
    let offStorage = () => {};
    let offAction = () => {};
    marten.ready.then(async (inMarten: boolean) => {
      if (!inMarten) return setReady(true);
      marten.ui.setActions([{ id: "refresh", title: "Refresh", icon: "refresh" }]);
      offAction = marten.ui.onAction((id: string) => id === "refresh" && refresh());
      const saved = await marten.storage.get(KEY, shared);
      if (Array.isArray(saved?.kpis)) setData(saved);
      setReady(true);
      offStorage = marten.storage.subscribe(
        KEY,
        ({ key, value }: { key: string; value: Week | null }) => {
          if (key === KEY) setData(Array.isArray(value?.kpis) ? value : null);
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
      await marten.agent.ask("Refresh the Metrics sketch with last week's numbers and the trend from Stripe and PostHog.");
      marten.ui.haptic("success");
    } catch (err: any) {
      setNote(err?.code === "no_agent" ? "Founder Numbers isn't in this chat any more." : "Couldn't refresh just now. Try again in a minute.");
    } finally {
      busy.current = false;
      setAsking(false);
    }
  }

  const trend = data?.trend ?? [];
  const available = useMemo(() => SERIES.filter((s) => trend.some((p) => typeof p[s.id] === "number")), [trend]);
  const active = available.find((s) => s.id === series) ?? available[0];
  const currency = data?.currency ?? "USD";

  if (ready && !data) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <Gauge className="text-marten-muted" size={28} />
        <p className="text-marten-muted">No numbers yet. Founder Numbers fills this in from Stripe and PostHog every Monday.</p>
        <button className="min-h-11 rounded-lg bg-marten-accent px-4 text-marten-accent-text disabled:opacity-60" disabled={asking} onClick={refresh}>
          {asking ? "Asking…" : "Fill it in now"}
        </button>
        {note && <p className="text-sm text-marten-muted">{note}</p>}
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="mx-auto max-w-3xl p-5">
      <p className="text-sm text-marten-muted">Week of {shortDate(data.weekOf)} · against the week before</p>
      {asking && <p className="mt-1 text-sm text-marten-muted">Refreshing…</p>}
      {note && <p className="mt-1 text-sm text-marten-muted">{note}</p>}

      <section className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        {data.kpis.map((k) => (
          <div key={k.id} className="rounded-xl border border-marten-border bg-marten-surface p-4">
            <p className="text-sm text-marten-muted">{k.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{format(k.value, k.unit, currency)}</p>
            <Delta kpi={k} currency={currency} />
          </div>
        ))}
      </section>

      {active && trend.length > 1 && (
        <section className="mt-5 rounded-xl border border-marten-border bg-marten-surface p-4">
          <div className="flex flex-wrap gap-2">
            {available.map((s) => (
              <button
                key={s.id}
                className={"min-h-11 rounded-lg px-3 text-sm " + (s.id === active.id ? "bg-marten-accent text-marten-accent-text" : "text-marten-muted")}
                onClick={() => {
                  setSeries(s.id);
                  marten.ui.haptic("selection");
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="mt-3 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--marten-border)" />
                <XAxis dataKey="week" tickFormatter={shortDate} tick={{ fill: "var(--marten-muted)", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={16} />
                <YAxis
                  width={52}
                  tickFormatter={(v: number) => format(v, active.unit, currency, true)}
                  tick={{ fill: "var(--marten-muted)", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip labelFormatter={(l: string) => `Week of ${shortDate(l)}`} formatter={(v: number) => [format(v, active.unit, currency), active.label]} />
                <Line type="monotone" dataKey={active.id} stroke="var(--marten-chart-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {data.updatedAt && (
        <p className="mt-4 text-xs text-marten-muted">
          Updated {new Date(data.updatedAt).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}
        </p>
      )}
    </div>
  );
}
