import { useEffect, useMemo, useRef, useState } from "react";
import { Crown, Dices } from "lucide-react";

declare const marten: any;

type Result = { name: string; place: number; points?: number };
type Game = { id: string; game: string; date: string; season: string; results: Result[] };
type Member = { id: string; name: string; kind: string };
type Row = { name: string; played: number; wins: number; points: number };

const KEY = "game/";
const shared = { shared: true };
const FIRST_SEASON = "Season 1";

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Season points: one for every player who finished below you in that game. */
function standings(games: Game[]): Row[] {
  const rows: Record<string, Row> = {};
  for (const g of games) {
    for (const r of g.results ?? []) {
      const row = (rows[r.name] ??= { name: r.name, played: 0, wins: 0, points: 0 });
      row.played++;
      if (r.place === 1) row.wins++;
      row.points += g.results.filter((o) => o.place > r.place).length;
    }
  }
  return Object.values(rows).sort(
    (a, b) => b.points - a.points || b.wins - a.wins || a.played - b.played || a.name.localeCompare(b.name),
  );
}

/** "A, B = C, D" → A 1st, B and C tied 2nd, D 4th. */
function parseOrder(text: string): Result[] {
  const results: Result[] = [];
  let place = 1;
  for (const group of text.split(",")) {
    const names = group
      .split("=")
      .map((n) => n.trim())
      .filter(Boolean);
    for (const name of names) results.push({ name, place });
    place += names.length;
  }
  return results;
}

const placeLabel = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
};

