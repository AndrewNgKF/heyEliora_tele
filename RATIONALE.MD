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

---

## The Dopamine Loop (Why Users Come Back)

Apple Reminders fires and forgets. Todoist gives you checkboxes. Neither one _cares_ whether you follow through. Eliora's moat is the closed loop: goal → tracking → streak → accountability → celebration.

### Why this matters

The user doesn't come back because Eliora has features. They come back because:

1. **Streaks create momentum.** `getActivityStreak()` computes consecutive days with entries. This shows up in the system prompt so Eliora can say "that's 5 days running." Duolingo proved that streaks are the single highest-leverage retention mechanic. Ours is earned — it only counts real progress entries, not logins.

2. **Completion gets celebrated.** When `track_progress` logs an entry that hits a goal's target, the system prompt tells Eliora to recognize it: "You actually did it." This is the confetti moment. Most productivity tools treat completion as silent — the task disappears. Eliora makes it a moment.

3. **Nudges reference real data.** Generic push notifications ("Don't forget your goals!") get ignored. Eliora's nudges reference the user's actual goals, recent entries, and streak status. "You had 4 days running on that gym goal — don't break it now" hits different than "Time to check in!"

4. **Knowledge accumulates.** Every conversation makes the next one smarter (rolling summaries, preferences, entries). Apple Reminders on day 365 is identical to day 1. Eliora on day 365 knows your avoidance patterns.

### Design decisions

- **Streaks count entry days, not login days.** Opening the app shouldn't count. Telling Eliora what you did should.
- **Completion detection is prompt-based, not code-based.** The LLM reads the goal target and the latest entry and decides if it's a match. This handles fuzzy targets ("get comfortable cooking") that code can't parse.
- **/start asks a question, not makes a statement.** "What's the one thing you're trying to get done this month?" gets the user talking immediately. The first reply becomes the first goal. Zero-friction onboarding.
- **Static nudge messages for empty users ask the same question as /start.** Consistency — whether you arrived via /start or via a nudge, you get the same easy entry point.

**Principle:** Eliora is sticky because she closes the loop. You tell her what you're doing → she tracks it → she notices patterns → she calls you out → you feel seen → you come back.

---

## Prompt Caching (Cost Control)

At 1.67 cents per message, LLM cost is the dominant line item. Most of that spend is input tokens — the system prompt (~2,500 tokens), 12 tool definitions (~1,500 tokens), and conversation history are re-sent on every single API call, including tool-use round trips.

Anthropic's prompt caching charges 1.25x on the first write but only 0.1x on subsequent reads within a 5-minute window. For a chatbot where users send messages in bursts, this is essentially free savings.

### Three-layer cache strategy

1. **Tools** — `cache_control` on the last tool definition. Tool schemas are identical across all users and all requests. Every request after the first gets a cache hit here.
2. **Static system prompt** — `cache_control` on the `BASE_PROMPT` content block. Same ~2,500 tokens for every user. The system prompt is split into two blocks: the static base (cached) and the per-user context (goals, entries, prefs — not cached across users, but cached within a single user's burst).
3. **Conversation history** — top-level `cache_control` enables automatic caching. As messages grow each turn, the prefix from prior turns is read from cache. Only the new assistant reply + user message are fresh tokens.

### Why split the system prompt

The system prompt was a single string. That meant the per-user data (goals, timezone, entries) at the end invalidated the cache for the static instructions at the beginning. Splitting into `[{ text: BASE_PROMPT, cache_control }, { text: personalized }]` lets the static prefix cache across all users while the per-user block caches within a conversation burst.

### Timestamp in user message, not system prompt

The system prompt originally contained `Current local time for the user: Sunday, April 20, 2026, 14:23`. This changes on every single request, which means it busts the prefix hash for everything after it — including the entire conversation history. Since Anthropic's cache is a prefix cache (hash of all content from position 0 to the breakpoint), one changing byte invalidates everything downstream.

The fix: prepend the timestamp to the user message as `[Sunday, April 20, 2026, 14:23] hey what's up`. The system prompt tells Eliora to look for it in brackets. Now the per-user system block only changes when actual data changes (new goal, new entry, etc.), not every second. The user message is always the last thing in the prefix anyway, so a changing timestamp there doesn't bust anything above it.

### Why 5-minute TTL is fine

The 1-hour TTL costs 2x on writes vs 1.25x for 5-minute. Users chat in bursts — 5-10 messages in a few minutes, then gone. The 5-minute cache refreshes on every hit, so it stays alive through the whole burst. Paying 60% more for the write to cover the edge case of someone coming back 8 minutes later isn't worth it.

### Haiku 4.5 minimum: 4,096 tokens

Haiku 4.5 requires at least 4,096 tokens for caching to activate. Tools (~1,500) + BASE_PROMPT (~2,500) = ~4,000+ tokens, clearing the threshold. If the prompt were shorter, caching would silently fail with no error — both `cache_creation_input_tokens` and `cache_read_input_tokens` would be 0.

**Principle:** Cache what's shared (tools, base prompt) with explicit breakpoints. Cache what grows (conversation) with automatic caching. Don't cache what changes unpredictably (per-user context across different users).

---

## UX: Simplicity Over Features

### Conversational /start

The /start message doesn't explain what Eliora can do. It asks what _you're_ working on. Features are discovered through use, not through a feature list. The single fallback button ("Not sure yet — tell me more") links to a brief howto, but most users should just answer the question.

### Minimal command menu

12 commands → 5. The commands that remain (`start`, `goals`, `whatsup`, `reminders`, `forget`) are the ones that need dedicated UI. Everything else (`/remind`, `/timezone`, `/preferences`, `/profile`, `/progress`, `/usage`, `/howto`) still works — the handlers exist for power users — but new users don't see them. Less choice = less paralysis.

### Emoji discipline

Functional emoji only: 👋 on nudges (identifies message type), ⏰ on reminders (same). Decorative emoji stripped. If it doesn't serve a purpose, it's clutter.

**Principle:** If you have to explain your product with a feature list, your onboarding has already failed. Demonstrate value in the first exchange.
