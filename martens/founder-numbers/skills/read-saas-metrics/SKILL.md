---
name: read-saas-metrics
description: How to compute and read a subscription business's numbers honestly: MRR and its movements, churn, cohorts, funnels, and which numbers flatter. Read it before the Monday card or any "how are we doing" question.
---

# Reading SaaS metrics honestly

## MRR

- **MRR** is the monthly value of active subscriptions: yearly plans divided by 12, after discounts, before tax.
  Leave out one-off charges, setup fees, usage overages unless they recur, trials, and test mode.
- **Net new MRR** = new + expansion − contraction − churned. Report the parts; a flat total can hide a lot of churn.
- Gross volume (charges in the week) is not revenue growth: annual renewals, refunds and failed-payment retries make
  it jump. Don't lead with it.
- A subscription that's past due isn't churned yet; count it as churned when Stripe cancels it, and list it under
  "Watch" until then.

## Churn

- **Logo churn**: customers who cancelled this period ÷ paying customers at its start.
- **Revenue churn**: MRR lost to cancellations and downgrades ÷ MRR at its start. Net revenue retention adds
  expansion back.
- Weekly churn rates are tiny and noisy: say the count ("2 of 140") and the monthly rate when you have one.
- Ask "who" as well as "how many": one big customer leaving matters more than three small ones.

## Signups and the funnel

- Define each step by one event, and keep it fixed: visit → signup → activated (the event that means they got value)
  → paid.
- Read conversion by **cohort** (people who signed up in a week, and what they did within N days), not "this week's
  paid ÷ this week's signups", which mixes people who signed up months apart.
- A cohort that hasn't had time to convert isn't bad yet. Say how many days it's had.

## Small numbers

- Under ~30 in a group, rates swing wildly. Say the count and "too few to read much into".
- A change of one or two customers is noise until it repeats.
- Compare with the same week last month or the 4-week average as well as last week, to see past holidays and launches.

## Numbers that flatter

Cumulative totals ("10,000 signups ever"), gross volume, page views, registered users who never came back, "up 100%"
from a tiny base, and best-week cherry-picks. Use them only when asked, and say what they are.

## Saying it

The point first, then the number, then the reason if you know it, and "I think" when you're inferring. A bad week is
said as plainly as a good one, with what would help if it's clear. Never round a number to make it nicer.
