# Marten registry

The Martens anyone can install in [Marten](https://marten.sh), the messenger where your agent is a member of your
chats. Each folder in `martens/` is one listing: install it as a Marten of your own, or add it to a group.

A listing is a template: its instructions, skills, sketches and starter tasks. Never anyone's memory, chats or data.
Installed, it's yours: it learns from you, uses your connected apps, and keeps what you tell it.

## Martens

Two shelves, as in the apps. A Marten that can be both yours and a group's (Trip Planner) is on both.

**For groups**: added to a group chat, shared by everyone in it.

| | |
|---|---|
| [Trip Planner](martens/trip-planner) | dates, itinerary, who books what, the shared budget |
| [Settle Up](martens/settle-up) | who paid what, who owes whom, the fewest payments to settle |
| [House](martens/house) | chores on a rotation, groceries, bills |
| [Event Host](martens/event-host) | RSVPs, the checklist, the budget, the run of the day |
| [Game Night](martens/game-night) | picks the night, keeps score, the season's table |
| [Book Club](martens/book-club) | the pick, the schedule, questions before each meeting |
| [Challenge](martens/challenge) | check-ins, streaks, a leaderboard |
| [Standup](martens/standup) | a team's async standup and its blockers |
| [Decider](martens/decider) | gathers options, runs the vote, calls it |
| [Couples](martens/couples) | a weekly check-in for two (everyone in the group agrees first) |

**For you**: a Marten of your own, with its 1:1.

| | |
|---|---|
| [Chief of Staff](martens/chief-of-staff) | inbox triage, a morning brief, follow-ups (Gmail) |
| [Money](martens/money) | categories, a weekly recap, "can I afford this?" (YNAB) |
| [Ghostwriter](martens/ghostwriter) | your posts and threads, in your voice (Typefully) |
| [Founder Numbers](martens/founder-numbers) | revenue, signups and churn every Monday (Stripe, PostHog) |
| [Eng Lead](martens/eng-lead) | standup from Linear and GitHub, reviews waiting on you |
| [Coach](martens/coach) | a training plan that adapts to your week |
| [Language Partner](martens/language-partner) | practice on calls, corrected gently |
| [Job Hunt](martens/job-hunt) | applications, follow-ups, mock interviews |
| [Life Admin](martens/life-admin) | renewals, documents, appointments |
| [Reflect](martens/reflect) | someone to talk things through with* |
| [Journal](martens/journal) | an evening prompt, and looking back* |
| [Calm](martens/calm) | breathing and wind-down, said aloud* |
| [Mentor](martens/mentor) | career decisions and hard conversations, rehearsed |

\* Reflect, Journal, Calm and Couples aren't therapists or professionals of any kind, and say so.

## Make one

1. Read [the package format](docs/format.md) and [the listing policy](docs/policy.md).
2. Copy a listing that's close to yours (`martens/trip-planner` is the reference) into `martens/<your-slug>/`.
3. Check it: `bun scripts/validate.ts martens/<your-slug>`.
4. Open a pull request. CI checks it again; once it's merged, it's published and reviewed like every listing.

You can also publish from your own repo, or have a Marten package itself from its 1:1, with the `marten` CLI
(`@martenhq/cli`, coming with the launch): `marten listing validate`, `marten listing publish`.

Every public version is reviewed: checks first (the package, its sketches, secrets and personal details, the
instructions against the policy, a test conversation), then a person.
