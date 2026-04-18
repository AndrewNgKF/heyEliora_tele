# heyEliora — Tech Stack

## Core

| Layer            | Choice                        | Why                                                                                                        |
| ---------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Runtime**      | Bun                           | Fast, built-in test runner, good DX. Runs JS natively, no build step                                       |
| **Language**     | JavaScript + JSDoc            | No TS build tooling. JSDoc gives editor type hints where useful without a compile step                     |
| **Framework**    | Express v5                    | HTTP layer is minimal (just webhook endpoint + health check). No need for anything fancier                 |
| **Telegram Bot** | grammY v1                     | Best JS bot framework — Composer pattern for handler separation, middleware system, inline keyboards       |
| **LLM**          | Claude (Anthropic SDK direct) | Best at following nuanced instructions and tool use. Direct SDK gives full control over the tool-call loop |
| **Database**     | Turso (libSQL)                | SQLite-based, edge-ready. One DB for all relational data                                                   |

## Auth & Security

| Component         | Choice                                                             |
| ----------------- | ------------------------------------------------------------------ |
| **User auth**     | Telegram user ID (bot already knows who you are)                   |
| **API keys**      | Environment variables, validated at startup, never in DB           |
| **Rate limiting** | Tier-based daily message caps, timezone-aware reset                |
| **Data deletion** | `/forget` clears conversation history. Full `/delete` planned (M9) |

## Project Structure

### Current (M1–M3)

```
src/
├── index.js          # Entry point — boots DB, picks webhook or polling
├── bot/
│   ├── index.js      # Wires the bot: middleware → commands → buttons
│   ├── server.js     # Express webhook endpoint + health check + protected cron endpoint
│   ├── commands.js   # Slash commands (/start, /goals, etc) + free-text catch-all
│   ├── callbacks.js  # Inline button tap handlers (Set a goal 🎯, etc)
│   ├── middleware.js  # Per-request setup: identify user, sync to DB, add replyMd
│   └── helpers.js    # Shared domain logic: format goals, run check-ins
├── config/
│   └── CONSTANTS.js  # Tiers, limits, timezone options, command menu, UI text
├── db/
│   ├── index.js      # Turso connection + table creation (CREATE IF NOT EXISTS)
│   └── queries.js    # Every DB operation as a named function
├── jobs/
│   └── reminders.js  # External-cron-triggered reminder processor + recurring rescheduling
├── llm/
│   ├── chat.js       # Conversation loop: history → system prompt → Claude → tool calls → response
│   └── tools.js      # Tool definitions (what Claude can do) + execution (what actually happens)
└── utils/
    └── id.js         # Random short alphanumeric ID generator
```

### Planned (future milestones)

```
src/
├── jobs/             # Cron / scheduled tasks: reminders, weekly recaps, nudges (M4)
├── rag/              # Embeddings, vector search, document chunking (M6)
└── integrations/     # Calendar, email, task management adapters (M7)
```

## Database Schema

Seven tables, all in Turso:

| Table          | Purpose                                          |
| -------------- | ------------------------------------------------ |
| `users`        | Telegram ID, name, tier, timezone                |
| `messages`     | Conversation history (for LLM context window)    |
| `goals`        | User goals with baseline + target                |
| `preferences`  | Work style, tone, schedule prefs                 |
| `goal_entries` | Progress logs tied to specific goals             |
| `daily_usage`  | Message counts + token usage per user per day    |
| `reminders`    | One-time + recurring reminders and system nudges |

## Key Design Decisions

- **Anthropic SDK direct, not Vercel AI SDK:** Started with Vercel AI SDK but switched in M3. The tool-call loop needs fine control (dedup, error handling, multi-step). Direct SDK is simpler for this. If we need model swapping later, the abstraction boundary is `chat()` — one function to wrap.
- **Turso for everything:** One database for all relational data. Vector search (sqlite-vec) will slot in for RAG in M6 without adding a second service.
- **Composers, not one big file:** grammY's Composer pattern splits handlers into separate files (commands, buttons) that get `bot.use()`'d in. Each file owns its domain. Middleware runs first, so handlers get `ctx.userId`, `ctx.replyMd()` for free.
- **Tier-based usage limits without cron:** Daily reset is lazy — `checkUsage()` compares against today's date in the user's timezone. No scheduled job, no Redis. Just a date comparison on each message.
- **Save messages after success, not before:** User message is only persisted to history after Claude responds successfully. Prevents malformed alternating-role sequences if the API fails mid-request.
- **External cron, not always-on workers:** Vercel Hobby cron is too imprecise for reminders. A protected `/cron/deliver` endpoint is triggered by an external scheduler, while Turso remains the source of truth.

## Deploy Setup

### Required environment variables

```
BOT_TOKEN=...
ANTHROPIC_API_KEY=...
WEBHOOK_URL=https://your-domain.com
TELEGRAM_WEBHOOK_SECRET=...
TURSO_URL=libsql://your-db.turso.io
TURSO_TOKEN=...
CRON_SECRET=...
```

Notes:

- `WEBHOOK_URL` should be the root domain, not `/webhook`. The app appends `/webhook` itself.
- `TELEGRAM_WEBHOOK_SECRET` and `CRON_SECRET` should be different long random strings.
- Never commit `.env`. Only commit `.env.example`.

### Public routes

| Route             | Purpose                             |
| ----------------- | ----------------------------------- |
| `/`               | Landing page                        |
| `/health`         | Health check                        |
| `/webhook`        | Telegram webhook                    |
| `/cron/deliver` | External cron trigger for scheduled messages |

### cron-job.org setup

Create a job with:

- **URL:** `https://your-domain.com/cron/deliver`
- **Method:** `POST`
- **Header:** `x-cron-secret: <CRON_SECRET>`
- **Timezone:** `UTC`
- **Frequency:** every 5 minutes

Use cron-job.org's test run once after deployment, then verify the JSON response and Vercel logs.

### Open-source safety checklist

- Confirm `.env` is untracked: `git ls-files .env`
- Use placeholders only in `.env.example`
- Rotate secrets immediately if any real values were ever committed or pushed
- Keep `CRON_SECRET` only in Vercel and cron-job.org
- Keep `TELEGRAM_WEBHOOK_SECRET` only in Vercel and Telegram webhook config

## Planned Tech (not yet implemented)

| Component            | Planned choice                                                   | Milestone |
| -------------------- | ---------------------------------------------------------------- | --------- |
| **Embeddings**       | Anthropic / OpenAI embeddings API                                | M6        |
| **Vector search**    | sqlite-vec (Turso extension)                                     | M6        |
| **Document parsing** | `unpdf` for PDFs, `mammoth` for Word docs                        | M6        |
| **Scheduling**       | cron-job.org hitting a protected HTTP endpoint every 5 minutes   | M4        |
| **Task queue**       | None for now — Turso reminders table acts as the source of truth | M4        |
| **Google Calendar**  | Google Calendar API (OAuth2)                                     | M7        |
| **Gmail**            | Gmail API (OAuth2) — read, draft, send with approval             | M7        |
| **Hosting**          | Vercel (current), Fly.io or Railway later if needed              | M10       |
| **Monitoring**       | Sentry (errors) + Axiom (logs)                                   | M10       |
