import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Crown, Trash2, Vote } from "lucide-react";

declare const marten: any;

type Mode = "one" | "ranked" | "any";
type Poll = { id: string; question: string; mode: Mode; deadline?: string; closed?: boolean; winner?: string };
type Option = { id: string; pollId: string; text: string; addedBy?: string };
type Ballot = { pollId: string; who: string; name: string; ranking: string[] };
type Past = { id: string; question: string; winner?: string; at: string };
type Member = { id: string; name: string; kind: string };
type Tally = { counts: Record<string, number>; winner?: string; tied: string[]; rounds: number };

const OPTION = "option/";
const VOTE = "vote/";
const PAST = "past/";
const shared = { shared: true };

const optionKey = (o: Option) => `${OPTION}${o.pollId}/${o.id}`;
const voteKey = (b: Ballot) => `${VOTE}${b.pollId}/${b.who}`;
const upsert = <T,>(all: T[], key: string, value: T | null, keyOf: (t: T) => string) => [
  ...all.filter((x) => keyOf(x) !== key),
  ...(value ? [value] : []),
];

const MODES: Record<Mode, string> = { one: "One vote each", ranked: "Rank your top three", any: "Tick all that work" };

/** One vote and "all that work" count every tick; ranked choice is an instant runoff (the skill's rules). */
function tally(mode: Mode, options: Option[], ballots: Ballot[]): Tally {
  const ids = new Set(options.map((o) => o.id));
  const clean = ballots.map((b) => b.ranking.filter((id) => ids.has(id))).filter((r) => r.length);
  const zero = () => Object.fromEntries(options.map((o) => [o.id, 0])) as Record<string, number>;
  const leaders = (counts: Record<string, number>, among: string[]) => {
    const top = Math.max(0, ...among.map((id) => counts[id] ?? 0));
    return top === 0 ? [] : among.filter((id) => counts[id] === top);
  };

  if (mode !== "ranked") {
    const counts = zero();
    for (const r of clean) for (const id of mode === "one" ? r.slice(0, 1) : r) counts[id]!++;
    const top = leaders(counts, [...ids]);
    return { counts, winner: top.length === 1 ? top[0] : undefined, tied: top.length > 1 ? top : [], rounds: 1 };
  }

  let active = [...ids];
  let firstRound: Record<string, number> | undefined;
  for (let round = 1; active.length; round++) {
    const counts = zero();
    let total = 0;
    for (const r of clean) {
      const pick = r.find((id) => active.includes(id));
      if (pick) {
        counts[pick]!++;
        total++;
      }
    }
    firstRound ??= counts;
    if (total === 0) return { counts: firstRound, tied: [], rounds: round };
    const top = leaders(counts, active);
    if (counts[top[0]!]! * 2 > total) return { counts: firstRound, winner: top[0], tied: [], rounds: round };
    const low = Math.min(...active.map((id) => counts[id]!));
    const rest = active.filter((id) => counts[id] !== low);
    if (rest.length === 0) return { counts: firstRound, tied: active, rounds: round };
    active = rest;
  }
  return { counts: firstRound ?? zero(), tied: [], rounds: 0 };
}

