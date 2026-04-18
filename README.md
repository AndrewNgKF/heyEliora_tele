# heyEliora

[![CI](https://github.com/AndrewNgKF/heyEliora_tele/actions/workflows/ci.yml/badge.svg)](https://github.com/AndrewNgKF/heyEliora_tele/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/AndrewNgKF/heyEliora_tele/graph/badge.svg)](https://codecov.io/gh/AndrewNgKF/heyEliora_tele)

Your personal AI accountability partner on Telegram. Eliora remembers your goals, tracks your progress, and won't let you off the hook.

**[Talk to Eliora →](https://t.me/HeyElioraBot)**&emsp;**[Website →](https://www.heyeliora.com)**

---

## What it does

- **Goal tracking** — Tell Eliora what you're working on. She'll refine it into a clear goal with baselines and targets, then track your progress automatically.
- **Accountability check-ins** — `/whatsup` gives you an honest data-driven assessment of where you stand.
- **Smart reminders** — One-time, daily, or weekly. Set them naturally ("remind me to stretch at 3pm every day") or via `/remind`.
- **Contextual nudges** — If you go quiet, Eliora checks in based on your goals and recent activity. Not generic "hey are you there?" messages.
- **Full transparency** — `/mydata` shows everything Eliora stores about you, including her internal notes. Nothing hidden.
- **Data control** — `/forget` wipes your data. Your account stays (to prevent trial abuse), but goals, history, preferences, and notes are gone.

## Tech stack

| Layer | Choice |
|-------|--------|
| Runtime | [Bun](https://bun.sh) |
| Language | JavaScript + JSDoc |
| Bot framework | [grammY](https://grammy.dev) |
| LLM | Claude (Anthropic SDK) |
| Database | [Turso](https://turso.tech) (libSQL) |
| Hosting | [Vercel](https://vercel.com) (serverless) |
| Tests | [Vitest](https://vitest.dev) (71 tests, 95%+ coverage) |

## Commands

| Command | What it does |
|---------|-------------|
| `/start` | Start here |
| `/goals` | View your goals |
| `/whatsup` | Accountability check-in |
| `/reminders` | View active reminders |
| `/mydata` | See everything Eliora knows about you |
| `/forget` | Wipe your data and start fresh |

Plus hidden power-user commands: `/remind`, `/progress`, `/profile`, `/usage`, `/timezone`, `/preferences`, `/howto`.

## Architecture

```
src/
├── bot/          # grammY bot: commands, callbacks, middleware, Express server
├── config/       # Tiers, limits, constants
├── db/           # Turso client + all named query functions
├── jobs/         # Cron workers: sender (delivers queue), nudges, summarizer
├── llm/          # Claude conversation loop + tool definitions/execution
├── utils/        # ID generation
└── web/          # Landing page, legal pages, styles
```

**Producer/consumer pattern:** Reminders and nudges write to a `scheduled_messages` queue. A cron-triggered sender drains and delivers them. No long-running processes.

**9 database tables:** users, messages, goals, preferences, goal_entries, daily_usage, scheduled_messages, nudge_settings, user_summary.

## Running locally

```bash
# Clone
git clone https://github.com/AndrewNgKF/heyEliora_tele.git
cd heyEliora_tele

# Install
bun install

# Configure
cp .env.example .env
# Fill in: BOT_TOKEN, ANTHROPIC_API_KEY, TURSO_URL, TURSO_TOKEN, CRON_SECRET

# Run (long polling mode for local dev)
bun run dev

# Test
bun run test

# Test with coverage
bun run test -- --coverage
```

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BOT_TOKEN` | Yes | Telegram bot token from [@BotFather](https://t.me/BotFather) |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key |
| `TURSO_URL` | Yes | Turso database URL |
| `TURSO_TOKEN` | Yes | Turso auth token |
| `CRON_SECRET` | Yes | Shared secret for cron endpoint auth |
| `TELEGRAM_WEBHOOK_SECRET` | Prod | Secret token for webhook validation |
| `WEBHOOK_URL` | Prod | Your domain (e.g. `https://www.heyeliora.com`) |
| `PORT` | No | Server port (default: 3000) |

## License

MIT
