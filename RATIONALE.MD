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

---

## Nudges Are Separate From Reminders

Reminders and nudges are different concepts in the user's mental model, so they're designed separately.

- **Reminder** = "I asked you to tell me something." User-initiated, explicit, transactional.
- **Nudge** = "You noticed something and checked in." Eliora-initiated, contextual, relational.

If they were merged, "stop reminding me" would be ambiguous — do they mean the alarm for their meeting, or the goal check-ins?

### How nudges work

1. **`nudge_settings` table** — one row per user. Controls `enabled` (bool), `frequency` (`daily` / `every_3_days` / `weekly`), `quiet_start` / `quiet_end` (no nudges during sleep), `last_nudge_at` (cooldown tracking). Defaults to enabled, every 3 days, quiet 22:00–08:00. Created lazily.

2. **`/cron/nudges` endpoint** — runs every few hours via external scheduler. For each user with nudges enabled:
   - Checks quiet hours (respects user timezone)
   - Checks cooldown (enough time since last nudge, based on frequency)
   - Checks inactivity (user hasn't messaged within the frequency threshold)
   - Checks no pending nudge already in queue
   - If all pass → loads goals + recent progress → Claude generates a contextual message → inserts into `scheduled_messages` with `kind='nudge'`, `source='system'`

3. **`/cron/deliver` endpoint** — the existing delivery job picks up all due `scheduled_messages` (reminders + nudges) and sends them. Nudges format as `👋 {message}`, reminders as `⏰ *Reminder*`.

4. **LLM-generated content** — nudges aren't templates. Claude writes each one based on the user's actual goals and recent activity. Like a friend who remembers "you said you'd start running this week" and asks how it went. First nudge includes a self-aware note: _"I'll check in like this from time to time — just tell me if you want more or less of it."_

5. **Conversational control** — no `/nudgesettings` command. Users adjust nudges by talking naturally:
   - "Check in with me every day" → `update_nudge_settings(frequency: 'daily')`
   - "Don't bug me so often" → `update_nudge_settings(frequency: 'weekly')`
   - "Stop nudging me" → `update_nudge_settings(enabled: false)`
   - "Don't message me after 10pm" → `update_nudge_settings(quiet_start: '22:00')`

### Why default ON

A friend doesn't ask permission to care. The first nudge demonstrates value before asking the user to configure anything. Users who'd benefit most from nudges are exactly the ones who'd preemptively turn them off if asked upfront.

### Two-phase cron: generate then send

Nudge generation (LLM call, slow) and delivery (Telegram API, fast) are separate cron jobs. This keeps the delivery job simple and fast — it doesn't care whether the message is a user reminder or a system nudge. Both live in `scheduled_messages`, both get delivered the same way.

**Principle:** Nudges are what make Eliora feel like a friend, not a tool. They're the difference between "an app I check" and "someone who has my back."
