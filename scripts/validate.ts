#!/usr/bin/env bun
/**
 * Checks Marten packages the way submission will: `bun scripts/validate.ts [martens/<slug> …]` (all of `martens/`
 * when none is named). Prints each problem and exits 1 if any listing has one. No dependencies beyond Bun, so CI and
 * authors run the same thing.
 */
import { lstatSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, relative } from "node:path";

const ROOT = join(import.meta.dir, "..");
const schema = JSON.parse(readFileSync(join(ROOT, "schema/marten.schema.json"), "utf8"));
const enumOf = (def: { enum: string[] }) => def.enum;

const APPS = enumOf(schema.$defs.appId);
const LOOKS = enumOf(schema.properties.look);
const VOICES = enumOf(schema.properties.voice);
const CATEGORIES = enumOf(schema.properties.category);
const KEYS = new Set(Object.keys(schema.properties));

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 200;
const MAX_AGENTS_BYTES = 20 * 1024;
const TEXT = new Set([".md", ".json", ".yaml", ".yml", ".txt", ".tsx", ".jsx", ".ts", ".js", ".mjs", ".html", ".css", ".csv", ".svg"]);
const FORBIDDEN = [/^memory(\/|$)/, /^sessions(\/|$)/, /^rules(\/|$)/, /^files(\/|$)/, /^\.marten(\/|$)/, /^mcp\.json$/, /(^|\/)\.env/];
const SKETCH_IMPORTS = new Set(["react", "react-dom", "react-dom/client", "react/jsx-runtime", "lucide-react", "recharts"]);
const SEMVER = new RegExp(schema.properties.version.pattern);
const SLUG = new RegExp(schema.properties.slug.pattern);

