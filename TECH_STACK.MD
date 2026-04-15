# heyEliora — Tech Stack

## Core

| Layer               | Choice                     | Why                                                                                                    |
| ------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Runtime**         | Bun                        | Fast, built-in test runner, good DX. Runs JS natively, no build step                                   |
| **Language**        | JavaScript + JSDoc         | No TS build tooling. JSDoc gives editor type hints where useful without a compile step                 |
| **Framework**       | Hono (on Bun)              | Lightweight, faster than Express, works natively with Bun. Express works but Hono is a better fit here |
| **Telegram Bot**    | grammY                     | Best JS/TS bot framework — middleware system, session handling, good plugin ecosystem                  |
| **LLM**             | Claude (via Anthropic API) | Best at following nuanced instructions and style matching. Swap-friendly via Vercel AI SDK             |
| **LLM Abstraction** | Vercel AI SDK              | Standardized interface — swap Claude for OpenAI/Gemini/local models without rewriting logic            |
| **Database**        | Turso (libSQL)             | SQLite-based, edge-ready, embedded vector search via `sqlite-vec`. One DB for relational + vector      |

## RAG & Memory

| Component            | Choice                                                         | Why                                                               |
| -------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Embeddings**       | Anthropic / OpenAI embeddings API                              | Generate vectors for documents and conversation history           |
| **Vector search**    | sqlite-vec (Turso extension)                                   | Keeps everything in one DB, no separate Pinecone/Qdrant to manage |
| **Document parsing** | `unpdf` for PDFs, `mammoth` for Word docs, raw text for emails | Lightweight, no heavy dependencies                                |
| **Chunking**         | Custom splitter (by section/paragraph)                         | Documents split into meaningful chunks for retrieval              |

## Scheduling & Long-Running Tasks

| Component                 | Choice                                                 | Why                                                                             |
| ------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------- |
| **Cron / scheduled jobs** | `node-cron` or Bun's built-in timer                    | Weekly recaps, goal check-ins, reminders, re-engagement nudges                  |
| **Task queue**            | BullMQ + Redis (or `bun-queue` if staying lightweight) | For async jobs: document parsing, email drafts, calendar syncing                |
| **Approval flow**         | Inline Telegram keyboards (grammY)                     | Eliora proposes an action → user taps Approve/Reject. Native UX, no external UI |

## Integrations

| Service             | Approach                                             |
| ------------------- | ---------------------------------------------------- |
| **Google Calendar** | Google Calendar API (OAuth2)                         |
| **Email (Gmail)**   | Gmail API (OAuth2) — read, draft, send with approval |
| **Email (other)**   | IMAP/SMTP via `imapflow` + `nodemailer`              |
| **Task management** | Todoist / Notion API (pick based on user preference) |

## Auth & Security

| Component         | Choice                                                     |
| ----------------- | ---------------------------------------------------------- |
| **User auth**     | Telegram user ID (bot already knows who you are)           |
| **API keys**      | Environment variables, never stored in DB                  |
| **OAuth tokens**  | Encrypted in Turso, scoped per user                        |
| **Data deletion** | `/delete` command wipes all user data — required for trust |

## Infrastructure (Paid Tier)

| Component      | Choice                         | Why                                                          |
| -------------- | ------------------------------ | ------------------------------------------------------------ |
| **Hosting**    | Fly.io or Railway              | Easy deployment, good free tiers for starting, scales simply |
| **Redis**      | Upstash (serverless Redis)     | For BullMQ task queue, pay-per-use                           |
| **Monitoring** | Sentry (errors) + Axiom (logs) | Free tiers are generous enough for launch                    |

## Project Structure (suggested)

```
src/
  bot/          # grammY bot setup, commands, middleware
  llm/          # LLM client, prompt templates, AI SDK config
  rag/          # embeddings, vector search, document chunking
  integrations/ # calendar, email, task management adapters
  memory/       # user context, goals, preferences, style profiles
  jobs/         # cron jobs, task queue workers
  db/           # Turso client, migrations, queries
  utils/        # shared helpers
```

## Key Design Decisions

- **Hono over Express:** You had Express listed, but Hono is built for Bun, faster, and has a nearly identical API. Easy switch.
- **Turso for everything:** One database for relational data (users, goals, preferences) AND vector search (RAG). Avoids managing two services.
- **Vercel AI SDK:** Don't hardcode to Claude. The SDK lets you swap models with one line. Important for open source — users can bring their own API key for any provider.
- **Separate frontend:** For admin or analytics purposes, modify their paid tier, delete data, see what the AI knows about you, etc. But keep the core bot experience in Telegram for simplicity and immediacy.
