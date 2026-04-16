# heyEliora — Integrations

How Eliora connects to external services and acts on your behalf.

---

## Architecture

Every integration follows the same loop:

```
User message → LLM picks a tool → Tool calls external API → Result shown
                                                          → (or) Action proposed → User approves → Execute
```

This is the same pattern as goals. Each integration is just:

- A set of **LLM tool definitions** (same format as goal tools)
- A few **API wrapper functions** (thin layer over the service's SDK)
- **Auth tokens** stored per user in Turso (encrypted)

The LLM decides when to use which tool based on the system prompt and conversation context. No routing logic needed — Claude figures it out.

---

## Integration Categories

### 1. Services with APIs (OAuth / API keys)

Clean path. Structured data, official SDKs, revocable tokens.

| Service             | Auth                  | Read                              | Write (needs approval)       |
| ------------------- | --------------------- | --------------------------------- | ---------------------------- |
| **Gmail**           | OAuth2 (`googleapis`) | List/read emails, summarize inbox | Draft reply → Approve → Send |
| **Google Calendar** | OAuth2 (`googleapis`) | List events, check availability   | Create/modify events         |
| **GitHub**          | OAuth App or PAT      | List repos, PRs, issues, diffs    | Create PR, merge, comment    |
| **Notion**          | OAuth2 or API key     | Read pages, databases             | Create/update pages          |
| **Todoist**         | OAuth2 or API key     | List tasks                        | Create/complete tasks        |

### 2. Web (No API)

For ad-hoc web tasks — airline prices, articles, pages with no structured API.

| Approach                                        | Cost              | Reliability              | When to use                          |
| ----------------------------------------------- | ----------------- | ------------------------ | ------------------------------------ |
| **Scraping service** (Firecrawl, ScrapingBee)   | ~$0.001-0.01/page | High                     | Default choice for web reading       |
| **Playwright on server**                        | Free              | Fragile (layouts change) | Complex interactions, JS-heavy sites |
| **Specialized data APIs** (Serpapi, Skyscanner) | Paid              | High                     | Frequent queries on specific data    |

Pragmatic default: **Firecrawl** for general web reading, specialized APIs for recurring tasks.

### 3. Browser Automation (last resort)

Literally operating a browser — logging in, clicking buttons, filling forms. Only for services that have zero API and zero scraping alternative (rare).

Not recommended for anything with an API. Fragile, slow, expensive, security nightmare (storing actual login credentials).

---

## Auth Approaches

There are several ways to handle user credentials for integrations. Each has different trade-offs in security, user trust, and complexity.

### Approach 1: OAuth Proxy Service (Nango) — Recommended for multi-user

A third-party service handles the entire OAuth lifecycle. You never touch raw tokens.

```
User → OAuth flow → Nango stores tokens (encrypted, SOC2-certified) →
Your server calls Nango API → Gets fresh token → Calls Gmail/GitHub API
```

**How it works:** Nango provides a pre-built OAuth flow for 700+ APIs. You embed their connect UI or redirect link, user authorizes, Nango stores and refreshes tokens. Your server calls Nango's proxy endpoint — credentials are injected automatically, never exposed to your code.

| Pros                                                         | Cons                                                              |
| ------------------------------------------------------------ | ----------------------------------------------------------------- |
| You never store secrets — liability shifts to Nango          | 10 connections on free tier (1 connection = 1 user-provider pair) |
| SOC2 Type 2 certified, handles encryption/refresh            | $50/mo at Starter for more connections                            |
| Works with 700+ APIs out of the box                          | External dependency — if Nango goes down, integrations stop       |
| No scary "unverified app" warning (they handle verification) | Adds latency (your server → Nango → API → back)                   |

**Free tier limits:** 10 connections, 100k proxy requests/mo, 10 hours compute.

**Your DB only stores metadata:**

```sql
CREATE TABLE IF NOT EXISTS connections (
  telegram_id TEXT NOT NULL,
  provider TEXT NOT NULL,        -- 'google', 'github', 'notion'
  nango_connection_id TEXT,      -- reference to Nango's connection
  connected_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (telegram_id, provider)
);
```

### Approach 2: User-Provided Tokens (PATs / App Passwords) — Simplest, least intrusive

User generates their own token from the service's settings and pastes it into the chat. No OAuth dance, no redirect server, no Google verification.

```
User → Goes to GitHub Settings → Generates PAT with selected scopes →
Pastes token in Telegram chat → Eliora stores it encrypted → Uses it for API calls
```

**Works for:** GitHub (PATs), Notion (API keys), Todoist (API tokens), any service that lets users create API keys.

**Doesn't work for:** Gmail, Google Calendar (Google doesn't offer PATs for regular users — OAuth is the only way).