export default function Scoreboard() {
  const [games, setGames] = useState<Game[]>([]);
  const [people, setPeople] = useState<string[]>([]);
  const [season, setSeason] = useState(FIRST_SEASON);
  const [viewing, setViewing] = useState<string | null>(null);
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
        { id: "add", title: "Add game", icon: "add" },
        { id: "season", title: "New season", icon: "star" },
      ]);
      offAction = marten.ui.onAction((id: string) => actions.current[id]?.());
      const [rows, members, settings] = await Promise.all([
        marten.storage.list(KEY, shared),
        marten.members(),
        marten.storage.get("settings", shared),
      ]);
      if (!alive) return;
      setGames(rows.map((r: { value: Game }) => r.value).filter(Boolean));
      setPeople(members.filter((m: Member) => m.kind === "person").map((m: Member) => m.name));
      if (settings?.season) setSeason(settings.season);
      setReady(true);
      offStorage = marten.storage.subscribe(
        "",
        ({ key, value }: { key: string; value: any }) => {
          if (key === "settings" && value?.season) setSeason(value.season);
          if (key.startsWith(KEY)) setGames((all) => [...all.filter((g) => KEY + g.id !== key), ...(value ? [value] : [])]);
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

  const seasons = useMemo(() => {
    const seen = [...new Set(games.map((g) => g.season || FIRST_SEASON))];
    if (!seen.includes(season)) seen.push(season);
    const first = (s: string) => games.filter((g) => (g.season || FIRST_SEASON) === s).reduce((m, g) => (g.date < m ? g.date : m), "9999");
    return seen.sort((a, b) => (a === season ? 1 : b === season ? -1 : first(a) < first(b) ? -1 : 1));
  }, [games, season]);

  const shown = viewing && seasons.includes(viewing) ? viewing : season;
  const inSeason = useMemo(
    () => games.filter((g) => (g.season || FIRST_SEASON) === shown).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [games, shown],
  );
  const table = useMemo(() => standings(inSeason), [inSeason]);

  async function addGame() {
    const game = (await marten.ui.prompt({ title: "What did you play?", placeholder: "Catan", confirmLabel: "Next" }))?.trim();
    if (!game) return;
    const order = await marten.ui.prompt({
      title: "Finishing order, winner first",
      placeholder: "Names by commas; = for a tie",
      value: people.join(", "),
      confirmLabel: "Next",
    });
    const results = parseOrder(String(order ?? ""));
    if (results.length < 2) return;
    const raw = await marten.ui.prompt({ title: "Scores, same order (optional)", placeholder: "10, 8, 8, 5", confirmLabel: "Save" });
    if (raw != null && raw.trim()) {
      const scores = String(raw).split(",").map((s) => Number(s.trim()));
      results.forEach((r, i) => {
        if (Number.isFinite(scores[i])) r.points = scores[i];
      });
    }
    const record: Game = { id: crypto.randomUUID(), game, date: today(), season, results };
    setGames((all) => [...all, record]);
    setViewing(null);
    await marten.storage.set(KEY + record.id, record, shared);
    marten.ui.haptic("success");
  }

  async function newSeason() {
    const n = Number(/(\d+)\s*$/.exec(season)?.[1] ?? seasons.length);
    const name = (await marten.ui.prompt({ title: "Start a new season", value: `Season ${n + 1}`, confirmLabel: "Start" }))?.trim();
    if (!name || name === season) return;
    if (!(await marten.ui.confirm({ title: `Start ${name}?`, message: `${season} ends and its table is kept. Everyone starts at zero.`, confirmLabel: "Start" }))) return;
    setSeason(name);
    setViewing(null);
    await marten.storage.set("settings", { season: name }, shared);
  }

  async function remove(g: Game) {
    if (!(await marten.ui.confirm({ title: `Delete ${g.game} on ${g.date}?`, message: "The table changes for everyone.", confirmLabel: "Delete", destructive: true }))) return;
    setGames((all) => all.filter((x) => x.id !== g.id));
    await marten.storage.delete(KEY + g.id, shared);
  }

  actions.current = { add: addGame, season: newSeason };

  if (!ready) return null;

  if (games.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <Dices className="text-marten-muted" size={28} />
        <p className="text-marten-muted">No games yet. Tell Game Night who won, or add the first result.</p>
        <button className="min-h-11 rounded-lg bg-marten-accent px-4 text-marten-accent-text" onClick={addGame}>
          Add a game
        </button>
      </div>
    );
  }

  const leader = table[0];

  return (
    <div className="mx-auto max-w-2xl p-5">
      {seasons.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {seasons.map((s) => (
            <button
              key={s}
              className={
                "min-h-11 rounded-lg px-3 text-sm " +
                (s === shown ? "bg-marten-accent text-marten-accent-text" : "border border-marten-border text-marten-muted")
              }
              onClick={() => setViewing(s)}
            >
              {s}
              {s === season ? " · now" : ""}
            </button>
          ))}
        </div>
      )}

      <p className="text-sm text-marten-muted">
        {shown} · {inSeason.length} {inSeason.length === 1 ? "game" : "games"}
      </p>
      {leader ? (
        <p className="flex items-center gap-2 text-3xl font-semibold">
          <Crown className="text-amber-600 dark:text-amber-300" size={26} />
          {leader.name}
          <span className="text-xl font-normal text-marten-muted tabular-nums">{leader.points} pts</span>
        </p>
      ) : (
        <p className="text-2xl font-semibold">No games this season yet</p>
      )}

      {table.length > 0 && (
        <table className="mt-5 w-full overflow-hidden rounded-xl border border-marten-border bg-marten-surface text-left tabular-nums">
          <thead className="text-sm text-marten-muted">
            <tr>
              <th className="py-2 pl-4 font-normal">#</th>
              <th className="py-2 font-normal">Player</th>
              <th className="py-2 text-right font-normal">Played</th>
              <th className="py-2 text-right font-normal">Wins</th>
              <th className="py-2 pr-4 text-right font-normal">Pts</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-marten-border">
            {table.map((r, i) => (
              <tr key={r.name} className="h-11">
                <td className="pl-4 text-marten-muted">{i + 1}</td>
                <td className="font-medium">{r.name}</td>
                <td className="text-right">{r.played}</td>
                <td className="text-right">{r.wins}</td>
                <td className="pr-4 text-right font-semibold">{r.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {inSeason.length > 0 && (
        <>
          <p className="mt-6 text-sm text-marten-muted">Games</p>
          <ul className="divide-y divide-marten-border">
            {inSeason.map((g) => {
              const order = [...(g.results ?? [])].sort((a, b) => a.place - b.place);
              return (
                <li key={g.id}>
                  <button className="flex min-h-12 w-full items-center gap-3 py-2 text-left" onClick={() => remove(g)}>
                    <span className="flex-1">
                      {g.game}
                      <span className="block text-sm text-marten-muted">
                        {order.map((r) => `${placeLabel(r.place)} ${r.name}${r.points != null ? ` (${r.points})` : ""}`).join(" · ")}
                      </span>
                    </span>
                    <span className="text-sm text-marten-muted">{g.date}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
