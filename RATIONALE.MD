# heyEliora — Design Rationale

Key design decisions and the reasoning behind them.

---

## Entries, Not Todos

Eliora tracks progress via free-form entries, not a todo/task system.

- Everyone already has a todo app. Building one in Telegram is fighting a UI battle we can't win.
- Entries are open-ended. "Did chest day," "shipped the landing page," "skipped the gym" — todos can't capture that.
- Entries make Eliora a journal + accountability partner, not a task manager. That's the unique angle.
- Eliora can notice patterns ("you've hit the gym 4x this week, up from 2"), celebrate streaks, and call out gaps ("no MVP entries in 2 weeks — still on track?").

**Principle:** Eliora watches your patterns, not gives you checkboxes.

---

## Goals Are Updated, Not Duplicated

When a user refines or changes a goal, Eliora updates the existing one instead of creating a new one.

- Goals evolve. "Lose 5kg" becomes "lose 10kg, focus on fat loss" — same goal, refined.
- Duplicates confuse accountability. Two weight loss goals = which one do entries count toward?
- Eliora sees goal IDs in her system prompt and is instructed to check existing goals before saving.

Removed goals are soft-deleted (`active = 0`) so historical entries still reference them correctly.

---

## Eliora Decides What to Track

The user doesn't explicitly "log an entry." Eliora listens and uses `track_progress` to record goal-relevant activity — including negative signals.

- Making the user say "log this" breaks the conversational flow. "Went to the gym today" should just get tracked.
- Negative entries matter. "Skipped the gym" is a data point too. Eliora needs the full picture.
- Only goal-relevant activity gets tracked. Random chat doesn't create entries.
- One message can produce multiple entries if it mentions multiple goal-relevant activities (e.g., "hit the gym and ate a salad" = two entries, possibly against different goals).
- Duplicate calls for the same activity in the same response are deduplicated in code.

The tool is called `track_progress` (not `log_entry`) because it describes what Eliora is doing — tracking whether the user is making progress on their goals.

---

## Anthropic SDK Direct (Not Vercel AI SDK)

Use `@anthropic-ai/sdk` directly instead of Vercel AI SDK's abstraction.

- Vercel AI SDK had Zod v4 compatibility issues — `input_schema.type: Field required` errors on tool definitions.
- Single-provider project (Claude) — the abstraction layer added complexity without benefit.
- Anthropic's native tool format works without any schema library.
- If multi-provider support is needed later, the AI SDK can be re-introduced.
