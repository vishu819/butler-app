# 🎩 Butler — Your Engineering Mentor

A personal, LLM-driven learning companion (PWA) that helps you grow into a strong
software architect. Butler builds a model of how you think, designs an adaptive
curriculum, and runs a daily learning session that **starts easy and ramps up only
once you've genuinely earned it**.

**Stack:** Next.js 14 (App Router) · TypeScript · Tailwind · Supabase (Postgres + Auth + RLS) ·
OpenRouter (LLM, model-agnostic) · Vercel (hosting + cron). Installable PWA.

---

## What it does

- **🏠 Home — daily session.** Each day Butler picks your **weakest area + one new
  concept**, web-grounds the questions in real failure cases, and asks you an MCQ
  followed by a typed **follow-up** ("explain *why*"). An LLM grades your reasoning.
  "Didn't get it?" rewords the question.
- **📊 Progress — your journey.** Skill radar, per-skill levels & mastery, a learning
  path (curriculum), stat tiles, weekly activity, and your account (change password,
  sign out, **Start fresh**).
- **🏋️ Practice — brain gym.** Timed cognitive workouts that rotate through 7 areas.
- **📚 Library — learning journal.** A day-by-day recap of what you learned.
- **💬 Coach.** A chat mentor that knows your goals, history, and skill profile.

## How the learning loop works

Butler is **adaptive tutoring**, not model training. Adaptation lives in the *data*
the LLM re-reads each step:

1. **Create plan** (`/api/plan`) — LLM designs an ordered curriculum from your skill
   assessment, front-loading weak areas and tradeoff-heavy topics.
2. **Generate session** (`/api/session`) — weakest skill + one new concept, web-grounded,
   at each skill's current level.
3. **Answer** — MCQ + typed follow-up; the follow-up is LLM-graded (`/api/session/answer`).
4. **Analyze** (`/api/session/process`) — the LLM judges your **cumulative record**
   (rolling history per skill) and returns a verdict: `advance` / `hold` / `downgrade`
   with reasoning.
5. **Update** — code applies the verdict with **guards**: advancing requires ~4 sessions
   of evidence at a level (confidence gate); changes are capped at ±1; downgrades allowed
   anytime basics break. Profile, skill levels, and curriculum mastery update.

Tomorrow's session reads the updated state — the loop closes.

**Model-agnostic:** every LLM call routes through `lib/models.ts`, which maps roles
(`judge` / `generate` / `web` / `coach`) to models, each overridable by env var.

---

## Setup

### 1. Database
Open Supabase → **SQL Editor** and run [`supabase/schema.sql`](supabase/schema.sql),
then [`supabase/all_migrations.sql`](supabase/all_migrations.sql) (idempotent — covers
migrations 003–010: quiz, learn, skills, brain gym, diagrams, daily learning, plan,
sessions, confidence tracking). In **Authentication → Providers → Email**, turn **off**
"Confirm email" for instant password signup.

### 2. Environment
```bash
cp .env.local.example .env.local   # then fill in — never commit .env.local
```
| Var | Where |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | same page (secret) |
| `OPENROUTER_API_KEY` | https://openrouter.ai/keys |
| `OPENROUTER_MODEL` | e.g. `google/gemini-2.5-flash` |
| `OPENROUTER_MODEL_JUDGE` (optional) | a sharper model for grading |
| `CRON_SECRET` | `openssl rand -hex 16` |

### 3. Run
```bash
npm install
npm run dev            # http://localhost:3000
```
Sign in (password or magic link). First open auto-seeds your profile + builds your plan.

> **Local dev note:** on macOS, if styles vanish or you get a 500 after restart, it's a
> stale `.next` cache race — stop the server, `rm -rf .next`, restart, wait for "Ready".
> Also, unsigned SWC binary: `xattr -c node_modules/@next/swc-darwin-arm64/*.node &&
> codesign --force --sign - <that file>` if Gatekeeper blocks it.

### 4. Deploy (Vercel)
`vercel` → add all env vars in the dashboard → deploy. [`vercel.json`](vercel.json)
schedules `/api/cron/daily` at 06:00 UTC (Vercel auto-sends the `CRON_SECRET` header).
Add your Vercel URL to Supabase → Auth → Redirect URLs (`/auth/callback`).
Open in Safari → Share → **Add to Home Screen**.

---

## Architecture notes

- **Security:** OpenRouter + service-role keys are server-only (API routes). RLS scopes
  every user table to `auth.uid()`. Daily content is shared, read-only to clients.
- **Speed:** client-side GET cache + prefetch (`lib/fetch-cache.ts`) for instant tab
  switches; service worker caches immutable `_next` assets; streaming coach + articles;
  GPU-only CSS animations (no animation library).
- **Storage bounds:** chat/memory auto-pruned; per-skill history capped.

## Roadmap
- FSRS spaced-repetition scheduler (optimal review timing)
- Push notifications (daily nudge)
- Onboarding diagnostic assessment