export default function PollSketch() {
  const [poll, setPoll] = useState<Poll | null>(null);
  const [options, setOptions] = useState<Option[]>([]);
  const [ballots, setBallots] = useState<Ballot[]>([]);
  const [past, setPast] = useState<Past[]>([]);
  const [people, setPeople] = useState<Member[]>([]);
  const [ready, setReady] = useState(false);
  const [inMarten, setInMarten] = useState(false);
  const handlers = useRef<Record<string, () => void>>({});

  useEffect(() => {
    let offStorage = () => {};
    let offAction = () => {};
    marten.ready.then(async (inside: boolean) => {
      if (!inside) return setReady(true);
      offAction = marten.ui.onAction((id: string) => handlers.current[id]?.());
      const [saved, optionRows, voteRows, pastRows, members] = await Promise.all([
        marten.storage.get("poll", shared),
        marten.storage.list(OPTION, shared),
        marten.storage.list(VOTE, shared),
        marten.storage.list(PAST, shared),
        marten.members(),
      ]);
      setPoll(saved ?? null);
      setOptions(optionRows.map((r: { value: Option }) => r.value));
      setBallots(voteRows.map((r: { value: Ballot }) => r.value));
      setPast(pastRows.map((r: { value: Past }) => r.value));
      setPeople(members.filter((m: Member) => m.kind === "person"));
      setInMarten(true);
      setReady(true);
      offStorage = marten.storage.subscribe(
        "",
        ({ key, value }: { key: string; value: any }) => {
          if (key === "poll") setPoll(value ?? null);
          else if (key.startsWith(OPTION)) setOptions((all) => upsert(all, key, value, optionKey));
          else if (key.startsWith(VOTE)) setBallots((all) => upsert(all, key, value, voteKey));
          else if (key.startsWith(PAST)) setPast((all) => upsert(all, key, value, (p) => PAST + p.id));
        },
        shared,
      );
    });
    return () => {
      offStorage();
      offAction();
    };
  }, []);

  useEffect(() => {
    if (!inMarten) return;
    marten.ui.setActions(
      poll
        ? [
            { id: "add", title: "Add option", icon: "add" },
            { id: "new", title: "New poll", icon: "edit" },
            { id: "more", title: "More", icon: "more" },
          ]
        : [{ id: "new", title: "New poll", icon: "add" }],
    );
  }, [inMarten, Boolean(poll)]);

  const viewer = marten.viewer as { id: string; name: string } | null;
  const current = poll ? options.filter((o) => o.pollId === poll.id) : [];
  const votes = poll ? ballots.filter((b) => b.pollId === poll.id) : [];
  const result = useMemo(() => (poll ? tally(poll.mode, current, votes) : null), [poll, options, ballots]);
  const mine = viewer ? votes.find((b) => b.name === viewer.name) : undefined;
  const textOf = (id?: string) => current.find((o) => o.id === id)?.text;

  async function newPoll() {
    if (poll) {
      const ok = await marten.ui.confirm({
        title: "Start a new poll?",
        message: `"${poll.question}" moves to past decisions, and its votes are cleared.`,
        confirmLabel: "New poll",
      });
      if (!ok) return;
    }
    const question = await marten.ui.prompt({ title: "What are you deciding?", placeholder: "Where do we eat on Friday?", confirmLabel: "Next" });
    if (!question?.trim()) return;
    const mode = await marten.ui.choose({
      title: "How do people vote?",
      options: (Object.keys(MODES) as Mode[]).map((m) => ({ id: m, title: MODES[m] })),
    });
    if (!mode) return;
    if (poll) {
      const record: Past = { id: poll.id, question: poll.question, winner: textOf(poll.winner ?? result?.winner), at: new Date().toISOString() };
      setPast((all) => upsert(all, PAST + record.id, record, (p) => PAST + p.id));
      await Promise.all([
        marten.storage.set(PAST + record.id, record, shared),
        ...current.map((o) => marten.storage.delete(optionKey(o), shared)),
        ...votes.map((b) => marten.storage.delete(voteKey(b), shared)),
      ]);
    }
    const next: Poll = { id: crypto.randomUUID(), question: question.trim(), mode };
    setPoll(next);
    await marten.storage.set("poll", next, shared);
  }

  async function addOption() {
    if (!poll) return;
    const text = await marten.ui.prompt({ title: "Add an option", placeholder: "The Thai place on the corner", confirmLabel: "Add" });
    if (!text?.trim()) return;
    if (current.some((o) => o.text.toLowerCase() === text.trim().toLowerCase())) return marten.ui.haptic("warning");
    const option: Option = { id: crypto.randomUUID(), pollId: poll.id, text: text.trim(), addedBy: viewer?.name };
    setOptions((all) => [...all, option]);
    await marten.storage.set(optionKey(option), option, shared);
  }

  async function more() {
    if (!poll) return;
    const choice = await marten.ui.choose({
      title: poll.question,
      options: [
        ...(Object.keys(MODES) as Mode[]).filter((m) => m !== poll.mode).map((m) => ({ id: `mode:${m}`, title: `Switch to: ${MODES[m]}` })),
        { id: "deadline", title: poll.deadline ? "Change the deadline" : "Set a deadline" },
        { id: poll.closed ? "reopen" : "close", title: poll.closed ? "Reopen the vote" : "Close the vote" },
        { id: "delete", title: "Delete this poll", destructive: true },
      ],
    });
    if (!choice) return;
    if (choice.startsWith("mode:")) return savePoll({ ...poll, mode: choice.slice(5) as Mode, winner: undefined });
    if (choice === "deadline") {
      const deadline = await marten.ui.prompt({ title: "Decided by", placeholder: "Friday 5pm", value: poll.deadline ?? "", confirmLabel: "Save" });
      if (deadline !== null) savePoll({ ...poll, deadline: deadline.trim() || undefined });
    } else if (choice === "close") closeVote();
    else if (choice === "reopen") savePoll({ ...poll, closed: false, winner: undefined });
    else if (choice === "delete") deletePoll();
  }

  async function savePoll(next: Poll) {
    setPoll(next);
    await marten.storage.set("poll", next, shared);
  }

  async function closeVote() {
    if (!poll || !result) return;
    let winner = result.winner;
    if (!winner && result.tied.length) {
      const pick = await marten.ui.choose({
        title: "It's a tie. Who breaks it?",
        options: [...result.tied.map((id) => ({ id, title: textOf(id) ?? id })), { id: "tie", title: "Leave it tied for now" }],
      });
      if (!pick) return;
      if (pick !== "tie") winner = pick;
    }
    await savePoll({ ...poll, closed: true, winner });
    marten.ui.haptic("success");
  }

  async function deletePoll() {
    if (!poll) return;
    if (!(await marten.ui.confirm({ title: `Delete "${poll.question}"?`, message: "Its options and votes go too.", confirmLabel: "Delete", destructive: true }))) return;
    const gone = { current, votes };
    setPoll(null);
    await Promise.all([
      marten.storage.delete("poll", shared),
      ...gone.current.map((o) => marten.storage.delete(optionKey(o), shared)),
      ...gone.votes.map((b) => marten.storage.delete(voteKey(b), shared)),
    ]);
  }

  async function removeOption(option: Option) {
    if (!(await marten.ui.confirm({ title: `Remove ${option.text}?`, message: "Votes for it stop counting.", confirmLabel: "Remove", destructive: true }))) return;
    setOptions((all) => all.filter((o) => optionKey(o) !== optionKey(option)));
    await marten.storage.delete(optionKey(option), shared);
  }

  async function vote(option: Option) {
    if (!poll || poll.closed || !viewer) return;
    const ranking = mine?.ranking.filter((id) => current.some((o) => o.id === id)) ?? [];
    let next: string[];
    if (ranking.includes(option.id)) next = ranking.filter((id) => id !== option.id);
    else if (poll.mode === "one") next = [option.id];
    else if (poll.mode === "ranked" && ranking.length >= 3) return marten.ui.haptic("warning");
    else next = [...ranking, option.id];
    const ballot: Ballot = { pollId: poll.id, who: mine?.who ?? viewer.id, name: viewer.name, ranking: next };
    marten.ui.haptic("selection");
    if (next.length === 0) {
      setBallots((all) => all.filter((b) => voteKey(b) !== voteKey(ballot)));
      await marten.storage.delete(voteKey(ballot), shared);
    } else {
      setBallots((all) => upsert(all, voteKey(ballot), ballot, voteKey));
      await marten.storage.set(voteKey(ballot), ballot, shared);
    }
  }

  handlers.current = { add: addOption, new: newPoll, more };

  if (!ready) return null;

  if (!poll) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 px-6 py-16 text-center">
        <Vote className="text-marten-muted" size={28} />
        <p className="text-marten-muted">Nothing to decide yet. Ask Decider in the chat, or start a poll here.</p>
        <button className="min-h-11 rounded-lg bg-marten-accent px-4 text-marten-accent-text" onClick={newPoll}>
          Start a poll
        </button>
        {past.length > 0 && <PastList past={past} />}
      </div>
    );
  }

  const winnerId = poll.closed ? poll.winner : result?.winner;
  const tied = !winnerId && result?.tied.length ? result.tied : [];
  const sorted = [...current].sort((a, b) => (result?.counts[b.id] ?? 0) - (result?.counts[a.id] ?? 0) || a.text.localeCompare(b.text));
  const voters = new Set(votes.map((b) => b.name));
  const roll = [...new Set([...people.map((p) => p.name), ...voters])].sort();
  const votersFor = (id: string) =>
    votes
      .filter((b) => (poll.mode === "any" ? b.ranking.includes(id) : b.ranking.find((r) => current.some((o) => o.id === r)) === id))
      .map((b) => b.name);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 p-5">
      <header>
        <p className="text-sm text-marten-muted">
          {MODES[poll.mode]}
          {poll.deadline && ` · decided by ${poll.deadline}`}
          {poll.closed && " · closed"}
        </p>
        <h2 className="text-2xl font-semibold leading-tight">{poll.question}</h2>
      </header>

      {(winnerId || tied.length > 0) && (
        <section
          className={
            "flex items-center gap-3 rounded-xl p-4 " +
            (winnerId ? "bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-100" : "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100")
          }
        >
          <Crown size={22} className="shrink-0" />
          <div>
            <p className="text-sm opacity-80">{winnerId ? (poll.closed ? "Decided" : "Leading") : "Tied"}</p>
            <p className="text-lg font-semibold">{winnerId ? textOf(winnerId) : tied.map(textOf).join(" and ")}</p>
            {poll.mode === "ranked" && result && result.rounds > 1 && winnerId && !poll.closed && (
              <p className="text-sm opacity-80">after {result.rounds} rounds of ranked choice</p>
            )}
          </div>
        </section>
      )}

      {current.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-marten-border px-4 py-8 text-center">
          <p className="text-marten-muted">No options yet. Suggest them in the chat, or add the first one.</p>
          <button className="min-h-11 rounded-lg bg-marten-accent px-4 text-marten-accent-text" onClick={addOption}>
            Add an option
          </button>
        </div>
      ) : (
        <section>
          {!poll.closed && viewer && (
            <p className="mb-1 text-sm text-marten-muted">
              {poll.mode === "ranked" ? "Tap in order: first choice first. Tap again to take it off." : poll.mode === "any" ? "Tap every option that works for you." : "Tap your choice."}
            </p>
          )}
          <ul className="divide-y divide-marten-border">
            {sorted.map((option) => {
              const rank = mine ? mine.ranking.indexOf(option.id) : -1;
              const names = votersFor(option.id);
              return (
                <li key={option.id} className="flex items-center gap-2">
                  <button
                    className="flex min-h-14 flex-1 items-center gap-3 py-2 text-left disabled:cursor-default"
                    disabled={poll.closed}
                    onClick={() => vote(option)}
                  >
                    <span
                      className={
                        "flex size-7 shrink-0 items-center justify-center rounded-full border text-sm tabular-nums " +
                        (rank >= 0 ? "border-marten-accent bg-marten-accent text-marten-accent-text" : "border-marten-border")
                      }
                    >
                      {rank >= 0 && (poll.mode === "ranked" ? rank + 1 : <Check size={14} />)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={"block " + (option.id === winnerId ? "font-semibold" : "")}>{option.text}</span>
                      {names.length > 0 && (
                        <span className="block text-sm text-marten-muted">
                          {poll.mode === "ranked" ? "first choice of " : ""}
                          {names.join(", ")}
                        </span>
                      )}
                    </span>
                    <span className="w-8 text-right text-lg tabular-nums">{result?.counts[option.id] ?? 0}</span>
                  </button>
                  {!poll.closed && (
                    <button aria-label={`Remove ${option.text}`} className="flex size-11 shrink-0 items-center justify-center text-marten-muted" onClick={() => removeOption(option)}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {roll.length > 0 && current.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-medium text-marten-muted tabular-nums">
            {voters.size} of {roll.length} voted
          </h3>
          <div className="flex flex-wrap gap-2">
            {roll.map((name) => (
              <span
                key={name}
                className={
                  "rounded-lg px-2 py-1 text-sm " +
                  (voters.has(name) ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200" : "border border-marten-border text-marten-muted")
                }
              >
                {voters.has(name) ? "✓ " : ""}
                {name}
              </span>
            ))}
          </div>
        </section>
      )}

      {past.length > 0 && <PastList past={past} />}
    </div>
  );
}

function PastList({ past }: { past: Past[] }) {
  const sorted = [...past].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 10);
  return (
    <section className="w-full text-left">
      <h3 className="mb-1 text-sm font-medium text-marten-muted">Past decisions</h3>
      <ul className="divide-y divide-marten-border">
        {sorted.map((p) => (
          <li key={p.id} className="flex min-h-11 flex-col justify-center py-1">
            <span>{p.question}</span>
            <span className="text-sm text-marten-muted">{p.winner ?? "No winner"}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
