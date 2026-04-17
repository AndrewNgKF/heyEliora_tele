# Payment & Web Architecture

## Overview

A standalone web app that doubles as a Telegram Mini App. Same codebase, same URL, two auth entry points — both resolving to `telegram_id` (our existing primary key).

Users can manage goals, reminders, settings, and billing from the web or from inside Telegram. No passwords, no custom auth system — Telegram is the identity provider.

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                    Web App                            │
│                                                      │
│  /dashboard      goals, reminders, progress          │
│  /settings       timezone, preferences, profile      │
│  /billing        upgrade, manage subscription        │
│                                                      │
│  Auth:                                               │
│  ├─ Via Telegram Mini App  → signed initData         │
│  └─ Via standalone browser → Telegram Login Widget   │
│                                                      │
├──────────────────────────────────────────────────────┤
│                    API Layer                          │
│                                                      │
│  /api/user          profile, preferences             │
│  /api/goals         CRUD goals + entries             │
│  /api/reminders     CRUD reminders                   │
│  /api/billing       Stripe checkout + webhook        │
│                                                      │
│  Auth middleware:                                     │
│  ├─ Validate Telegram initData HMAC (Mini App)       │
│  └─ Validate Telegram Login hash (standalone web)    │
│  Both resolve to → telegram_id                       │
│                                                      │
├──────────────────────────────────────────────────────┤
│               Existing Bot Backend                   │
│                                                      │
│  Telegram webhook, LLM chat, cron reminders          │
│  Same Turso DB ← shared with API layer               │
└──────────────────────────────────────────────────────┘
```

---

## Authentication

### No passwords. Two entry points, same identity.

Both auth methods produce a verified `telegram_id`. The server issues a JWT (or signed cookie) for subsequent API calls.

### 1. Telegram Mini App (inside Telegram)

When a user opens the web app from within Telegram, the Telegram client injects a signed `initData` string into the webview. This contains `telegram_id`, `first_name`, `auth_date`, and an HMAC signature.

**Validation flow:**

1. Web App JS reads `window.Telegram.WebApp.initData`
2. Sends it to `/api/auth/telegram-webapp`
3. Server reconstructs the data-check-string
4. Computes HMAC-SHA256 using a secret derived from the bot token: `HMAC_SHA256(HMAC_SHA256("WebAppData", BOT_TOKEN), data_check_string)`
5. Compares against the provided hash
6. If valid and `auth_date` is recent → issue JWT with `telegram_id`

**Reference:** https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app

### 2. Telegram Login Widget (standalone browser)

For users visiting the web app directly (not from Telegram), we use the Telegram Login Widget — a button that says "Log in with Telegram". The user confirms in their Telegram app, and we receive a signed callback.

**Validation flow:**

1. User clicks "Log in with Telegram" button on the web page
2. Telegram opens a confirmation dialog in their Telegram app
3. On approval, Telegram redirects to our callback URL with signed params (`id`, `first_name`, `auth_date`, `hash`)
4. Server computes `SHA256(BOT_TOKEN)` as the secret key
5. Computes HMAC-SHA256 of the sorted data-check-string
6. Compares against `hash`
7. If valid and `auth_date` is within 24 hours → issue JWT with `telegram_id`

**Reference:** https://core.telegram.org/widgets/login#checking-authorization

### JWT Structure

```json
{
  "telegram_id": "123456789",
  "name": "Andrew",
  "iat": 1713360000,
  "exp": 1713964800
}
```

- Signed with a `JWT_SECRET` env variable (separate from bot token)
- 7-day expiry, refresh on active use
- Sent as `Authorization: Bearer <token>` header or `HttpOnly` cookie

---

## API Endpoints

All endpoints require a valid JWT (except `/api/auth/*` and `/api/billing/webhook`).

### Auth

| Method | Path                        | Description                                |
| ------ | --------------------------- | ------------------------------------------ |
| POST   | `/api/auth/telegram-webapp` | Validate Mini App initData, return JWT     |
| POST   | `/api/auth/telegram-login`  | Validate Login Widget callback, return JWT |

### User

| Method | Path                    | Description                                       |
| ------ | ----------------------- | ------------------------------------------------- |
| GET    | `/api/user/profile`     | Full profile (tier, timezone, goals count, usage) |
| PATCH  | `/api/user/timezone`    | Update timezone                                   |
| PATCH  | `/api/user/preferences` | Update work_style, tone, schedule_pref            |
| DELETE | `/api/user`             | Delete all user data (GDPR)                       |

### Goals

| Method | Path                     | Description                      |
| ------ | ------------------------ | -------------------------------- |
| GET    | `/api/goals`             | List all active goals            |
| POST   | `/api/goals`             | Create a new goal                |
| PATCH  | `/api/goals/:id`         | Update goal text/baseline/target |
| DELETE | `/api/goals/:id`         | Soft-delete (set active=0)       |
| GET    | `/api/goals/:id/entries` | List progress entries for a goal |

### Reminders

| Method | Path                 | Description                      |
| ------ | -------------------- | -------------------------------- |
| GET    | `/api/reminders`     | List active reminders            |
| POST   | `/api/reminders`     | Create a reminder                |
| PATCH  | `/api/reminders/:id` | Update reminder content/schedule |
| DELETE | `/api/reminders/:id` | Cancel a reminder                |

### Billing

| Method | Path                    | Description                                     |
| ------ | ----------------------- | ----------------------------------------------- |
| POST   | `/api/billing/checkout` | Create Stripe Checkout session, return URL      |
| POST   | `/api/billing/portal`   | Create Stripe Customer Portal session           |
| POST   | `/api/billing/webhook`  | Stripe webhook (no JWT — uses Stripe signature) |

---

## Payments — Stripe Checkout

### Why Stripe (not Telegram Payments)

- Users trust Stripe checkout — it looks like every other SaaS payment flow
- Supports credit cards, PayPal, Apple Pay, Google Pay out of the box
- Customer Portal for self-service subscription management (cancel, update card)
- Telegram Payments work but feel unfamiliar — lower conversion for subscriptions

### Flow

```
User clicks "Upgrade" (in bot or web dashboard)
  → POST /api/billing/checkout { tier: "pro" }
  → Server creates Stripe Checkout Session
    - metadata: { telegram_id: "123456789" }
    - success_url: /billing?success=1
    - cancel_url: /billing?cancelled=1
  → Returns checkout URL
  → User completes payment on Stripe
  → Stripe sends webhook to /api/billing/webhook
    - Event: checkout.session.completed
    - Extract telegram_id from metadata
    - Update users table: tier = 'pro'
    - Store stripe_customer_id on user record
  → Bot immediately sees upgraded tier
```

### Subscription Management

- "Manage subscription" button → Stripe Customer Portal
- Users can cancel, update payment method, view invoices
- Portal webhook events (`customer.subscription.updated`, `customer.subscription.deleted`) → update tier in DB

### Database Changes

Add to `users` table:

```sql
ALTER TABLE users ADD COLUMN stripe_customer_id TEXT;
```

No need for a separate subscriptions table — Stripe is the source of truth. We just mirror the `tier` status.

---

## Telegram Mini App Integration

### Bot-side: Opening the Web App

Add a "Manage" button to the bot that opens the web app:

```js
// In bot commands or as a persistent menu button
ctx.reply("Open your dashboard:", {
  reply_markup: {
    inline_keyboard: [
      [
        {
          text: "📊 Dashboard",
          web_app: { url: "https://heyeliora.com/dashboard" },
        },
      ],
    ],
  },
});
```

Or set it as the bot's menu button (persistent, always visible):

```js
bot.api.setChatMenuButton({
  menu_button: {
    type: "web_app",
    text: "Dashboard",
    url: "https://heyeliora.com/dashboard",
  },
});
```

### Client-side: Detecting Context

```js
// In the web app
const tg = window.Telegram?.WebApp;

if (tg?.initData) {
  // Running inside Telegram Mini App
  tg.ready();
  tg.expand();
  // Authenticate with initData
  const jwt = await fetch("/api/auth/telegram-webapp", {
    method: "POST",
    body: JSON.stringify({ initData: tg.initData }),
  }).then((r) => r.json());
} else {
  // Running in standalone browser
  // Show Telegram Login Widget
}
```

---

## Build Order

1. **Auth middleware** — validate initData + Login Widget, issue JWTs
2. **API routes** — thin wrappers around existing `queries.js` functions
3. **Web dashboard** — goals, reminders, settings pages
4. **Stripe billing** — checkout + webhook + portal
5. **Bot integration** — "Dashboard" menu button, upgrade prompts
6. **Telegram Mini App polish** — theming, haptic feedback, close buttons

---

## Tech Decisions

| Decision  | Choice                           | Reason                                                                |
| --------- | -------------------------------- | --------------------------------------------------------------------- |
| Frontend  | Lightweight (plain JS or Preact) | Loads fast in Telegram webview, no heavy framework needed             |
| Auth      | JWT via Telegram identity        | No passwords, no OAuth providers, leverages existing `telegram_id` PK |
| Payments  | Stripe Checkout + Portal         | Trusted, supports cards + PayPal + Apple Pay, self-service management |
| Hosting   | Same Vercel project              | Share domain, share DB, single deployment                             |
| API style | REST                             | Simple CRUD operations, no need for GraphQL complexity                |
