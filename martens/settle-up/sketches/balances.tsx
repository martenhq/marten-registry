import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, Scale } from "lucide-react";

declare const marten: any;

type Expense = {
  id: string;
  kind: "expense";
  what: string;
  amount: number;
  currency: string;
  paidBy: string;
  among: string[];
  shares?: Record<string, number>;
  date: string;
};
type Payment = { id: string; kind: "payment"; from: string; to: string; amount: number; currency: string; date: string };
type Entry = Expense | Payment;
type Member = { id: string; name: string; kind: string };
type Transfer = { from: string; to: string; cents: number; currency: string };

const KEY = "entry/";
const shared = { shared: true };
const CURRENCIES = ["USD", "EUR", "GBP", "INR", "AUD", "CAD", "JPY", "CHF", "SGD"];

const today = () => new Date().toISOString().slice(0, 10);
const toCents = (n: number) => Math.round(n * 100);

function money(cents: number, currency: string) {
  const n = cents / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

/** Each person's share of an expense in cents; leftover cents go one each to the first people. */
function sharesOf(e: Expense, everyone: string[]): Record<string, number> {
  if (e.shares && Object.keys(e.shares).length) {
    return Object.fromEntries(Object.entries(e.shares).map(([n, a]) => [n, toCents(a)]));
  }
  const among = e.among?.length ? e.among : everyone;
  if (!among.length) return {};
  const total = toCents(e.amount);
  const base = Math.floor(total / among.length);
  let left = total - base * among.length;
  const out: Record<string, number> = {};
  for (const n of among) {
    out[n] = (out[n] ?? 0) + base + (left > 0 ? 1 : 0);
    if (left > 0) left--;
  }
  return out;
}

/** Balances per currency (positive: is owed), then the fewest transfers that settle them. */
function settle(entries: Entry[], everyone: string[]) {
  const balances: Record<string, Record<string, number>> = {};
  const add = (currency: string, name: string, cents: number) => {
    const b = (balances[currency] ??= {});
    b[name] = (b[name] ?? 0) + cents;
  };
  for (const e of entries) {
    if (e.kind === "payment") {
      add(e.currency, e.from, toCents(e.amount));
      add(e.currency, e.to, -toCents(e.amount));
    } else {
      add(e.currency, e.paidBy, toCents(e.amount));
      for (const [n, c] of Object.entries(sharesOf(e, everyone))) add(e.currency, n, -c);
    }
  }
  const transfers: Transfer[] = [];
  for (const [currency, b] of Object.entries(balances)) {
    const owed = Object.entries(b).filter(([, c]) => c > 0).map(([n, c]) => ({ n, c }));
    const owing = Object.entries(b).filter(([, c]) => c < 0).map(([n, c]) => ({ n, c: -c }));
    while (owed.length && owing.length) {
      owed.sort((x, y) => y.c - x.c);
      owing.sort((x, y) => y.c - x.c);
      const to = owed[0]!;
      const from = owing[0]!;
      const cents = Math.min(to.c, from.c);
      if (cents > 0) transfers.push({ from: from.n, to: to.n, cents, currency });
      to.c -= cents;
      from.c -= cents;
      if (to.c <= 0) owed.shift();
      if (from.c <= 0) owing.shift();
    }
  }
  return { balances, transfers };
}

export default function Balances() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [people, setPeople] = useState<string[]>([]);
  const [currency, setCurrency] = useState("USD");
  const [ready, setReady] = useState(false);
  const actions = useRef<Record<string, () => void>>({});

  useEffect(() => {
    let alive = true;
    let offStorage = () => {};
    let offAction = () => {};
    marten.ready.then(async (inMarten: boolean) => {
      if (!alive) return;
      if (!inMarten) return setReady(true);
      marten.ui.setActions([
        { id: "expense", title: "Add expense", icon: "add" },
        { id: "payment", title: "Record payment", icon: "done" },
        { id: "currency", title: "Currency", icon: "settings" },
      ]);
      offAction = marten.ui.onAction((id: string) => actions.current[id]?.());
      const [rows, members, settings] = await Promise.all([
        marten.storage.list(KEY, shared),
        marten.members(),
        marten.storage.get("settings", shared),
      ]);
      if (!alive) return;
      setEntries(rows.map((r: { value: Entry }) => r.value).filter(Boolean));
      setPeople(members.filter((m: Member) => m.kind === "person").map((m: Member) => m.name));
      if (settings?.currency) setCurrency(settings.currency);
      setReady(true);
      offStorage = marten.storage.subscribe(
        "",
        ({ key, value }: { key: string; value: any }) => {
          if (key === "settings" && value?.currency) setCurrency(value.currency);
          if (key.startsWith(KEY)) setEntries((all) => [...all.filter((e) => KEY + e.id !== key), ...(value ? [value] : [])]);
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

  const names = useMemo(() => {
    const seen = new Set(people);
    for (const e of entries) {
      if (e.kind === "payment") seen.add(e.from).add(e.to);
      else {
        seen.add(e.paidBy);
        for (const n of e.among ?? []) seen.add(n);
        for (const n of Object.keys(e.shares ?? {})) seen.add(n);
      }
    }
    return [...seen];
  }, [people, entries]);

  const { balances, transfers } = useMemo(() => settle(entries, people), [entries, people]);
  const history = useMemo(() => [...entries].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)), [entries]);

  const save = async (entry: Entry) => {
    setEntries((all) => [...all.filter((e) => e.id !== entry.id), entry]);
    await marten.storage.set(KEY + entry.id, entry, shared);
  };

  const pickPerson = async (title: string) => {
    const choice = await marten.ui.pick({ title, items: names.map((n) => ({ id: n, title: n })), allowCustom: true });
    return (choice?.id ?? choice?.text ?? "").trim() || null;
  };

  async function addExpense() {
    const what = (await marten.ui.prompt({ title: "What was it?", placeholder: "Dinner", confirmLabel: "Next" }))?.trim();
    if (!what) return;
    const raw = await marten.ui.prompt({ title: `How much was ${what}? (${currency})`, placeholder: "84.00", confirmLabel: "Next" });
    const amount = Number(String(raw ?? "").replace(/[^\d.]/g, ""));
    if (!amount) return;
    const paidBy = await pickPerson("Who paid?");
    if (!paidBy) return;
    const split = await marten.ui.choose({
      title: "Split between",
      options: [
        { id: "all", title: "Everyone, equally" },
        { id: "some", title: "Only some of us" },
      ],
    });
    if (!split) return;
    let among = names;
    if (split === "some") {
      const list = await marten.ui.prompt({ title: "Who's in it?", placeholder: "Names, separated by commas", value: names.join(", "), confirmLabel: "Add" });
      among = String(list ?? "").split(",").map((n) => n.trim()).filter(Boolean);
      if (!among.length) return;
    }
    await save({ id: crypto.randomUUID(), kind: "expense", what, amount, currency, paidBy, among, date: today() });
    marten.ui.haptic("success");
  }

  async function addPayment() {
    const from = await pickPerson("Who paid?");
    if (!from) return;
    const to = await pickPerson(`Who did ${from} pay?`);
    if (!to || to === from) return;
    const raw = await marten.ui.prompt({ title: `How much? (${currency})`, placeholder: "20.00", confirmLabel: "Record" });
    const amount = Number(String(raw ?? "").replace(/[^\d.]/g, ""));
    if (!amount) return;
    await save({ id: crypto.randomUUID(), kind: "payment", from, to, amount, currency, date: today() });
    marten.ui.haptic("success");
  }

  async function markPaid(t: Transfer) {
    const ok = await marten.ui.confirm({
      title: `${t.from} paid ${t.to} ${money(t.cents, t.currency)}?`,
      message: "This records the payment for everyone.",
      confirmLabel: "Record payment",
    });
    if (!ok) return;
    await save({ id: crypto.randomUUID(), kind: "payment", from: t.from, to: t.to, amount: t.cents / 100, currency: t.currency, date: today() });
    marten.ui.haptic("success");
  }

  async function pickCurrency() {
    const choice = await marten.ui.choose({ title: "Currency for new expenses", options: CURRENCIES.map((c) => ({ id: c, title: c })) });
    if (!choice) return;
    setCurrency(choice);
    await marten.storage.set("settings", { currency: choice }, shared);
  }

  async function remove(e: Entry) {
    const label = e.kind === "payment" ? `${e.from}'s payment to ${e.to}` : e.what;
    if (!(await marten.ui.confirm({ title: `Delete ${label}?`, message: "Balances change for everyone.", confirmLabel: "Delete", destructive: true }))) return;
    setEntries((all) => all.filter((x) => x.id !== e.id));
    await marten.storage.delete(KEY + e.id, shared);
  }

  actions.current = { expense: addExpense, payment: addPayment, currency: pickCurrency };

  if (!ready) return null;

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <Scale className="text-marten-muted" size={28} />
        <p className="text-marten-muted">Nothing logged yet. Say what you paid in the chat, or add the first expense.</p>
        <button className="min-h-11 rounded-lg bg-marten-accent px-4 text-marten-accent-text" onClick={addExpense}>
          Add an expense
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-5">
      <p className="text-sm text-marten-muted">To settle up</p>
      {transfers.length === 0 ? (
        <p className="mt-1 flex items-center gap-2 text-2xl font-semibold">
          <Check className="text-green-700 dark:text-green-300" size={24} /> Everyone's square
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {transfers.map((t) => (
            <li key={`${t.currency}-${t.from}-${t.to}`} className="flex min-h-12 items-center gap-3 rounded-xl border border-marten-border bg-marten-surface px-4 py-2">
              <span className="flex flex-1 flex-wrap items-center gap-x-2">
                <span className="font-medium">{t.from}</span>
                <ArrowRight className="text-marten-muted" size={16} />
                <span className="font-medium">{t.to}</span>
              </span>
              <span className="font-semibold tabular-nums">{money(t.cents, t.currency)}</span>
              <button className="min-h-11 rounded-lg px-3 text-sm text-marten-accent" onClick={() => markPaid(t)}>
                Paid
              </button>
            </li>
          ))}
        </ul>
      )}

      {Object.entries(balances).map(([cur, b]) => (
        <section key={cur} className="mt-6">
          <p className="mb-2 text-sm text-marten-muted">Balances · {cur}</p>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
            {Object.entries(b)
              .sort((x, y) => y[1] - x[1])
              .map(([n, c]) => (
                <div key={n} className="rounded-xl border border-marten-border bg-marten-surface p-3">
                  <p className="font-medium">{n}</p>
                  <p
                    className={
                      "text-sm tabular-nums " +
                      (c > 0 ? "text-green-700 dark:text-green-300" : c < 0 ? "text-red-700 dark:text-red-300" : "text-marten-muted")
                    }
                  >
                    {c > 0 ? `is owed ${money(c, cur)}` : c < 0 ? `owes ${money(-c, cur)}` : "square"}
                  </p>
                </div>
              ))}
          </div>
        </section>
      ))}

      <p className="mt-6 text-sm text-marten-muted">History</p>
      <ul className="divide-y divide-marten-border">
        {history.map((e) => (
          <li key={e.id}>
            <button className="flex min-h-12 w-full items-center gap-3 py-2 text-left" onClick={() => remove(e)}>
              {e.kind === "payment" ? (
                <span className="flex-1">
                  {e.from} paid {e.to}
                  <span className="block text-sm text-marten-muted">payment · {e.date}</span>
                </span>
              ) : (
                <span className="flex-1">
                  {e.what}
                  <span className="block text-sm text-marten-muted">
                    paid by {e.paidBy} ·{" "}
                    {e.shares ? "custom split" : e.among?.length ? `split ${e.among.length} ways` : "split equally"} · {e.date}
                  </span>
                </span>
              )}
              <span className="tabular-nums">{money(toCents(e.amount), e.currency)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
