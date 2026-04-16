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
│   ├── server.js     # Express webhook endpoint + health check
│   ├── commands.js   # Slash commands (/start, /goals, etc) + free-text catch-all
│   ├── callbacks.js  # Inline button tap handlers (Set a goal 🎯, etc)
│   ├── middleware.js  # Per-request setup: identify user, sync to DB, add replyMd
│   └── helpers.js    # Shared domain logic: format goals, run check-ins
├── config/
│   └── CONSTANTS.js  # Tiers, limits, timezone options, command menu, UI text
├── db/
│   ├── index.js      # Turso connection + table creation (CREATE IF NOT EXISTS)
│   └── queries.js    # Every DB operation as a named function
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

Six tables, all in Turso:

| Table          | Purpose                                       |
| -------------- | --------------------------------------------- |
| `users`        | Telegram ID, name, tier, timezone             |
| `messages`     | Conversation history (for LLM context window) |
| `goals`        | User goals with baseline + target             |
| `preferences`  | Work style, tone, schedule prefs              |
| `goal_entries` | Progress logs tied to specific goals          |
| `daily_usage`  | Message counts + token usage per user per day |

## Key Design Decisions

- **Anthropic SDK direct, not Vercel AI SDK:** Started with Vercel AI SDK but switched in M3. The tool-call loop needs fine control (dedup, error handling, multi-step). Direct SDK is simpler for this. If we need model swapping later, the abstraction boundary is `chat()` — one function to wrap.
- **Turso for everything:** One database for all relational data. Vector search (sqlite-vec) will slot in for RAG in M6 without adding a second service.
- **Composers, not one big file:** grammY's Composer pattern splits handlers into separate files (commands, buttons) that get `bot.use()`'d in. Each file owns its domain. Middleware runs first, so handlers get `ctx.userId`, `ctx.replyMd()` for free.
- **Tier-based usage limits without cron:** Daily reset is lazy — `checkUsage()` compares against today's date in the user's timezone. No scheduled job, no Redis. Just a date comparison on each message.
- **Save messages after success, not before:** User message is only persisted to history after Claude responds successfully. Prevents malformed alternating-role sequences if the API fails mid-request.

## Planned Tech (not yet implemented)

| Component            | Planned choice                                       | Milestone |
| -------------------- | ---------------------------------------------------- | --------- |
| **Embeddings**       | Anthropic / OpenAI embeddings API                    | M6        |
| **Vector search**    | sqlite-vec (Turso extension)                         | M6        |
| **Document parsing** | `unpdf` for PDFs, `mammoth` for Word docs            | M6        |
| **Scheduling**       | `node-cron` or Bun's built-in timer                  | M4        |
| **Task queue**       | BullMQ + Redis or lightweight alternative            | M4        |
| **Google Calendar**  | Google Calendar API (OAuth2)                         | M7        |
| **Gmail**            | Gmail API (OAuth2) — read, draft, send with approval | M7        |
| **Hosting**          | Fly.io or Railway                                    | M10       |
| **Monitoring**       | Sentry (errors) + Axiom (logs)                       | M10       |
