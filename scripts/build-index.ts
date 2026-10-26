#!/usr/bin/env bun
/**
 * Writes the registry's index, the one file Marten's API reads: every listing's marten.json and files (text), and the
 * crisis skill every wellbeing Marten gets. `bun scripts/build-index.ts [out]` (default dist/registry.json); CI attaches
 * it to the `latest` release on every push to main.
 */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const ROOT = join(import.meta.dir, "..");
const out = process.argv[2] ?? join(ROOT, "dist/registry.json");

const root = join(ROOT, "martens");
const listings = readdirSync(root)
  .filter((slug) => statSync(join(root, slug)).isDirectory())
  .sort()
  .map((slug) => {
    const folder = join(root, slug);
    const files: Record<string, string> = {};
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (name !== "icon.png") files[relative(folder, path)] = readFileSync(path, "utf8");
      }
    };
    walk(folder);
    return { manifest: JSON.parse(files["marten.json"]!), files };
  });

const crisisSkill = readFileSync(join(ROOT, "shared/skills/crisis/SKILL.md"), "utf8");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ listings, crisisSkill }));
console.log(`${listings.length} listings → ${relative(process.cwd(), out)} (${Math.round(statSync(out).size / 1024)} KB)`);
