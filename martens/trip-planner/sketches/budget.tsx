import { useEffect, useMemo, useRef, useState } from "react";
import { Wallet } from "lucide-react";

declare const marten: any;

type Cost = { id: string; what: string; amount: number; paidBy: string; split: string[] };
type Member = { id: string; name: string; kind: string };

const KEY = "cost/";
const shared = { shared: true };

const money = (n: number, currency: string) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);

export default function Budget() {
  const [costs, setCosts] = useState<Cost[]>([]);
  const [people, setPeople] = useState<Member[]>([]);
  const [currency, setCurrency] = useState("USD");
  const [ready, setReady] = useState(false);
  // The header's actions are registered once, so they read the members from here, not from the first render.
  const peopleRef = useRef<Member[]>([]);
  peopleRef.current = people;

  useEffect(() => {
    let offStorage = () => {};
    let offAction = () => {};
    marten.ready.then(async (inMarten: boolean) => {
      setReady(true);
      if (!inMarten) return;
      marten.ui.setActions([
        { id: "add", title: "Add cost", icon: "add" },
        { id: "currency", title: "Currency", icon: "settings" },
      ]);
      offAction = marten.ui.onAction((id: string) => (id === "add" ? add() : id === "currency" ? pickCurrency() : null));
      const [rows, members, settings] = await Promise.all([
        marten.storage.list(KEY, shared),
        marten.members(),
        marten.storage.get("settings", shared),
      ]);
      setCosts(rows.map((r: { value: Cost }) => r.value));
      setPeople(members.filter((m: Member) => m.kind === "person"));
      if (settings?.currency) setCurrency(settings.currency);
      offStorage = marten.storage.subscribe(
        "",
        ({ key, value }: { key: string; value: any }) => {
          if (key === "settings" && value?.currency) setCurrency(value.currency);
          if (key.startsWith(KEY)) setCosts((all) => [...all.filter((c) => KEY + c.id !== key), ...(value ? [value] : [])]);
        },
        shared,
      );
    });
    return () => {
      offStorage();
      offAction();
    };
  }, []);

  async function add() {
    const what = await marten.ui.prompt({ title: "What was it?", placeholder: "Flights", confirmLabel: "Next" });
    if (!what?.trim()) return;
    const raw = await marten.ui.prompt({ title: `How much was ${what.trim()}?`, placeholder: "240", confirmLabel: "Next" });
    const amount = Number(String(raw ?? "").replace(/[^\d.]/g, ""));
    if (!amount) return;
    const payer = await marten.ui.pick({
      title: "Who paid?",
      items: peopleRef.current.map((p) => ({ id: p.name, title: p.name })),
      allowCustom: true,
    });
    const paidBy = payer?.id ?? payer?.text ?? marten.viewer?.name;
    if (!paidBy) return;
    const cost = { id: crypto.randomUUID(), what: what.trim(), amount, paidBy, split: [] };
    setCosts((all) => [...all, cost]);
    await marten.storage.set(KEY + cost.id, cost, shared);
    marten.ui.haptic("success");
  }

  async function pickCurrency() {
    const choice = await marten.ui.choose({
      title: "Currency",
      options: ["USD", "EUR", "GBP", "INR", "AUD", "CAD", "JPY"].map((c) => ({ id: c, title: c })),
    });
    if (!choice) return;
    setCurrency(choice);
    await marten.storage.set("settings", { currency: choice }, shared);
  }

  async function remove(cost: Cost) {
    if (!(await marten.ui.confirm({ title: `Delete ${cost.what}?`, confirmLabel: "Delete", destructive: true }))) return;
    setCosts((all) => all.filter((c) => c.id !== cost.id));
    await marten.storage.delete(KEY + cost.id, shared);
  }

  const { total, names, paid, share } = useMemo(() => {
    const names = [...new Set([...people.map((p) => p.name), ...costs.map((c) => c.paidBy), ...costs.flatMap((c) => c.split)])];
    const paid: Record<string, number> = {};
    const share: Record<string, number> = {};
    for (const n of names) paid[n] = share[n] = 0;
    for (const c of costs) {
      paid[c.paidBy] = (paid[c.paidBy] ?? 0) + c.amount;
      const among = c.split.length ? c.split : names;
      for (const n of among) share[n] = (share[n] ?? 0) + c.amount / among.length;
    }
    return { total: costs.reduce((s, c) => s + c.amount, 0), names, paid, share };
  }, [costs, people]);

  if (ready && costs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <Wallet className="text-marten-muted" size={28} />
        <p className="text-marten-muted">No costs yet. Say what you've booked, or add the first one.</p>
        <button className="min-h-11 rounded-lg bg-marten-accent px-4 text-marten-accent-text" onClick={add}>
          Add a cost
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-5">
      <p className="text-sm text-marten-muted">Trip total</p>
      <p className="text-3xl font-semibold tabular-nums">{money(total, currency)}</p>

      <section className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
        {names.map((n) => {
          const balance = (paid[n] ?? 0) - (share[n] ?? 0);
          return (
            <div key={n} className="rounded-xl border border-marten-border bg-marten-surface p-3">
              <p className="font-medium">{n}</p>
              <p className="text-sm text-marten-muted tabular-nums">share {money(share[n] ?? 0, currency)}</p>
              <p className={"text-sm tabular-nums " + (balance >= 0 ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300")}>
                {balance >= 0 ? "is owed " : "owes "}
                {money(Math.abs(balance), currency)}
              </p>
            </div>
          );
        })}
      </section>

      <ul className="mt-5 divide-y divide-marten-border">
        {[...costs].reverse().map((c) => (
          <li key={c.id}>
            <button className="flex min-h-12 w-full items-center gap-3 text-left" onClick={() => remove(c)}>
              <span className="flex-1">
                {c.what}
                <span className="block text-sm text-marten-muted">paid by {c.paidBy}</span>
              </span>
              <span className="tabular-nums">{money(c.amount, currency)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
