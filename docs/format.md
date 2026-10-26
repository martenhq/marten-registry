# A Marten's package

A listing is one folder under `martens/`, named by its slug. Installing it makes a Marten: yours, with its own 1:1, or
one added to a group. The package is a template: nothing in it is anyone's memory, chat or data.

```
martens/trip-planner/
  marten.json        who it is, what it needs, where it can live
  AGENTS.md          its job, written for nobody in particular
  README.md          the listing page's long description
  CHANGELOG.md       what changed in each version
  skills/<name>/SKILL.md (+ scripts)
  sketches/<name>.tsx | <name>.jsx | <name>.html | <name>/index.html
  tasks.yaml         the work it starts with (optional)
  icon.png           optional; else its face, from its look
```

`bun scripts/validate.ts martens/<slug>` checks a folder; CI runs it on every listing.

## `marten.json`

```json
{
  "$schema": "../../schema/marten.schema.json",
  "slug": "trip-planner",
  "name": "Trip Planner",
  "version": "1.0.0",
  "summary": "Plans the trip with the group: dates, itinerary, budget, who's booking what.",
  "category": "travel",
  "for": ["group", "you"],
  "look": "navigator",
  "voice": "charlie",
  "color": "#8EC5E8",
  "needs": { "apps": [], "optional": [{ "app": "gmail", "why": "to find your bookings in your inbox" }], "mcp": [] },
  "triggers": [],
  "examples": ["We're going to Goa in March", "Who still needs to book flights?"]
}
```

| Field | |
|---|---|
| `slug` | `a-z`, `0-9` and `-`, 2–40 characters; the folder's name; never changes |
| `name` | up to 40 characters; the Marten's name when installed (people can rename it) |
| `version` | semver; every change to a published listing bumps it |
| `summary` | one line, up to 140 characters: what it does for you. Jev reads it to decide when an added Marten fits a message |
| `category` | one of `travel`, `money`, `home`, `events`, `games`, `social`, `work`, `developer`, `business`, `writing`, `productivity`, `health`, `learning`, `wellbeing`, `mentors`, `life` |
| `for` | where it can be installed: `you` (a Marten of your own, with its 1:1), `group` (added to a group, which can have several) |
| `look` | a look id: `banker`, `navigator`, `chef`, `engineer`, `pilot`, `host`, `scholar`, `coach`, `chief`, `musician`, `gardener`, `nightowl`, `agent`, `gent`, `royal`, `wizard`, `pirate`, `cowboy`, `captain`, `sailor`, `builder`, `robot`, `hero`, `champion`, `artist`, `romantic`, `santa`, `angel`, `devil`, `sprout`, or `plain` |
| `voice` | how it speaks on calls and in voice replies: `sarah`, `alice`, `lily`, `matilda`, `laura`, `river`, `daniel`, `brian`, `charlie`, `will` |
| `color` | its face's tile: one of Marten's twelve, `#F2B23E` amber, `#8A4B2A` chestnut, `#FBE3B0` cream, `#E9775B` coral, `#F2B5C0` pink, `#6B3F69` plum, `#B9A6E3` lavender, `#2F5D8A` navy, `#8EC5E8` sky, `#2F6F6A` teal, `#9DB89A` sage, `#3E5C3A` forest |
| `needs.apps` | apps it can't work without, each `{ app, why }`. The installer connects their own account; no token is ever in a package |
| `needs.optional` | apps it uses when they're there |
| `needs.mcp` | MCP servers it expects, `{ name, why }`, which the installer adds themselves |
| `triggers` | suggestions, each turned on at install with the installer's account: `{ app, type, title, config, instructions }` (`type` is the Composio trigger type, e.g. `GMAIL_NEW_GMAIL_MESSAGE`); its app must be in `needs`. Fields `config` leaves out (a GitHub repository, a Linear team) are asked at install, from the installer's own account |
| `examples` | 2–5 things to say to it: on the listing page, in its first message, and the messages review tries |

Apps: `gmail`, `googlecalendar`, `linear`, `github`, `slack`, `notion`, `stripe`, `vercel`, `posthog`, `ynab`,
`superset`, `typefully`.

A Marten added to a group has no personal apps (it asks a member's Marten for what needs one), so a listing `for`
`group` has no `needs.apps` and no `triggers`.

## `AGENTS.md`

Its instructions: what it's for, how it works, its tone, when it uses each skill, sketch and task. The same file every
Marten keeps in its folder. Write it for whoever installs it, and nothing about you: no names, emails, places or
habits of a real person.

After install the file is the Marten's. Installed for you, it keeps editing it from what you tell it in your 1:1. Added
to a group, it stays as the listing wrote it, and what the group wants goes in that chat's rules, which the Marten
keeps. An update never replaces it: the changed instructions are handed to the Marten, which folds in what fits.

Write it as you'd brief a capable person: its job in a line, then how it does it, short and organised. Marten already
tells every Marten how to reply, sketch, keep tasks, ask questions and use its apps: don't repeat that.

## `skills/`

One folder per skill, with a `SKILL.md` (frontmatter `name` and `description`, then the body), and any scripts it
runs. A skill is what it knows how to do in depth: how to split a bill fairly, how to run a vote. Its `AGENTS.md` says
when to use which.

## `sketches/`

The sketches it comes with, published and saved in its chat at install: a single `.tsx` or `.jsx` file whose default
export is the app (react, react-dom, lucide-react and recharts only), an `.html` file, or a folder with `index.html`.
Tailwind and `window.marten` are there as in any sketch. No data travels: a sketch starts empty, so its empty state
matters. Keep what people share in `marten.storage` with `{ shared: true }`. That's also the only storage a Marten reaches
(`marten sketch storage set <id> <key> <json>`), so data the Marten keeps for a sketch is shared (in a 1:1, that's
you and it), and its `AGENTS.md` should name the keys and their shape.

## `tasks.yaml`

```yaml
- title: Pick the dates
  description: |
    - [ ] Ask everyone which weekends work
    - [ ] Settle on one
  assignee: marten
- title: Weekly money check-in
  repeat: "FREQ=WEEKLY;BYDAY=SU"
  time: "18:00"
  assignee: marten
- title: Connect Gmail so I can find your bookings
  assignee: owner
  when: { missing: gmail }
```

| Field | |
|---|---|
| `title` | required |
| `description` | markdown; checklists as `- [ ]` |
| `repeat` | an RRULE (`FREQ=…`), at most hourly, in the installer's time zone |
| `time` | `HH:MM`, the installer's time zone; with `repeat`, each occurrence's time |
| `assignee` | `marten` (the default: a task turn when it's due) or `owner` (the person who installed it) |
| `when` | `{ missing: <app> }`: made only while that app isn't connected |

## Versions

`version` is semver, and every change to a listing bumps it: a patch for wording and fixes, a minor version for
something new (a skill, a sketch, a task), a major one when it drops something or needs a new app. `CHANGELOG.md`
says what changed, newest first, one `## <version>` heading each; its newest entry must be the listing's version.
CI checks both on every pull request (`scripts/check-versions.ts`).

Merging publishes the version, which is reviewed before people see it. An installed Marten keeps the version it came
from and shows "Update available" with the changelog; updating refreshes its skills, adds new sketches and tasks, and
hands it the changed instructions to fold into its own `AGENTS.md`.

## Never in a package

`memory/`, `sessions/`, `rules/`, `files/`, `.marten/`, `mcp.json`, sketch storage, tokens, keys or account ids.
The validator refuses those paths and anything that looks like a secret. Caps: 5 MB in all, 200 files, text files
only (plus `icon.png`), no symlinks.
