# heyEliora — Design Rationale

Documenting key design decisions and the reasoning behind them.

## Entries, Not Todos

**Decision:** Eliora tracks progress via free-form entries, not a todo/task system.

**Why:**

- Everyone already has a todo app (Todoist, Notion, Things, Apple Reminders). Building another one inside Telegram is fighting a UI battle we can't win — no drag/drop, no checkboxes, no views.
- Entries are open-ended by nature. An entry can be "did chest day" or "shipped the landing page" or "skipped the gym, felt off." Todos can't capture that.
- Entries make Eliora a journal + accountability partner, not a task manager. That's the unique angle.
- With entries, Eliora can notice patterns ("you've hit the gym 4x this week, up from 2"), celebrate progress, and connect dots ("no MVP entries in 2 weeks — still on track for June?").
- When calendar integration arrives (Milestone 7), Eliora can read your calendar and ask "you had a 2hr block for MVP work — did you use it?" That's more powerful than giving you checkboxes.

**The principle:** Eliora is the brain that watches your patterns, not another app that gives you tasks.

## Goals Are Updated, Not Duplicated

**Decision:** When a user refines or changes a goal, Eliora updates the existing one instead of creating a new one.

**Why:**

- Goals evolve. "Lose 5kg" becomes "lose 10kg, focus on fat loss" — that's the same goal refined, not two separate goals.
- Duplicates confuse the accountability tracking. If there are two weight loss goals, which one do entries count toward?
- Eliora sees existing goals in her system prompt. She should recognize when the user is talking about an existing goal and update it.

## Eliora Decides What to Track

**Decision:** The user doesn't explicitly "log an entry." Eliora listens to conversation and uses `track_progress` to record goal-relevant activity — including negative signals.

**Why:**

- Making the user say "log this" breaks the conversational magic. If someone says "went to the gym today," Eliora should just quietly track it against their fitness goal.
- Negative entries matter. "Skipped the gym" or "ate pizza instead of meal prep" are data points too. Eliora needs the full picture for honest accountability.
- The tool is called `track_progress` (not `log_entry`) because it describes what Eliora is doing from an accountability perspective — tracking whether the user is making progress on their goals.
- Only goal-relevant activity gets tracked. Random conversation ("what's the weather?") doesn't create entries. Eliora uses judgment.

## Anthropic SDK Direct (Not Vercel AI SDK)

**Decision:** Use `@anthropic-ai/sdk` directly instead of Vercel AI SDK's abstraction.

**Why:**

- Vercel AI SDK had compatibility issues with Zod v4 for tool definitions — the schema conversion broke with `input_schema.type: Field required` errors.
- For a single-provider project (Claude), the abstraction layer added complexity without benefit.
- Anthropic's native tool format (`input_schema`) works without any schema library.
- If multi-provider support is needed later, the AI SDK can be re-introduced — but right now, one fewer dependency that can break.