const SECRETS: [string, RegExp][] = [
  ["a private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["an API key", /\b(sk_live|sk_test|rk_live|mk_live|ghp|gho|github_pat|xox[abp]|AKIA)[_-]?[A-Za-z0-9_]{12,}/],
  ["a token", /\b(eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.)/],
];
const PERSONAL: [string, RegExp][] = [
  ["an email address", /\b[A-Za-z0-9._%+-]+@(?!example\.(?:com|org))[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/],
  ["a phone number", /(?<![\d.])\+?\d{1,3}[ -]?\(?\d{3}\)?[ -]\d{3}[ -]?\d{4}(?!\d)/],
];
/** Words wellbeing listings may not use about themselves (docs/policy.md). */
const THERAPY = /\b(therap(y|ist|ists|eutic)|counsell?(ing|or)|treatment|psychiatr\w*|psycholog(ist|ists))\b/i;
/** Saying what it isn't is how a wellbeing listing should use those words. */
const DISCLAIMER = /\b(not|isn['’]?t|is not|never)( a| an| any)? (therap(y|ist)|counsell?(ing|or)|treatment)\b/gi;
/** Crisis lines are allowed to look like phone numbers. */
const CRISIS_LINE = /\b(988|116 123|14416|13 11 14|1-800-891-4416)\b/;

type Problem = string;

function walk(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const rel = relative(base, path);
    const st = lstatSync(path);
    if (st.isSymbolicLink()) out.push(`!symlink:${rel}`);
    else if (st.isDirectory()) out.push(...walk(path, base));
    else out.push(rel);
  }
  return out;
}

function parseYaml(text: string): unknown {
  return (Bun as unknown as { YAML: { parse(s: string): unknown } }).YAML.parse(text);
}

function checkManifest(dir: string, m: Record<string, unknown>, p: Problem[]) {
  for (const key of Object.keys(m)) if (!KEYS.has(key)) p.push(`marten.json: unknown field "${key}"`);
  for (const key of schema.required as string[]) if (!(key in m)) p.push(`marten.json: "${key}" is required`);

  const slug = m.slug as string;
  if (typeof slug !== "string" || !SLUG.test(slug)) p.push(`marten.json: slug "${slug}" must be a-z, 0-9 and -, 2–40 characters`);
  else if (slug !== basename(dir)) p.push(`marten.json: slug "${slug}" must match its folder, "${basename(dir)}"`);
  if (typeof m.name !== "string" || !m.name.trim() || m.name.length > 40) p.push("marten.json: name must be 1–40 characters");
  if (typeof m.version !== "string" || !SEMVER.test(m.version)) p.push(`marten.json: version "${m.version}" isn't semver (1.0.0)`);
  if (typeof m.summary !== "string" || m.summary.length < 10 || m.summary.length > 140) p.push("marten.json: summary must be 10–140 characters");
  if (!CATEGORIES.includes(m.category as string)) p.push(`marten.json: category "${m.category}" isn't one of ${CATEGORIES.join(", ")}`);
  if (!LOOKS.includes(m.look as string)) p.push(`marten.json: look "${m.look}" isn't a look id`);
  if (!VOICES.includes(m.voice as string)) p.push(`marten.json: voice "${m.voice}" isn't one of ${VOICES.join(", ")}`);

  const where = Array.isArray(m.for) ? (m.for as string[]) : [];
  if (!where.length || where.some((w) => w !== "you" && w !== "group") || new Set(where).size !== where.length) {
    p.push(`marten.json: "for" must list "you" and/or "group"`);
  }

  const needs = (m.needs ?? {}) as Record<string, unknown>;
  for (const key of Object.keys(needs)) if (!["apps", "optional", "mcp"].includes(key)) p.push(`marten.json: needs has an unknown field "${key}"`);
  const listed = new Set<string>();
  for (const kind of ["apps", "optional"] as const) {
    const list = needs[kind];
    if (list === undefined && kind === "optional") continue;
    if (!Array.isArray(list)) {
      p.push(`marten.json: needs.${kind} must be a list`);
      continue;
    }
    for (const a of list as { app?: string; why?: string }[]) {
      if (!APPS.includes(a.app as string)) p.push(`marten.json: needs.${kind} has an unknown app "${a.app}"`);
      if (typeof a.why !== "string" || a.why.length < 5 || a.why.length > 120) p.push(`marten.json: needs.${kind} "${a.app}" needs a why of 5–120 characters`);
      if (listed.has(a.app as string)) p.push(`marten.json: "${a.app}" is listed twice in needs`);
      listed.add(a.app as string);
    }
  }
  for (const s of (needs.mcp as { name?: string; why?: string }[] | undefined) ?? []) {
    if (!s.name || typeof s.why !== "string") p.push("marten.json: each needs.mcp entry needs a name and a why");
  }

  const triggers = (m.triggers as Record<string, unknown>[] | undefined) ?? [];
  if (!Array.isArray(triggers)) p.push("marten.json: triggers must be a list");
  for (const t of triggers) {
    if (!listed.has(t.app as string)) p.push(`marten.json: trigger "${t.title}" uses ${t.app}, which isn't in needs`);
    if (typeof t.type !== "string" || !/^[A-Z0-9_]+$/.test(t.type)) p.push(`marten.json: trigger "${t.title}" needs a Composio trigger type`);
    if (typeof t.title !== "string" || !t.title || t.title.length > 60) p.push("marten.json: each trigger needs a title of 1–60 characters");
    if (typeof t.instructions !== "string" || t.instructions.length < 10) p.push(`marten.json: trigger "${t.title}" needs instructions`);
  }

  if (where.includes("group")) {
    if (((needs.apps as unknown[]) ?? []).length) p.push(`marten.json: a Marten "for" group can't need apps (an added Marten has no personal apps)`);
    if (triggers.length) p.push(`marten.json: a Marten "for" group can't have triggers`);
  }

  const examples = m.examples as unknown[];
  if (!Array.isArray(examples) || examples.length < 2 || examples.length > 5 || examples.some((e) => typeof e !== "string" || !e.trim() || e.length > 120)) {
    p.push("marten.json: examples must be 2–5 lines of up to 120 characters");
  }
  return { where, apps: listed };
}

function checkTasks(text: string, apps: Set<string>, p: Problem[]) {
  let tasks: unknown;
  try {
    tasks = parseYaml(text);
  } catch (err) {
    p.push(`tasks.yaml: ${(err as Error).message}`);
    return;
  }
  if (!Array.isArray(tasks)) {
    p.push("tasks.yaml: must be a list of tasks");
    return;
  }
  tasks.forEach((t: Record<string, unknown>, i) => {
    const at = `tasks.yaml #${i + 1}`;
    for (const key of Object.keys(t)) if (!["title", "description", "repeat", "time", "assignee", "when"].includes(key)) p.push(`${at}: unknown field "${key}"`);
    if (typeof t.title !== "string" || !t.title.trim() || t.title.length > 200) p.push(`${at}: title is required (up to 200 characters)`);
    if (t.repeat !== undefined) {
      if (typeof t.repeat !== "string" || !/^FREQ=(HOURLY|DAILY|WEEKLY|MONTHLY|YEARLY)(;[A-Z]+=[A-Z0-9,+-]+)*$/.test(t.repeat)) p.push(`${at}: repeat must be an RRULE (FREQ=WEEKLY;BYDAY=MO)`);
    }
    if (t.time !== undefined && (typeof t.time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(t.time))) p.push(`${at}: time must be HH:MM`);
    if (t.assignee !== undefined && t.assignee !== "marten" && t.assignee !== "owner") p.push(`${at}: assignee is marten or owner`);
    if (t.when !== undefined) {
      const missing = (t.when as { missing?: string })?.missing;
      if (!missing || !apps.has(missing)) p.push(`${at}: when.missing must name an app in needs`);
    }
  });
}

function checkSkill(rel: string, text: string, p: Problem[]) {
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!fm) return p.push(`${rel}: needs frontmatter with name and description`);
  if (!/^name:\s*\S/m.test(fm[1]!)) p.push(`${rel}: frontmatter needs a name`);
  if (!/^description:\s*\S/m.test(fm[1]!)) p.push(`${rel}: frontmatter needs a description`);
}

const transpiler = new Bun.Transpiler({ loader: "tsx" });

function checkSketch(rel: string, text: string, p: Problem[]) {
  try {
    const { imports } = transpiler.scan(text);
    for (const i of imports) if (!SKETCH_IMPORTS.has(i.path)) p.push(`${rel}: imports "${i.path}"; sketches may use react, react-dom, lucide-react and recharts only`);
    const code = transpiler.transformSync(text);
    if (!/export\s+(default|\{[^}]*\bdefault\b)/.test(code) && !/export default/.test(text)) p.push(`${rel}: needs a default export (the app)`);
  } catch (err) {
    p.push(`${rel}: doesn't build: ${(err as Error).message.split("\n")[0]}`);
  }
}

function checkListing(dir: string): Problem[] {
  const p: Problem[] = [];
  const files = walk(dir);
  if (files.length > MAX_FILES) p.push(`${files.length} files; at most ${MAX_FILES}`);
  let bytes = 0;
  for (const rel of files) {
    if (rel.startsWith("!symlink:")) {
      p.push(`${rel.slice(9)}: symlinks aren't allowed`);
      continue;
    }
    bytes += statSync(join(dir, rel)).size;
    if (FORBIDDEN.some((re) => re.test(rel))) p.push(`${rel}: never part of a package (memory, sessions, rules, files, .marten, mcp.json, env)`);
    if (rel !== "icon.png" && !TEXT.has(extname(rel).toLowerCase())) p.push(`${rel}: only text files (and icon.png) go in a package`);
  }
  if (bytes > MAX_BYTES) p.push(`${(bytes / 1024 / 1024).toFixed(1)} MB; at most 5 MB`);

  for (const required of ["marten.json", "AGENTS.md", "README.md"]) if (!files.includes(required)) p.push(`${required} is missing`);
  if (p.some((x) => x.startsWith("marten.json is missing"))) return p;

  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(readFileSync(join(dir, "marten.json"), "utf8"));
  } catch (err) {
    return [...p, `marten.json: ${(err as Error).message}`];
  }
  const { apps } = checkManifest(dir, manifest, p);

  const read = (rel: string) => readFileSync(join(dir, rel), "utf8");
  if (files.includes("AGENTS.md")) {
    const size = statSync(join(dir, "AGENTS.md")).size;
    if (size > MAX_AGENTS_BYTES) p.push(`AGENTS.md is ${Math.round(size / 1024)} KB; keep it under 20 KB`);
    if (read("AGENTS.md").trim().length < 200) p.push("AGENTS.md is too short to brief a Marten");
  }
  if (files.includes("tasks.yaml")) checkTasks(read("tasks.yaml"), apps, p);

  const skillDirs = new Set(files.filter((f) => f.startsWith("skills/")).map((f) => f.split("/")[1]));
  for (const s of skillDirs) {
    const rel = `skills/${s}/SKILL.md`;
    if (!files.includes(rel)) p.push(`skills/${s}: needs a SKILL.md`);
    else checkSkill(rel, read(rel), p);
  }

  const sketchFiles = files.filter((f) => f.startsWith("sketches/"));
  const sketchFolders = new Set(sketchFiles.filter((f) => f.split("/").length > 2).map((f) => f.split("/")[1]));
  for (const folder of sketchFolders) if (!files.includes(`sketches/${folder}/index.html`)) p.push(`sketches/${folder}: a sketch folder needs an index.html`);
  for (const rel of sketchFiles.filter((f) => f.split("/").length === 2)) {
    const ext = extname(rel);
    if (ext === ".tsx" || ext === ".jsx") checkSketch(rel, read(rel), p);
    else if (ext !== ".html") p.push(`${rel}: a sketch is a .tsx, .jsx or .html file, or a folder with index.html`);
  }

  const wellbeing = manifest.category === "wellbeing";
  for (const rel of files.filter((f) => TEXT.has(extname(f).toLowerCase()))) {
    const text = read(rel);
    for (const [what, re] of SECRETS) if (re.test(text)) p.push(`${rel}: looks like it holds ${what}`);
    for (const [what, re] of PERSONAL) {
      const hit = re.exec(text);
      if (hit && !(what === "a phone number" && CRISIS_LINE.test(hit[0]))) p.push(`${rel}: holds ${what} ("${hit[0]}"); packages hold nobody's details`);
    }
    if (wellbeing && /\.(md|json)$/.test(rel)) {
      const plain = text.replace(/\s+/g, " ");
      const hit = THERAPY.exec(plain.replace(DISCLAIMER, "").replace(/\bno substitute for (an? )?\w+/gi, ""));
      if (hit) p.push(`${rel}: says "${hit[0]}"; wellbeing listings never call themselves therapy (docs/policy.md)`);
    }
  }
  if (wellbeing && !/\b(not|isn['’]?t|is not) (a |an )?(therapist|professional)/i.test(files.includes("README.md") ? read("README.md").replace(/\s+/g, " ") : "")) {
    p.push("README.md: a wellbeing listing says plainly it isn't a professional");
  }
  return p;
}

const targets = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(join(ROOT, "martens"))
      .map((n) => join("martens", n))
      .filter((d) => statSync(join(ROOT, d)).isDirectory());

let failed = 0;
for (const target of targets) {
  const dir = target.startsWith("/") ? target : join(process.cwd(), target);
  const problems = checkListing(dir);
  if (problems.length) {
    failed++;
    console.log(`✗ ${relative(ROOT, dir)}`);
    for (const x of problems) console.log(`    ${x}`);
  } else console.log(`✓ ${relative(ROOT, dir)}`);
}
if (!targets.length) console.log("No listings yet.");
console.log(failed ? `\n${failed} of ${targets.length} with problems` : `\n${targets.length} listings OK`);
process.exit(failed ? 1 : 0);
