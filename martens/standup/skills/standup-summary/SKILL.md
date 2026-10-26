---
name: standup-summary
description: How to write a standup summary people read in ten seconds: blockers first, one line per person, nothing invented. Read it before posting the day's summary.
---

# A useful standup summary

## The shape

1. **Blockers first**, if there are any: who's blocked, on what, and who could help. One line each.
2. **One line per person**: their name, then today's focus. Add what they finished only when it's news to the team
   (shipped, merged, closed, decided).
3. **No update yet**: the names, once, in one line at the end.

```
Standup, Tue 14

Blocked
- Sam: waiting on API access from the platform team (2 days)

Today
- Ana: invoice export (shipped the CSV import yesterday)
- Sam: docs while waiting on access
- Lee: onboarding emails

No update yet: Kai
```

## Rules

- **Short.** The whole summary fits on a phone screen. Cut "worked on", "continued", "various".
- **Their words, tightened.** Keep the nouns people used (the feature, the ticket, the customer). Never add work they
  didn't mention, and never guess at status.
- **Neutral.** No praise, no "only", no "still". Nobody is ranked, and nobody is late.
- **Blockers are specific.** "Waiting on X from Y" beats "blocked". Say how long only when it's more than a day.
- **Overlap and help.** If two people mention the same thing, or one can clear another's blocker, say so in a line:
  "Lee knows the billing API, which Sam is waiting on."
- **Nothing private.** Leave out anything someone said was personal (a doctor's visit, a family thing): "out this
  afternoon" is enough.

## Quiet days

- Nobody posted: post nothing.
- One or two people: the same shape, shorter.
- A day the team said was off: no ask, no summary.

## On Mondays

Put last Friday's open blockers at the top if they're still open, then the day as usual.
