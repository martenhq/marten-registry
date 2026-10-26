#!/usr/bin/env bun
/**
 * Every listing a change touches must bump its version: `bun scripts/check-versions.ts <base ref>` (CI passes the pull
 * request's base, `origin/main`). A new listing starts wherever it likes; a changed one must go up, and its
 * CHANGELOG.md's newest entry must be the new version (validate.ts checks that part).
 */
import { $ } from "bun";

const base = process.argv[2] ?? "origin/main";

const changed = (await $`git diff --name-only ${base}...HEAD -- martens`.text()).split("\n").filter(Boolean);
const slugs = [...new Set(changed.map((f) => f.split("/")[1]!))];

const parse = (v: string) => v.split(".").map(Number) as [number, number, number];
const newer = (a: string, b: string) => {
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i]! > y[i]!;
  return false;
};

let failed = 0;
for (const slug of slugs) {
  const path = `martens/${slug}/marten.json`;
  const before = await $`git show ${base}:${path}`.quiet().nothrow();
  if (before.exitCode !== 0) {
    console.log(`✓ ${slug}: new listing`);
    continue;
  }
  const head = await Bun.file(path).exists();
  if (!head) {
    console.log(`✓ ${slug}: removed`);
    continue;
  }
  const was = JSON.parse(before.stdout.toString()).version as string;
  const now = (await Bun.file(path).json()).version as string;
  if (newer(now, was)) console.log(`✓ ${slug}: ${was} → ${now}`);
  else {
    failed++;
    console.log(`✗ ${slug}: changed but still ${now}; bump the version in marten.json (was ${was}) and add it to CHANGELOG.md`);
  }
}
if (!slugs.length) console.log("No listing changed.");
process.exit(failed ? 1 : 0);
