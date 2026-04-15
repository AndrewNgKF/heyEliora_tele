# heyEliora — Milestones

## Milestone 1: The Bot (Foundation)

Get a working Telegram bot that can have a basic conversation via LLM.

- [ ] Init project (Bun + JavaScript + JSDoc + project structure)
- [ ] Set up grammY bot with webhook via Hono
- [ ] Bot responds to `/start` with a welcome message
- [ ] Connect Vercel AI SDK + Claude
- [ ] Bot forwards user messages to Claude and returns the response
- [ ] Basic conversation context (last N messages kept in memory)
- [ ] Environment config (.env for bot token, API keys)

**Done when:** You can message Eliora on Telegram and have a real back-and-forth conversation.

---

## Milestone 2: Database + User Memory

Eliora remembers who you are between conversations.

- [ ] Set up Turso client + connection
- [ ] Create users table (telegram_id, name, created_at)
- [ ] Create conversations table (user_id, role, content, timestamp)
- [ ] Store and retrieve conversation history per user
- [ ] Eliora loads past context when you message her again
- [ ] `/forget` command — clears conversation history

**Done when:** You can close Telegram, come back hours later, and Eliora remembers what you talked about.

---

## Milestone 3: Personality + Goals

Eliora knows your goals and keeps you accountable.

- [ ] Create user_preferences table (goals, work style, tone preferences)
- [ ] `/goals` command — set or update your goals and ambitions
- [ ] `/preferences` command — set work style, tone, scheduling preferences
- [ ] System prompt dynamically built from user preferences + goals
- [ ] Eliora references your goals naturally in conversation
- [ ] `/whatsup` command — Eliora gives a status check on your goals

**Done when:** You tell Eliora your goals, and she factors them into her responses and suggestions.

---

## Milestone 4: Document Parsing + RAG

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

## Milestone 5: Approval Flow + Actions

Eliora proposes actions and waits for your approval.

- [ ] Inline keyboard system (Approve / Reject / Edit buttons)
- [ ] Action proposal format ("I'd like to do X. Approve?")
- [ ] Action queue — store pending actions per user
- [ ] Eliora suggests next actions after reading documents or conversations
- [ ] Action history — `/actions` shows recent completed actions

**Done when:** Eliora suggests an action, you tap Approve, and she confirms it's done. Nothing happens without your say-so.

---

## Milestone 6: Scheduling + Reminders

Eliora can remind you and run recurring check-ins.

- [ ] Set up node-cron for scheduled jobs
- [ ] `/remind` command — set a one-time reminder
- [ ] Recurring reminders (daily, weekly)
- [ ] Weekly recap message (tasks handled, goals alignment %)
- [ ] Goal check-in (weekly — "3 of 8 tasks aligned with your Q2 goal")
- [ ] Re-engagement nudge (if inactive 3+ days)

**Done when:** Eliora sends you a reminder you set, and delivers a weekly recap without being asked.

---

## Milestone 7: Integrations (Calendar + Email)

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

## Milestone 8: Style Matching

Eliora writes like you.

- [ ] Collect writing samples (user forwards past emails/messages)
- [ ] Store style profile per user (tone, formality, patterns)
- [ ] System prompt includes style guidelines derived from samples
- [ ] Eliora's drafts match your writing voice
- [ ] `/style` command — see and update your style profile

**Done when:** Eliora drafts an email that sounds like you wrote it, not like a robot.

---

## Milestone 9: Privacy + Data Control

Users trust Eliora because they're in control.

- [ ] `/privacy` command — shows exactly what Eliora stores about you
- [ ] `/delete` command — nuclear option, wipes all user data
- [ ] `/export` command — download your data
- [ ] Data retention policy (auto-delete old conversations after N days, configurable)
- [ ] Clear documentation on what's stored and where

**Done when:** A user can see, export, and delete everything Eliora knows about them in under 30 seconds.

---

## Milestone 10: Open Source + Deploy

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

## Current Status

**Active milestone:** 1 — The Bot
