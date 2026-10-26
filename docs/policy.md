# Listing policy

Every public version of a listing is reviewed: first by checks, then by a person. A listing shared only by link
isn't, and says so when someone installs it.

## Every listing

- **Does what it says.** Its summary, README and `AGENTS.md` describe the same Marten. No hidden jobs.
- **Asks for what it needs, no more.** Every app in `needs` is used for the `why` it gives. It doesn't ask for an
  app "just in case".
- **Keeps people's things where they are.** It never sends what it reads (messages, emails, files, memory) anywhere
  but where its owner asked: no `curl` to a host it doesn't name and explain, no "forward every message to…",
  no collecting contacts.
- **Acts only when asked.** Sending, posting, paying, deleting and anything people can't take back is done when
  someone asks for it, or after asking with a question. A Marten may draft; it doesn't send on its own.
- **No one's private details.** Nothing about the author or anyone real in `AGENTS.md`, skills, tasks or sketches.
- **Speaks honestly.** It doesn't pretend to be a person, a company it isn't, or an expert it isn't.
- **No prompt injection.** Nothing that tells Marten to ignore its platform's rules, reveal other chats, or act
  for someone other than the person it's working for.
- **Safe for everyone in a group.** A listing `for: group` treats every member alike, takes no sides in a dispute,
  and keeps one member's words out of another's private chats.

Not allowed at all: sexual content involving minors, content that sexualises real people, help with weapons or
violence, harassment, scams, gambling with real money, impersonating a person, medical, legal or financial services
presented as professional advice, and anything illegal where it's used.

## Wellbeing and mentors

Martens people talk to about how they feel (`wellbeing`) or their life and work (`mentors`) are welcome. They carry
more weight, so:

- **Never therapy.** A listing is never called or described as therapy, a therapist, counselling, treatment or a
  cure. Several US states regulate those words, and some ban AI therapy outright. Say "someone to talk to",
  "reflect", "check in", "talk it through".
- **Says what it isn't.** Its README and its first message say plainly that it isn't a professional and is no
  substitute for one.
- **The crisis skill.** Every `wellbeing` Marten gets Marten's own crisis skill at install (`shared/skills/crisis`),
  whatever its package holds. A listing may not contradict it, weaken it or tell the Marten to ignore it.
- **No diagnosis, no medication.** It doesn't name conditions, assess people or advise on medication or stopping
  treatment.
- **No dependence.** It doesn't discourage people from talking to the people in their life or to professionals,
  and doesn't make itself the only support.
- **One person, or everyone agreeing.** `for: you` by default. A listing for a couple or a family (`for: group`) is
  installed only when every member says yes.
- **Reviewed by a person every version.** Review's test conversation includes a message showing risk, which must get
  the crisis answer.

## Review

1. **Checks**, on submit: the package (`scripts/validate.ts`), sketches build and render, a scan for secrets and
   personal details, a model's read of the instructions and skills against this policy, and a test install that
   tries the listing's `examples`.
2. **A person** reads the summary, the checks, the test conversation and what changed since the last approved version,
   and approves it, asks for changes (with a note) or rejects it.
3. **After**: anyone can report a listing. A listing that breaks this policy is taken down at once; Martens already
   installed stay their owners', marked as removed, and get no more updates.
