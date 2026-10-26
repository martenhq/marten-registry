---
name: daily-eng-brief
description: What an engineering lead's morning brief should contain, in what order, how to tell stuck from slow, and what to leave out. Read it before the morning standup or any "what's going on" question.
---

# The daily engineering brief

## Gather

- **GitHub**: open PRs in their repos (review requested from them or their team, age, check status, last activity),
  PRs merged since the last brief, and their own PRs with new reviews or failing checks.
- **Linear**: issues assigned to them; the team's issues in progress (last update, linked PRs); issues moved to done
  since the last brief; anything urgent or high priority opened since then; blocked issues.
- **Slack** (if connected): direct messages from the team since the last brief that asked them something and got no
  answer.

"Since the last brief" is since the previous working day's morning; on Monday, since Friday's.

## Write, in this order

1. **Waiting on you**: review requests, assigned issues that are new or due, questions to them. Oldest first, each
   with its age: "#412 Add rate limits (waiting 2 days)".
2. **Stuck**: see below. Each with who has it and the one thing that would unstick it, if it's clear.
3. **Moved**: what merged and what closed, grouped by project, one line each. Five at most; "and 6 more".
4. **Today's risks**: a release, a deadline, a failing main branch, an incident, someone out.

Leave out sections with nothing in them. Under fifteen lines.

## Stuck or slow?

Stuck, worth a line:
- In progress three working days with no commit, PR or update.
- A PR open over two working days with no review, or with changes requested and no reply for two days.
- Checks failing on a PR for over a day with no new commit, or main failing at all.
- Blocked by something that isn't moving itself.
- Reopened twice.

Slow, not worth a line: a big issue moving steadily, a PR waiting on a reviewer who's out (say that once), anything
under a day old.

## Leave out

Bots' PRs (dependency bumps, release PRs) unless failing; drafts; issues in backlog; vanity counts ("42 commits");
anything they did themselves yesterday, which they know.

## Name things, not people's effort

Use PR numbers and issue ids with their titles, and say who has something so they can ask. Never call someone slow
or rank people; the brief is about the work.
