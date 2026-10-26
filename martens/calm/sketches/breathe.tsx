import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";

declare const marten: any;

type Kind = "in" | "holdFull" | "out" | "holdEmpty";
type Phase = { kind: Kind; seconds: number };
type Pattern = { id: string; name: string; line: string; rounds: number; phases: Phase[] };

const PATTERNS: Pattern[] = [
  {
    id: "box",
    name: "Box",
    line: "In 4, hold 4, out 4, hold 4. Steadying, any time.",
    rounds: 6,
    phases: [
      { kind: "in", seconds: 4 },
      { kind: "holdFull", seconds: 4 },
      { kind: "out", seconds: 4 },
      { kind: "holdEmpty", seconds: 4 },
    ],
  },
  {
    id: "478",
    name: "4-7-8",
    line: "In 4, hold 7, out 8. For winding down; four rounds.",
    rounds: 4,
    phases: [
      { kind: "in", seconds: 4 },
      { kind: "holdFull", seconds: 7 },
      { kind: "out", seconds: 8 },
    ],
  },
  {
    id: "slow",
    name: "Slow",
    line: "In 4, out 6, no holds. The simplest way to settle.",
    rounds: 8,
    phases: [
      { kind: "in", seconds: 4 },
      { kind: "out", seconds: 6 },
    ],
  },
];

const WORDS: Record<Kind, string> = { in: "Breathe in", holdFull: "Hold", out: "Breathe out", holdEmpty: "Hold" };
const SMALL = 0.55;
const FULL = 1;

type Run = { phase: number; left: number; round: number };

function usePrefersReducedMotion() {
  const query = "(prefers-reduced-motion: reduce)";
  const [reduce, setReduce] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const change = () => setReduce(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  return reduce;
}

export default function Breathe() {
  const [patternId, setPatternId] = useState("box");
  const [run, setRun] = useState<Run | null>(null);
  const [paused, setPaused] = useState(false);
  const [done, setDone] = useState(false);
  const reduce = usePrefersReducedMotion();
  const inMarten = useRef(false);

  const pattern = PATTERNS.find((p) => p.id === patternId) ?? PATTERNS[0]!;

  useEffect(() => {
    marten.ready.then(async (ready: boolean) => {
      inMarten.current = ready;
      if (!ready) return;
      const saved = await marten.storage.get("settings");
      if (saved?.pattern && PATTERNS.some((p) => p.id === saved.pattern)) setPatternId(saved.pattern);
    });
  }, []);

  useEffect(() => {
    if (!run || paused) return;
    const timer = setTimeout(() => {
      if (run.left > 1) return setRun({ ...run, left: run.left - 1 });
      const nextPhase = (run.phase + 1) % pattern.phases.length;
      const nextRound = nextPhase === 0 ? run.round + 1 : run.round;
      if (nextRound > pattern.rounds) {
        setRun(null);
        setDone(true);
        if (inMarten.current) marten.ui.haptic("success");
        return;
      }
      setRun({ phase: nextPhase, left: pattern.phases[nextPhase]!.seconds, round: nextRound });
    }, 1000);
    return () => clearTimeout(timer);
  }, [run, paused, pattern]);

  function choose(id: string) {
    setPatternId(id);
    setRun(null);
    setPaused(false);
    setDone(false);
    if (inMarten.current) {
      marten.ui.haptic("selection");
      marten.storage.set("settings", { pattern: id });
    }
  }

  function start() {
    setDone(false);
    setPaused(false);
    setRun({ phase: 0, left: pattern.phases[0]!.seconds, round: 1 });
  }

  function stop() {
    setRun(null);
    setPaused(false);
  }

  const phase = run ? pattern.phases[run.phase]! : null;
  const scale = !phase ? SMALL : phase.kind === "in" || phase.kind === "holdFull" ? FULL : SMALL;
  const moving = phase && (phase.kind === "in" || phase.kind === "out");
  const transition = reduce || !moving ? "none" : `transform ${phase!.seconds}s ease-in-out`;

  const headline = done ? "Done" : phase ? WORDS[phase.kind] : "Ready when you are";
  const status = done
    ? "Let your breath go back to normal."
    : run
      ? paused
        ? "Paused"
        : `Round ${run.round} of ${pattern.rounds}`
      : pattern.line;

  return (
    <div className="mx-auto flex min-h-full max-w-xl flex-col items-center gap-6 p-5">
      <div role="radiogroup" aria-label="Breathing pattern" className="flex w-full gap-2 rounded-xl bg-marten-surface p-1">
        {PATTERNS.map((p) => (
          <button
            key={p.id}
            role="radio"
            aria-checked={p.id === patternId}
            onClick={() => choose(p.id)}
            className={
              "min-h-11 flex-1 rounded-lg text-base font-medium " +
              (p.id === patternId ? "bg-marten-accent text-marten-accent-text" : "text-marten-muted")
            }
          >
            {p.name}
          </button>
        ))}
      </div>

      <div className="relative flex size-64 items-center justify-center">
        {!reduce && (
          <div
            aria-hidden
            className="absolute inset-0 rounded-full bg-marten-accent/15 dark:bg-marten-accent/25"
            style={{ transform: `scale(${scale})`, transition }}
          />
        )}
        <div
          className={
            "relative flex flex-col items-center justify-center rounded-full border-2 border-marten-accent/40 text-center " +
            (reduce ? "size-56" : "size-40")
          }
        >
          <span className="text-2xl font-semibold text-marten-text">{headline}</span>
          {phase && !done && (
            <span className="mt-1 text-4xl font-light tabular-nums text-marten-text" aria-live="off">
              {paused ? "" : run!.left}
            </span>
          )}
        </div>
      </div>

      <div className="min-h-12 text-center" aria-live="polite">
        <p className="text-base text-marten-muted">{status}</p>
        {!run && !done && (
          <p className="mt-1 text-sm text-marten-muted">If you feel dizzy, stop and breathe normally.</p>
        )}
      </div>

      <div className="flex gap-3">
        {!run ? (
          <button
            onClick={start}
            className="flex min-h-11 items-center gap-2 rounded-xl bg-marten-accent px-6 text-base font-medium text-marten-accent-text"
          >
            <Play size={18} /> {done ? "Again" : "Start"}
          </button>
        ) : (
          <>
            <button
              onClick={() => setPaused((p) => !p)}
              className="flex min-h-11 items-center gap-2 rounded-xl bg-marten-surface px-5 text-base font-medium text-marten-text"
            >
              {paused ? <Play size={18} /> : <Pause size={18} />} {paused ? "Resume" : "Pause"}
            </button>
            <button
              onClick={stop}
              className="flex min-h-11 items-center gap-2 rounded-xl bg-marten-surface px-5 text-base font-medium text-marten-muted"
            >
              <RotateCcw size={18} /> Stop
            </button>
          </>
        )}
      </div>
    </div>
  );
}
