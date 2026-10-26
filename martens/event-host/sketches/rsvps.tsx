import { useEffect, useMemo, useRef, useState } from "react";
import { PartyPopper, Utensils } from "lucide-react";

declare const marten: any;

type Status = "yes" | "maybe" | "no" | "invited";
type Guest = { id: string; name: string; status: Status; plusOnes?: number; diet?: string; note?: string };
type EventInfo = { title?: string; date?: string; place?: string };

const KEY = "guest/";
const shared = { shared: true };

const STATUS: { id: Status; title: string; label: string; tone: string }[] = [
  { id: "yes", title: "Coming", label: "Coming", tone: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300" },
  { id: "maybe", title: "Maybe", label: "Maybe", tone: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
  { id: "no", title: "Can't come", label: "Can't come", tone: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300" },
  { id: "invited", title: "No reply yet", label: "No reply", tone: "bg-marten-bg text-marten-muted" },
];

/** Anything that isn't a known answer counts as no reply yet. */
const statusOf = (g: Guest): Status => (STATUS.some((s) => s.id === g.status) ? g.status : "invited");

function daysTo(date?: string) {
  if (!date) return null;
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((new Date(y, m - 1, d).getTime() - today.getTime()) / 86400000);
}

export default function Rsvps() {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [event, setEvent] = useState<EventInfo>({});
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
        { id: "reply", title: "My reply", icon: "done" },
        { id: "add", title: "Add guest", icon: "add" },
        { id: "event", title: "Event details", icon: "calendar" },
      ]);
      offAction = marten.ui.onAction((id: string) => actions.current[id]?.());
      const [rows, info] = await Promise.all([marten.storage.list(KEY, shared), marten.storage.get("event", shared)]);
      if (!alive) return;
      setGuests(rows.map((r: { value: Guest }) => r.value).filter(Boolean));
      if (info) setEvent(info);
      setReady(true);
      offStorage = marten.storage.subscribe(
        "",
        ({ key, value }: { key: string; value: any }) => {
          if (key === "event") setEvent(value ?? {});
          if (key.startsWith(KEY)) setGuests((all) => [...all.filter((g) => KEY + g.id !== key), ...(value ? [value] : [])]);
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

  const counts = useMemo(() => {
    const c = { heads: 0, yes: 0, maybe: 0, maybeHeads: 0, no: 0, invited: 0 };
    for (const g of guests) {
      const party = 1 + Math.max(0, g.plusOnes ?? 0);
      const status = statusOf(g);
      if (status === "yes") {
        c.yes++;
        c.heads += party;
      } else if (status === "maybe") {
        c.maybe++;
        c.maybeHeads += party;
      } else if (status === "no") c.no++;
      else c.invited++;
    }
    return c;
  }, [guests]);

  const diets = guests.filter((g) => g.diet?.trim() && (statusOf(g) === "yes" || statusOf(g) === "maybe"));

  const save = async (guest: Guest) => {
    setGuests((all) => [...all.filter((g) => g.id !== guest.id), guest]);
    await marten.storage.set(KEY + guest.id, guest, shared);
  };

  const chooseStatus = (title: string) =>
    marten.ui.choose({ title, options: STATUS.map((s) => ({ id: s.id, title: s.title })) }) as Promise<Status | null>;

  async function myReply() {
    const me = marten.viewer?.name;
    if (!me) return;
    const mine = guests.find((g) => g.name.toLowerCase() === me.toLowerCase());
    const status = await chooseStatus("Are you coming?");
    if (!status) return;
    await save({ ...(mine ?? { id: crypto.randomUUID(), name: me, plusOnes: 0 }), status });
    marten.ui.haptic("success");
  }

  async function addGuest() {
    const text = await marten.ui.prompt({ title: "Add guests", placeholder: "Names, separated by commas", confirmLabel: "Add" });
    const names = String(text ?? "")
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);
    const known = new Set(guests.map((g) => g.name.toLowerCase()));
    await Promise.all(
      names.filter((n) => !known.has(n.toLowerCase())).map((name) => save({ id: crypto.randomUUID(), name, status: "invited", plusOnes: 0 })),
    );
    if (names.length) marten.ui.haptic("light");
  }

  async function editEvent() {
    const title = await marten.ui.prompt({ title: "What's the event?", placeholder: "Birthday party", value: event.title ?? "", confirmLabel: "Next" });
    if (title == null) return;
    const date = await marten.ui.prompt({ title: "Which date?", placeholder: "YYYY-MM-DD", value: event.date ?? "", confirmLabel: "Save" });
    if (date == null) return;
    const next = { ...event, title: title.trim() || undefined, date: /^\d{4}-\d{2}-\d{2}$/.test(date.trim()) ? date.trim() : event.date };
    setEvent(next);
    await marten.storage.set("event", next, shared);
  }

  async function edit(g: Guest) {
    const choice = await marten.ui.choose({
      title: g.name,
      options: [
        ...STATUS.filter((s) => s.id !== statusOf(g)).map((s) => ({ id: s.id, title: s.title })),
        { id: "plus", title: "Plus ones…" },
        { id: "diet", title: "Dietary needs…" },
        { id: "remove", title: "Remove guest", destructive: true },
      ],
    });
    if (!choice) return;
    if (STATUS.some((s) => s.id === choice)) return save({ ...g, status: choice as Status });
    if (choice === "plus") {
      const raw = await marten.ui.prompt({ title: `How many is ${g.name} bringing?`, value: String(g.plusOnes ?? 0), confirmLabel: "Save" });
      if (raw == null) return;
      const n = Number.parseInt(raw, 10);
      if (Number.isFinite(n) && n >= 0) await save({ ...g, plusOnes: n });
    } else if (choice === "diet") {
      const diet = await marten.ui.prompt({ title: `${g.name}'s dietary needs`, placeholder: "Vegetarian, no nuts", value: g.diet ?? "", confirmLabel: "Save" });
      if (diet != null) await save({ ...g, diet: diet.trim() || undefined });
    } else if (choice === "remove") {
      if (!(await marten.ui.confirm({ title: `Remove ${g.name}?`, message: "They come off the guest list for everyone.", confirmLabel: "Remove", destructive: true }))) return;
      setGuests((all) => all.filter((x) => x.id !== g.id));
      await marten.storage.delete(KEY + g.id, shared);
    }
  }

  actions.current = { reply: myReply, add: addGuest, event: editEvent };

  if (!ready) return null;

  const days = daysTo(event.date);
  const when =
    days == null ? null : days > 1 ? `in ${days} days` : days === 1 ? "tomorrow" : days === 0 ? "today" : "was " + (-days === 1 ? "yesterday" : `${-days} days ago`);

  if (guests.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <PartyPopper className="text-marten-muted" size={28} />
        <p className="text-marten-muted">
          No replies yet. Say "I'm in" in the chat, or add the guest list.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <button className="min-h-11 rounded-lg bg-marten-accent px-4 text-marten-accent-text" onClick={myReply}>
            Reply
          </button>
          <button className="min-h-11 rounded-lg border border-marten-border px-4" onClick={addGuest}>
            Add guests
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-5">
      {(event.title || when) && <p className="text-sm text-marten-muted">{[event.title, when].filter(Boolean).join(" · ")}</p>}
      <p className="text-3xl font-semibold tabular-nums">
        {counts.heads} coming
        {counts.maybeHeads > 0 && <span className="text-xl font-normal text-marten-muted"> + {counts.maybeHeads} maybe</span>}
      </p>

      <section className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-3">
        {[
          { label: "Coming", n: counts.yes },
          { label: "Maybe", n: counts.maybe },
          { label: "Can't come", n: counts.no },
          { label: "No reply", n: counts.invited },
        ].map((t) => (
          <div key={t.label} className="rounded-xl border border-marten-border bg-marten-surface p-3">
            <p className="text-2xl font-semibold tabular-nums">{t.n}</p>
            <p className="text-sm text-marten-muted">{t.label}</p>
          </div>
        ))}
      </section>

      {diets.length > 0 && (
        <section className="mt-5 rounded-xl border border-marten-border bg-marten-surface p-4">
          <p className="mb-2 flex items-center gap-2 font-medium">
            <Utensils size={16} className="text-marten-muted" /> Dietary needs
          </p>
          <ul className="flex flex-col gap-1">
            {diets.map((g) => (
              <li key={g.id} className="text-sm">
                <span className="font-medium">{g.name}</span>
                <span className="text-marten-muted"> · {g.diet}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {STATUS.map((s) => {
        const list = guests.filter((g) => statusOf(g) === s.id).sort((a, b) => a.name.localeCompare(b.name));
        if (!list.length) return null;
        return (
          <section key={s.id} className="mt-6">
            <p className="text-sm text-marten-muted">
              {s.label} · {list.length}
            </p>
            <ul className="divide-y divide-marten-border">
              {list.map((g) => (
                <li key={g.id}>
                  <button className="flex min-h-12 w-full items-center gap-3 py-2 text-left" onClick={() => edit(g)}>
                    <span className="flex-1">
                      {g.name}
                      {(g.plusOnes ?? 0) > 0 && <span className="text-marten-muted"> +{g.plusOnes}</span>}
                      {(g.diet || g.note) && (
                        <span className="block text-sm text-marten-muted">{[g.diet, g.note].filter(Boolean).join(" · ")}</span>
                      )}
                    </span>
                    <span className={"rounded-lg px-2 py-1 text-xs " + s.tone}>{s.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
