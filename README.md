# heyEliora

[![CI](https://github.com/AndrewNgKF/heyEliora_tele/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/AndrewNgKF/heyEliora_tele/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/AndrewNgKF/heyEliora_tele/graph/badge.svg)](https://codecov.io/gh/AndrewNgKF/heyEliora_tele)

Your personal AI accountability partner on Telegram. Eliora remembers your goals, tracks your progress, and adapts to your habits and preferences — all in a conversational way. Open source and self-hostable.

Paid plans are zero setup and ready to go, but if you want to run your own instance, follow the instructions below.

**[Talk to Eliora →](https://t.me/HeyElioraBot)**&emsp;**[Website →](https://www.heyeliora.com)**

---

## Setup

```bash
bun install
cp .env.example .env   # fill in your keys
bun run dev             # local dev (long polling)
bun run test            # run tests
```

See `.env.example` for the required environment variables.

## License

MIT
