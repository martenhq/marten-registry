import { useEffect, useState } from "react";
import { CalendarClock, CreditCard, FileText, RefreshCw, Stethoscope } from "lucide-react";

declare const marten: any;

type Kind = "renewal" | "bill" | "appointment" | "document";
type Item = { id: string; what: string; date: string; kind?: Kind; where?: string; note?: string };

const KEY = "item/";
const shared = { shared: true };
const KINDS: { id: Kind; title: string }[] = [
  { id: "renewal", title: "Renewal" },
  { id: "bill", title: "Bill" },
  { id: "appointment", title: "Appointment" },
  { id: "document", title: "Document" },
];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const toDate = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
};
const valid = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Reads "2027-03-14", "14 Mar 2027" or "March 14, 2027"; null when it can't. */
function readDate(text: string): string | null {
  const t = text.trim();
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return d.getMonth() === Number(m[2]) - 1 ? iso(d) : null;
  }
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : iso(d);
}

function daysLeft(date: string) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((toDate(date).getTime() - today.getTime()) / 86400000);
}

function leftLabel(days: number) {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 0) return `${-days} ${days === -1 ? "day" : "days"} ago`;
  return `${days} days`;
}

function tone(days: number) {
  if (days < 0) return "text-red-700 dark:text-red-300";
  if (days <= 30) return "text-amber-700 dark:text-amber-300";
  return "text-marten-muted";
}

function KindIcon({ kind }: { kind?: Kind }) {
  if (kind === "bill") return <CreditCard size={18} />;
  if (kind === "appointment") return <Stethoscope size={18} />;
  if (kind === "document") return <FileText size={18} />;
  return <RefreshCw size={18} />;
}

export default function Renewals() {
  const [items, setItems] = useState<Item[]>([]);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let offStorage = () => {};
    let offAction = () => {};
    marten.ready.then(async (inMarten: boolean) => {
      setReady(true);
      if (!inMarten) return;
      marten.ui.setActions([{ id: "add", title: "Add date", icon: "add" }]);
      offAction = marten.ui.onAction((id: string) => id === "add" && add());
      const rows = await marten.storage.list(KEY, shared);
      setItems(rows.map((r: { value: Item }) => r.value));
      offStorage = marten.storage.subscribe(
        KEY,
        ({ key, value }: { key: string; value: Item | null }) =>
          setItems((all) => [...all.filter((i) => KEY + i.id !== key), ...(value ? [value] : [])]),
        shared,
      );
    });
    return () => {
      offStorage();
      offAction();
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const save = async (item: Item) => {
    setItems((all) => [...all.filter((i) => i.id !== item.id), item]);
    await marten.storage.set(KEY + item.id, item, shared);
  };

  async function askDate(title: string, value = "") {
    const text = await marten.ui.prompt({ title, placeholder: "2027-03-14", value, confirmLabel: "Save" });
    if (text === null || text === undefined || !text.trim()) return null;
    const date = readDate(text);
    if (!date) setNotice(`Couldn't read "${text.trim()}" as a date. Try 2027-03-14.`);
    return date;
  }

  async function add() {
    const what = await marten.ui.prompt({ title: "What's due?", placeholder: "Car insurance", confirmLabel: "Next" });
    if (!what?.trim()) return;
    const date = await askDate(`When is ${what.trim()} due?`);
    if (!date) return;
    const kind = (await marten.ui.choose({ title: "What kind?", options: KINDS })) ?? "renewal";
    await save({ id: crypto.randomUUID(), what: what.trim(), date, kind });
    marten.ui.haptic("success");
  }

  async function open(item: Item) {
    const choice = await marten.ui.choose({
      title: item.what,
      options: [
        { id: "renewed", title: "Done: set the next date" },
        { id: "date", title: "Change the date" },
        { id: "where", title: item.where ? "Change where it's kept" : "Add where it's kept" },
        { id: "delete", title: "Delete", destructive: true },
      ],
    });
    if (!choice) return;
    if (choice === "delete") {
      if (!(await marten.ui.confirm({ title: `Delete ${item.what}?`, confirmLabel: "Delete", destructive: true }))) return;
      setItems((all) => all.filter((i) => i.id !== item.id));
      await marten.storage.delete(KEY + item.id, shared);
      return;
    }
    if (choice === "where") {
      const where = await marten.ui.prompt({ title: `Where is ${item.what} kept?`, placeholder: "Blue folder, top drawer", value: item.where ?? "", confirmLabel: "Save" });
      if (where === null || where === undefined) return;
      await save({ ...item, where: where.trim() || undefined });
      return;
    }
    const suggested = valid(item.date) && choice === "renewed" ? iso(new Date(toDate(item.date).getFullYear() + 1, toDate(item.date).getMonth(), toDate(item.date).getDate())) : item.date;
    const date = await askDate(choice === "renewed" ? `Next date for ${item.what}` : `New date for ${item.what}`, suggested ?? "");
    if (!date) return;
    await save({ ...item, date });
    marten.ui.haptic("success");
  }

  const dated = items.filter((i) => valid(i.date)).sort((a, b) => a.date.localeCompare(b.date));
  const undated = items.filter((i) => !valid(i.date));
  const first = dated.find((i) => daysLeft(i.date) >= 0) ?? dated[0];
  const groups = [
    { title: "Overdue", items: dated.filter((i) => daysLeft(i.date) < 0) },
    { title: "Next 30 days", items: dated.filter((i) => daysLeft(i.date) >= 0 && daysLeft(i.date) <= 30) },
    { title: "Later", items: dated.filter((i) => daysLeft(i.date) > 30) },
    { title: "No date yet", items: undated },
  ].filter((g) => g.items.length > 0);

  if (ready && items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <CalendarClock className="text-marten-muted" size={28} />
        <p className="text-marten-muted">No dates yet. Tell Life Admin when your passport or insurance renews, or add the first one.</p>
        <button className="min-h-11 rounded-lg bg-marten-accent px-4 text-marten-accent-text" onClick={add}>
          Add a date
        </button>
        {notice && <p className="text-sm text-red-700 dark:text-red-300">{notice}</p>}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-5">
      {first && (
        <div className="mb-5">
          <p className="text-sm text-marten-muted">Next up</p>
          <p className="text-2xl font-semibold">{first.what}</p>
          <p className={"tabular-nums " + tone(daysLeft(first.date))}>
            {toDate(first.date).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })} · {leftLabel(daysLeft(first.date))}
          </p>
        </div>
      )}

      {notice && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{notice}</p>}

      {groups.map((g) => (
        <section key={g.title} className="mb-4">
          <h2 className="text-sm font-semibold text-marten-muted">{g.title}</h2>
          <ul className="divide-y divide-marten-border">
            {g.items.map((i) => {
              const days = valid(i.date) ? daysLeft(i.date) : null;
              return (
                <li key={i.id}>
                  <button className="flex min-h-12 w-full items-center gap-3 py-2 text-left" onClick={() => open(i)}>
                    <span className="text-marten-muted">
                      <KindIcon kind={i.kind} />
                    </span>
                    <span className="flex-1">
                      <span className="block text-[17px]">{i.what}</span>
                      <span className="block text-sm text-marten-muted">
                        {days !== null ? toDate(i.date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "Add a date"}
                        {i.where ? ` · ${i.where}` : ""}
                      </span>
                    </span>
                    {days !== null && <span className={"shrink-0 text-sm tabular-nums " + tone(days)}>{leftLabel(days)}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
