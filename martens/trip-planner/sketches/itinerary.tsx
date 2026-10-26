import { useEffect, useState } from "react";
import { MapPin, Plus, Trash2 } from "lucide-react";

declare const marten: any;

type Item = { id: string; time?: string; text: string };
type Day = { id: string; order: number; title: string; date?: string; note?: string; items: Item[] };

const KEY = "day/";
const shared = { shared: true };

export default function Itinerary() {
  const [days, setDays] = useState<Day[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let offStorage = () => {};
    let offAction = () => {};
    marten.ready.then(async (inMarten: boolean) => {
      setReady(true);
      if (!inMarten) return;
      marten.ui.setActions([{ id: "add-day", title: "Add day", icon: "add" }]);
      offAction = marten.ui.onAction((id: string) => id === "add-day" && addDay());
      const rows = await marten.storage.list(KEY, shared);
      setDays(rows.map((r: { value: Day }) => r.value));
      offStorage = marten.storage.subscribe(
        KEY,
        ({ key, value }: { key: string; value: Day | null }) =>
          setDays((all) => [...all.filter((d) => KEY + d.id !== key), ...(value ? [value] : [])]),
        shared,
      );
    });
    return () => {
      offStorage();
      offAction();
    };
  }, []);

  const save = async (day: Day) => {
    setDays((all) => [...all.filter((d) => d.id !== day.id), day]);
    await marten.storage.set(KEY + day.id, day, shared);
  };

  async function addDay() {
    const title = await marten.ui.prompt({ title: "Add a day", placeholder: "Day 1 · Arrive", confirmLabel: "Add" });
    if (!title?.trim()) return;
    setDays((all) => {
      const day = { id: crypto.randomUUID(), order: all.length ? Math.max(...all.map((d) => d.order)) + 1 : 1, title: title.trim(), items: [] };
      marten.storage.set(KEY + day.id, day, shared);
      return [...all, day];
    });
  }

  async function addItem(day: Day) {
    const text = await marten.ui.prompt({ title: `Add to ${day.title}`, placeholder: "10:00 Beach at Palolem", confirmLabel: "Add" });
    if (!text?.trim()) return;
    const match = /^(\d{1,2}[:.]\d{2})\s+(.*)$/.exec(text.trim());
    const item = match ? { id: crypto.randomUUID(), time: match[1]!.replace(".", ":"), text: match[2]! } : { id: crypto.randomUUID(), text: text.trim() };
    await save({ ...day, items: [...day.items, item] });
    marten.ui.haptic("light");
  }

  async function removeDay(day: Day) {
    if (!(await marten.ui.confirm({ title: `Remove ${day.title}?`, confirmLabel: "Remove", destructive: true }))) return;
    setDays((all) => all.filter((d) => d.id !== day.id));
    await marten.storage.delete(KEY + day.id, shared);
  }

  const sorted = [...days].sort((a, b) => a.order - b.order);
  const stops = sorted.reduce((n, d) => n + d.items.length, 0);

  if (ready && sorted.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <MapPin className="text-marten-muted" size={28} />
        <p className="text-marten-muted">No plan yet. Tell Trip Planner where you're going, or add the first day.</p>
        <button className="min-h-11 rounded-lg bg-marten-accent px-4 text-marten-accent-text" onClick={addDay}>
          Add a day
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-5">
      <p className="mb-4 text-sm text-marten-muted tabular-nums">
        {sorted.length} {sorted.length === 1 ? "day" : "days"} · {stops} {stops === 1 ? "plan" : "plans"}
      </p>
      <ol className="flex flex-col gap-3">
        {sorted.map((day) => (
          <li key={day.id} className="rounded-xl border border-marten-border bg-marten-surface p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="font-semibold">{day.title}</h2>
                {day.date && <p className="text-sm text-marten-muted">{day.date}</p>}
              </div>
              <button aria-label={`Remove ${day.title}`} className="flex size-11 items-center justify-center text-marten-muted" onClick={() => removeDay(day)}>
                <Trash2 size={18} />
              </button>
            </div>
            {day.items.length > 0 && (
              <ul className="mt-2 flex flex-col divide-y divide-marten-border">
                {day.items.map((item) => (
                  <li key={item.id} className="flex min-h-11 items-center gap-3">
                    <span className="w-12 shrink-0 text-sm text-marten-muted tabular-nums">{item.time ?? ""}</span>
                    <span>{item.text}</span>
                  </li>
                ))}
              </ul>
            )}
            {day.note && <p className="mt-2 text-sm text-marten-muted">{day.note}</p>}
            <button className="mt-2 flex min-h-11 items-center gap-2 text-sm text-marten-accent" onClick={() => addItem(day)}>
              <Plus size={16} /> Add a plan
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
