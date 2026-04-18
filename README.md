# heyEliora — Agentic AI Assistant on Telegram

[![CI](https://github.com/AndrewNgKF/heyEliora_tele/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/AndrewNgKF/heyEliora_tele/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/AndrewNgKF/heyEliora_tele/graph/badge.svg)](https://codecov.io/gh/AndrewNgKF/heyEliora_tele)

Your personal AI accountability partner on Telegram. Powered by Claude.

Paid plans are zero-setup and ready to go. If you want to self-host, follow the guide below.

**[Talk to Eliora →](https://t.me/HeyElioraBot)**&emsp;**[Website →](https://www.heyeliora.com)**

---

## Self-hosting guide

You'll need accounts on three services (all have free tiers):

### 1. Telegram bot

1. Open [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot`, follow the prompts, and copy the **bot token**

### 2. Anthropic (Claude)

1. Sign up at [console.anthropic.com](https://console.anthropic.com)
2. Create an API key under **Settings → API Keys**

### 3. Turso (database)

1. Install the CLI: `brew install tursodatabase/tap/turso` (or see [docs](https://docs.turso.tech/cli/installation))
2. Sign up: `turso auth signup`
3. Create a database: `turso db create heyeliora`
4. Get your URL: `turso db show heyeliora --url`
5. Create a token: `turso db tokens create heyeliora`

### 4. Run it

```bash
git clone https://github.com/AndrewNgKF/heyEliora_tele.git
cd heyEliora_tele
bun install
cp .env.example .env
```

Fill in `.env`:

| Variable            | Where to get it                                    |
| ------------------- | -------------------------------------------------- |
| `BOT_TOKEN`         | BotFather (step 1)                                 |
| `ANTHROPIC_API_KEY` | Anthropic console (step 2)                         |
| `TURSO_URL`         | `turso db show` output (step 3)                    |
| `TURSO_TOKEN`       | `turso db tokens create` output (step 3)           |
| `CRON_SECRET`       | Any random string — used to protect cron endpoints |

Then start:

```bash
bun run dev    # local dev (long polling)
bun run test   # run tests
```

The database tables are created automatically on first run.

## Naming

The code is open source, but the name **heyEliora** and the Eliora brand are not included in the license. If you self-host or fork this project, please give your bot a different name. We'd love to see what you build with it.

## License

Apache-2.0