| Pros                                                                   | Cons                                                       |
| ---------------------------------------------------------------------- | ---------------------------------------------------------- |
| Zero infrastructure — no redirect server, no OAuth app registration    | User has to manually create and paste tokens (friction)    |
| User feels in control — they chose the scopes, they can revoke anytime | You still store the token (encrypted) in your DB           |
| No "unverified app" warning                                            | Not available for all services (notably Gmail)             |
| No user limit, no cost                                                 | Tokens don't auto-refresh — if revoked, user must re-paste |
| No third-party dependency                                              | Less polished UX than "Sign in with Google"                |

**DB schema:**

```sql
CREATE TABLE IF NOT EXISTS user_tokens (
  telegram_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  token BLOB NOT NULL,           -- encrypted (AES-256-GCM)
  scopes TEXT,                   -- what the user granted
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (telegram_id, provider)
);
```

**Security note:** Token arrives in a Telegram message — Eliora should immediately delete the message containing the raw token (`ctx.deleteMessage()`) and confirm storage. Never log it. Never echo it back.

### Approach 3: Short-Lived OAuth Tokens Only (no refresh tokens)

Standard OAuth flow, but only store the access token (expires in ~1 hour). Never request or store refresh tokens.

```
User → OAuth flow → Gets access token (1hr) → Eliora uses it → Token expires →
User must re-authenticate next session
```

| Pros                                                       | Cons                                                        |
| ---------------------------------------------------------- | ----------------------------------------------------------- |
| Minimal damage if DB is breached — tokens expire in 1 hour | User must re-authorize every session (major friction)       |
| No long-lived secrets in your DB                           | Unusable for background tasks (reminders, scheduled checks) |
| Simpler implementation — no refresh logic                  | Bad UX for regular use                                      |

**Best for:** One-off actions where you don't need persistent access. E.g., "connect, do one thing, disconnect."

### Approach 4: Self-Managed OAuth (full tokens, your DB) — Most control, most risk

The traditional approach. You run the full OAuth flow, store both access and refresh tokens encrypted in your DB, handle refresh logic yourself.

```
1. User says "connect my email" (or taps /connect)
2. Eliora generates OAuth2 URL with:
   - client_id (your app)
   - redirect_uri (your HTTPS server)
   - scope (gmail.readonly first, gmail.send later)
   - state (random token to prevent CSRF)
3. User opens link → Google/GitHub login page
4. User authorizes → Redirect to YOUR server with auth code
5. Server exchanges code for access + refresh tokens
6. Tokens encrypted (AES-256-GCM) and stored in Turso
7. Eliora confirms connection in Telegram
```

| Pros                                                   | Cons                                                                                           |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Full control, no third-party dependency                | You're now a credential vault — breach = access to all users' accounts                         |
| No user limits, no per-connection cost                 | Must implement encryption, refresh logic, revocation yourself                                  |
| Works for background tasks (persistent refresh tokens) | Google verification required for sensitive scopes (gmail.send) — takes weeks, may get rejected |
| Lowest latency (direct API calls)                      | "Unverified app" warning scares users until verified                                           |
|                                                        | Legal liability — you're a data processor under GDPR/CCPA                                      |

**Security requirements if you go this route:**

- HTTPS required on redirect server
- Validate `state` param to prevent CSRF
- Encrypt tokens at rest (AES-256-GCM), never log them
- Scope minimization — request read-only first, upgrade to write only when user asks
- `/disconnect` deletes tokens AND revokes upstream access
- `refreshTokenIfNeeded(userId, provider)` wrapper around every API call

**DB schema:**

```sql
CREATE TABLE IF NOT EXISTS oauth_tokens (
  id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  provider TEXT NOT NULL,        -- 'google', 'github', 'notion'
  access_token BLOB NOT NULL,    -- encrypted
  refresh_token BLOB NOT NULL,   -- encrypted
  scopes TEXT NOT NULL,           -- comma-separated
  expires_at INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(telegram_id, provider)
);
```

