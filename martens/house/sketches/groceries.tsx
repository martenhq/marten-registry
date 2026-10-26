import { useEffect, useRef, useState } from "react";
import { Check, ShoppingBasket, Trash2 } from "lucide-react";

declare const marten: any;

type Item = { id: string; name: string; addedBy?: string; bought: boolean; at: string };

const KEY = "item/";
const shared = { shared: true };

export default function Groceries() {
  const [items, setItems] = useState<Item[]>([]);
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
        { id: "add", title: "Add item", icon: "add" },
        { id: "clear", title: "Clear bought", icon: "delete" },
      ]);
      offAction = marten.ui.onAction((id: string) => actions.current[id]?.());
      const rows = await marten.storage.list(KEY, shared);
      if (!alive) return;
      setItems(rows.map((r: { value: Item }) => r.value).filter(Boolean));
      setReady(true);
      offStorage = marten.storage.subscribe(
        KEY,
        ({ key, value }: { key: string; value: Item | null }) =>
          setItems((all) => [...all.filter((i) => KEY + i.id !== key), ...(value ? [value] : [])]),
        shared,
      );
    });
    return () => {
      alive = false;
      offStorage();
      offAction();
    };
  }, []);

  const save = async (item: Item) => {
    setItems((all) => [...all.filter((i) => i.id !== item.id), item]);
    await marten.storage.set(KEY + item.id, item, shared);
  };

  async function add() {
    const text = await marten.ui.prompt({ title: "Add to the list", placeholder: "Oat milk, eggs, bread", confirmLabel: "Add" });
    const names = String(text ?? "")
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);
    if (!names.length) return;
    const have = new Set(items.filter((i) => !i.bought).map((i) => i.name.toLowerCase()));
    const fresh = names.filter((n) => !have.has(n.toLowerCase()));
    const at = new Date().toISOString();
    await Promise.all(fresh.map((name) => save({ id: crypto.randomUUID(), name, addedBy: marten.viewer?.name, bought: false, at })));
    marten.ui.haptic("light");
  }

  async function toggle(item: Item) {
    await save({ ...item, bought: !item.bought });
    const left = items.filter((i) => !i.bought && i.id !== item.id).length;
    marten.ui.haptic(!item.bought && left === 0 ? "success" : "selection");
  }

  async function remove(item: Item) {
    if (!(await marten.ui.confirm({ title: `Delete ${item.name}?`, confirmLabel: "Delete", destructive: true }))) return;
    setItems((all) => all.filter((i) => i.id !== item.id));
    await marten.storage.delete(KEY + item.id, shared);
  }

  async function clearBought() {
    const bought = items.filter((i) => i.bought);
    if (!bought.length) return;
    const ok = await marten.ui.confirm({
      title: `Clear ${bought.length} bought ${bought.length === 1 ? "item" : "items"}?`,
      message: "They come off the list for everyone.",
      confirmLabel: "Clear",
      destructive: true,
    });
    if (!ok) return;
    setItems((all) => all.filter((i) => !i.bought));
    await Promise.all(bought.map((i) => marten.storage.delete(KEY + i.id, shared)));
  }

  actions.current = { add, clear: clearBought };

  if (!ready) return null;

  const toGet = items.filter((i) => !i.bought).sort((a, b) => (a.at < b.at ? -1 : 1));
  const bought = items.filter((i) => i.bought).sort((a, b) => a.name.localeCompare(b.name));

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <ShoppingBasket className="text-marten-muted" size={28} />
        <p className="text-marten-muted">The list is empty. Say what you're out of in the chat, or add the first thing.</p>
        <button className="min-h-11 rounded-lg bg-marten-accent px-4 text-marten-accent-text" onClick={add}>
          Add an item
        </button>
      </div>
    );
  }

  const row = (i: Item) => (
    <li key={i.id} className="flex min-h-12 items-center gap-1 pl-4">
      <button className="flex min-h-12 flex-1 items-center gap-3 text-left" onClick={() => toggle(i)}>
        <span
          className={
            "flex size-6 shrink-0 items-center justify-center rounded-full border " +
            (i.bought ? "border-marten-accent bg-marten-accent text-marten-accent-text" : "border-marten-border")
          }
        >
          {i.bought && <Check size={14} />}
        </span>
        <span className="flex-1">
          <span className={i.bought ? "text-marten-muted line-through" : ""}>{i.name}</span>
          {i.addedBy && !i.bought && <span className="block text-sm text-marten-muted">added by {i.addedBy}</span>}
        </span>
      </button>
      <button aria-label={`Delete ${i.name}`} className="flex size-11 items-center justify-center text-marten-muted" onClick={() => remove(i)}>
        <Trash2 size={18} />
      </button>
    </li>
  );

  return (
    <div className="mx-auto max-w-xl p-5">
      <p className="text-sm text-marten-muted">To get</p>
      <p className="text-3xl font-semibold tabular-nums">{toGet.length === 0 ? "All done" : toGet.length}</p>
      {toGet.length > 0 && <ul className="mt-4 divide-y divide-marten-border rounded-xl border border-marten-border bg-marten-surface">{toGet.map(row)}</ul>}
      {bought.length > 0 && (
        <>
          <p className="mt-6 text-sm text-marten-muted">In the basket</p>
          <ul className="divide-y divide-marten-border">{bought.map(row)}</ul>
        </>
      )}
    </div>
  );
}
