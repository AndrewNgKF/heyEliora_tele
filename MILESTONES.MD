# heyEliora — Milestones

## Milestone 1: The Bot (Foundation) ✅

Get a working Telegram bot that can have a basic conversation via LLM.

- [x] Init project (Bun + JavaScript + JSDoc + project structure)
- [x] Set up grammY bot with webhook + Express server
- [x] Bot responds to `/start` with a welcome message
- [x] Connect Claude via Anthropic SDK
- [x] Bot forwards user messages to Claude and returns the response
- [x] Basic conversation context (last N messages kept in memory)
- [x] Environment config (.env for bot token, API keys)

**Done.** Commit `6231d66`.

---

## Milestone 2: Database + User Memory ✅

Eliora remembers who you are between conversations.

- [x] Set up Turso client + connection
- [x] Create users table (telegram_id, name, created_at)
- [x] Create messages table (telegram_id, role, content, created_at)
- [x] Store and retrieve conversation history per user
- [x] Eliora loads past context when you message her again
- [x] `/forget` command — clears conversation history

**Done.** Commit `6231d66`.

---

## Milestone 3: Personality + Goals ✅

Eliora knows your goals and keeps you accountable.

- [x] Goals table + conversational goal management via tools (save, update, remove)
- [x] Preferences table (work style, tone, schedule) saved conversationally
- [x] `/goals` command — view goals (adding/updating happens via conversation)
- [x] `/preferences` command — view preferences
- [x] System prompt dynamically built from goals, preferences, and recent entries
- [x] `/whatsup` command — data-driven accountability check-in
- [x] `track_progress` tool — Eliora silently logs goal-relevant activity
- [x] `goal_entries` table — progress tracking tied to goals
- [x] `/progress` command — view recent entries grouped by goal
- [x] Switched from Vercel AI SDK to Anthropic SDK direct
- [x] RATIONALE.MD documenting design decisions
- [x] Goal metrics — baseline (where you're starting) and target (what good looks like) stored per goal
- [x] Eliora asks about metrics when defining goals, uses them in accountability check-ins

**Done.** Commit `7b8e72b`.

---

## Milestone 4: Scheduling + Reminders

Eliora can remind you and run recurring check-ins.

- [x] Reminders table (telegram_id, content, remind_at, sent)
- [x] `set_reminder` tool — Eliora parses "remind me to X at Y" conversationally
- [x] `update_reminder` + `cancel_reminder` tools
- [x] Scheduler (cron endpoint) checks for due reminders and pushes messages
- [x] `/remind` command — set a one-time reminder
- [x] `/reminders` command — list active reminders, cancel by ID
- [x] Recurring reminders (daily, weekly)
- [x] Timezone handling — users can set their timezone in preferences, reminders and nudges respect that
- [x] `/timezone` command — view/set timezone with inline keyboard
- [x] Nudge system — contextual check-ins based on inactivity, frequency, and quiet hours
- [x] Nudge saved in background (scheduled_messages queue), delivered by sender.js cron
- [x] Re-engagement nudge (static message for empty users, LLM-generated for active users)
- [x] Ghost user filter (30-day activity check prevents wasting LLM on abandoned accounts)
- [x] Activity streak tracking (consecutive days with entries, surfaced in prompts and nudges)
- [x] Goal completion detection (system prompt instructs Eliora to celebrate hitting targets)
- [x] Conversational /start (direct question, not feature list)
- [x] Simplified command menu (12 → 6 commands: start, goals, whatsup, reminders, mydata, forget)
- [x] Rolling user summaries (background summarization of conversation history)
- [x] `/mydata` command — full transparency, shows everything Eliora stores (including usage)
- [x] Vitest test suite — 71 tests across DB queries, tool execution, HTTP endpoints (95%+ coverage)
- [x] Landing page — hero carousel, universal letter, 5 pitch points, FAQ
- [x] Terms of Use + Privacy Policy pages
- [ ] Weekly recap message (tasks handled, goals alignment %)
- [ ] Goal check-in (weekly — "3 of 8 tasks aligned with your Q2 goal")

**Done when:** Eliora sends you a reminder you set, and delivers a weekly recap without being asked.

---

## Milestone 5: Web Interface + Payment + User Management and Profile

<!-- TODO: Fill it in from payment architecture.md -->
<!-- TODO: Periodically Eliora should gather and summarise information through conversation in background "what she knows about you" -->
<!-- TODO: Users may not feel comfy paying over tele, have a web UI where users can pay, see their goals, reminders and full information -->

## Asides

- [x] RATIONALE.MD — document design decisions and trade-offs
- [x] Switch IDs from auto-increment integers to short alphanumeric (8 chars) — better UX in Telegram, no privacy leak
- [x] Track usage metrics (number of messages, actions taken) for future analytics and potential paid tier limits
- [x] Summarize conversations in the database to save space (rolling user summaries, refreshed after threshold)
- [x] Personal Profile — `/profile` command shows goals, preferences, recent activity at a glance
- [x] Landing page with clear value prop and setup instructions
- [ ] Make it appealing, Eliora logo, buttons for user interaction, etc.
- [ ] Consider easter eggs or fun personality quirks to make Eliora more engaging and less robotic

---

## Milestone 6: Approval Flow + Actions

Eliora proposes actions and waits for your approval.

- [ ] Inline keyboard system (Approve / Reject / Edit buttons)
- [ ] Action proposal format ("I'd like to do X. Approve?")
- [ ] Action queue — store pending actions per user
- [ ] Eliora suggests next actions after reading documents or conversations
- [ ] Action history — `/actions` shows recent completed actions

**Done when:** Eliora suggests an action, you tap Approve, and she confirms it's done. Nothing happens without your say-so.

---

## Milestone 7: Document Parsing + RAG

Eliora can read your documents and recall relevant info.

- [ ] Set up sqlite-vec for vector search in Turso
- [ ] Embeddings generation (Anthropic or OpenAI)
- [ ] Document upload handling (user sends a file in Telegram)
- [ ] Parse PDFs (`unpdf`), Word docs (`mammoth`), plain text
- [ ] Chunk documents and store embeddings
- [ ] RAG retrieval — Eliora searches docs when answering questions
- [ ] `/docs` command — list uploaded documents
- [ ] `/deletedoc` command — remove a document and its embeddings

**Done when:** You send Eliora a PDF, then ask her questions about it and she answers accurately from the content.

---

## Milestone 8: Integrations (Calendar + Email)

Eliora connects to your tools.

- [ ] Google OAuth2 flow via Telegram (send auth link, store tokens)
- [ ] Google Calendar — read upcoming events
- [ ] Google Calendar — create/modify events (with approval)
- [ ] Gmail — read recent emails, summarize inbox
- [ ] Gmail — draft replies (with approval before sending)
- [ ] `/connect` command — manage connected services
- [ ] `/disconnect` command — revoke access and delete tokens

**Done when:** You ask Eliora "what's on my calendar today?" and she answers. She drafts an email reply and waits for your approval to send.

---

## Milestone 9: Style Matching

Eliora writes like you.

- [ ] Collect writing samples (user forwards past emails/messages)
- [ ] Store style profile per user (tone, formality, patterns)
- [ ] System prompt includes style guidelines derived from samples
- [ ] Eliora's drafts match your writing voice
- [ ] `/style` command — see and update your style profile

**Done when:** Eliora drafts an email that sounds like you wrote it, not like a robot.

---

## Milestone 10: Privacy + Data Control

Users trust Eliora because they're in control.

- [ ] `/privacy` command — shows exactly what Eliora stores about you (see also: `/mydata` already exists)
- [ ] `/delete` command — nuclear option, wipes all user data (see also: `/forget` wipes 7 of 9 tables)
- [ ] `/export` command — download your data
- [ ] Data retention policy (auto-delete old conversations after N days, configurable)
- [ ] Clear documentation on what's stored and where

**Done when:** A user can see, export, and delete everything Eliora knows about them in under 30 seconds.

---

## Milestone 11: Open Source + Deploy

Ship it.

- [ ] Clean up repo, write README with setup instructions
- [ ] Docker / docker-compose for self-hosting
- [ ] Environment template (.env.example)
- [ ] Deploy hosted version (Fly.io / Railway)
- [ ] Free tier limits (5 actions/day, 7-day memory)
- [ ] Paid tier via Stripe or Lemon Squeezy
- [ ] Landing page (simple, can be a GitHub README to start)

**Done when:** Someone can clone the repo, set their API keys, and have their own Eliora running in 10 minutes.

---