---

## Recommended Strategy

Mix approaches based on the service and your stage:

| Service                     | Recommended approach                                                              | Why                                                  |
| --------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **Web reading**             | None needed                                                                       | Public data, no auth                                 |
| **GitHub**                  | User-provided PAT (Approach 2)                                                    | Users are devs, comfortable with PATs, full control  |
| **Notion / Todoist**        | User-provided API key (Approach 2)                                                | Same — API keys available, simple                    |
| **Gmail / Google Calendar** | Nango (Approach 1) for multi-user, or Self-managed (Approach 4) for just yourself | Google doesn't offer PATs — OAuth is the only option |

**For your current stage (building for yourself):** Self-managed OAuth (Approach 4) is fine. You're storing your own tokens in your own DB. The security/trust concerns only matter when other people use it.

**When you add other users:** Graduate Gmail/Calendar to Nango (Approach 1). Keep GitHub/Notion on user-provided tokens (Approach 2). This avoids storing other people's long-lived Google credentials while keeping the simple stuff simple.

---

## User Trust & Adoption

People's comfort with granting access follows a predictable gradient:

| Action                    | Trust required | Strategy                           |
| ------------------------- | -------------- | ---------------------------------- |
| Read a webpage            | None           | No auth needed — start here        |
| Connect GitHub (read PRs) | Low-moderate   | Devs are used to PATs, feels safe  |
| Read calendar             | Moderate       | Show value first, ask later        |
| Read email                | High           | Only after weeks of trust-building |
| Send email on behalf      | Very high      | Approval flow must be bulletproof  |

**Key principles:**

- **Show value before asking for access.** Don't ask for Gmail on day 1. Let Eliora prove herself with goals/reminders first.
- **Read-only is the gateway.** People will let you read before write. Always start passive.
- **Perceived control > actual security.** "/disconnect anytime" matters more than your encryption algorithm.
- **The Google "unverified app" warning kills conversion.** Until verified, most non-technical users will bail. Nango avoids this.

---

## LLM Tools per Integration

Each integration adds tools in the same format as existing goal tools.

### Gmail

```
read_inbox       — List recent/unread emails (subject, sender, snippet)
read_email       — Get full email by ID
draft_reply      — Create draft (NOT send) → show to user for approval
send_draft       — Send an approved draft
```

### Google Calendar

```
get_events       — List events for a date range
create_event     — Create event (with approval)
update_event     — Modify event (with approval)
```

### GitHub

```
list_repos       — User's repos
list_pull_requests — PRs for a repo (open, closed, or all)
get_pull_request — PR details + diff
create_pull_request — Create PR (with approval)
merge_pull_request  — Merge PR (with approval)
```

### Web Reading

```
read_webpage     — Fetch and extract content from a URL (via Firecrawl or fetch+cheerio)
search_web       — Search the web and return results (via Serpapi or similar)
```

---

## The Real Risk

The biggest security risk isn't OAuth or token storage. It's **Claude making the wrong decision**.

- Misidentifies which email to reply to → wrong person gets a confusing reply
- Picks the wrong PR to merge → broken main branch
- Drafts a reply with the wrong tone → professional damage

This is why the **Approval Flow (Milestone 5) is non-negotiable before any write action**. The approval message must show the full action:

```
📧 Send email?
To: sarah.chen@company.com
Subject: Re: Q2 Project Timeline
Body: "Hi Sarah, looks good — let's go with Option B..."

[✅ Send] [✏️ Edit] [❌ Cancel]
```

No "I'll handle it" black boxes. User sees exactly what's about to happen.

Read-only tools (read_inbox, get_events, read_webpage) don't need approval — they're safe by default.

---

## Build Order

1. **Milestone 5 — Approval Flow** (gatekeeper for all write actions)
2. **Web reading tool** — `read_webpage` via Firecrawl or fetch+cheerio. No auth needed, immediately useful, lowest risk
3. **GitHub via PAT** — user pastes token, Eliora stores encrypted, no OAuth needed
4. **OAuth2 infrastructure** — Nango (multi-user) or self-managed (solo), `/connect` + `/disconnect`
5. **Gmail read-only** → Gmail write (with approval)
6. **Google Calendar read** → Calendar write (with approval)

Web reading is the fastest win — no auth, no tokens, works today.
