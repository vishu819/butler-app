# 🌱 PI — Personal Intelligence Companion

A single-user PWA that coaches you, tracks your daily goals, and gives you a daily
engineering question, a brain-gym exercise, and an AI-news digest.

**Stack:** Next.js 14 (App Router) · TypeScript · Tailwind · Supabase (Postgres + Auth + RLS) ·
OpenRouter (LLM) · Vercel (hosting + cron).

---

## 1. Prerequisites

- Node 18+ (you have 18.20)
- A Supabase project (free)
- An OpenRouter API key — https://openrouter.ai/keys

## 2. Set up the database

Open your Supabase project → **SQL Editor** → paste and run
[`supabase/schema.sql`](supabase/schema.sql). This creates all tables, Row-Level
Security policies, and a trigger that auto-creates your profile on first sign-in.

In Supabase → **Authentication → Providers → Email**, make sure Email is enabled
(magic links are on by default).

## 3. Configure environment

```bash
cp .env.local.example .env.local
```

Fill in `.env.local`:

| Var | Where to get it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | same page (anon/publishable key) |
| `SUPABASE_SERVICE_ROLE_KEY` | same page → `service_role` (keep secret) |
| `OPENROUTER_API_KEY` | https://openrouter.ai/keys |
| `OPENROUTER_MODEL` | e.g. `anthropic/claude-3.5-sonnet` |
| `CRON_SECRET` | run `openssl rand -hex 16` |

> ⚠️ **Never commit `.env.local`.** It's gitignored. If you ever pasted a key
> into a chat or shared screen, rotate it.

## 4. Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000, enter your email, click the magic link. First sign-in
creates your profile automatically.

### Generate today's daily content

Daily content (eng question, brain gym, news) is created by a protected endpoint.
Trigger it manually the first time:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/daily
```

## 5. Deploy to Vercel

```bash
npm i -g vercel   # if needed
vercel
```

- Add all the env vars from `.env.local` in the Vercel dashboard
  (Project → Settings → Environment Variables).
- [`vercel.json`](vercel.json) schedules `/api/cron/daily` for **06:00 UTC** daily.
  Vercel automatically sends the `Authorization: Bearer $CRON_SECRET` header when
  `CRON_SECRET` is set as an env var.
- In Supabase → Authentication → URL Configuration, add your Vercel URL to
  **Redirect URLs** (e.g. `https://your-app.vercel.app/auth/callback`).

## 6. Install on your phone

Open the deployed URL in Safari (iPhone) → Share → **Add to Home Screen**.
It launches full-screen like a native app.

---

## How it works

- **Coach** (`/api/chat`) injects your profile prefs, long-term `memory`, active
  goals, and recent chat into the system prompt, so it personalizes over time. When
  it learns something durable it emits a `<remember>` tag that gets saved to `memory`.
- **Goals** live in `goals` + `goal_logs` (one check-off row per goal per day).
- **Daily content** is generated once per day and cached in `daily_content`
  (shared, read-only to the client). News is pulled from Hacker News (no API key).
- **Security:** the OpenRouter and service-role keys are used only in server-side
  API routes. RLS ensures every user row is scoped to `auth.uid()`.

## Roadmap (post-v1)

- Streak heatmap + weekly summary the coach writes for you
- Push notifications (daily nudge)
- Spaced-repetition on missed engineering questions
- Voice input for the coach
