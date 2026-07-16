# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Start dev server (http://localhost:3000)
- `npm run build` — Type-check and build for production
- `npm run lint` — Run ESLint (next lint)
- `npm start` — Start production server

## Environment

Copy `.env.local.example` to `.env.local` and fill in:
- `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` + `SUPABASE_SERVICE_ROLE_KEY` — Supabase project
- `OPENROUTER_API_KEY` — OpenRouter API key (model-agnostic LLM provider)
- `OPENROUTER_MODEL` — Default model (defaults to `google/gemini-2.5-flash`)
- `CRON_SECRET` — Auth for the daily cron endpoint
- `NEXT_PUBLIC_SITE_URL` — Production URL for auth redirects

Optional per-role model overrides: `OPENROUTER_MODEL_JUDGE`, `OPENROUTER_MODEL_GENERATE`, `OPENROUTER_MODEL_WEB`, `OPENROUTER_MODEL_COACH`.

## Architecture overview

**Butler** is a mobile-first PWA mentor that generates daily adaptive learning sessions for software engineers. Next.js 15 App Router serving RSC-rendered pages + API route handlers. Supabase for auth + Postgres (Row-Level Security). OpenRouter for LLM calls (model-agnostic, with `:online` web search plugin).

### Data flow

1. **Daily cron** (`/api/cron/daily`) runs at 06:00 UTC — fetches news, generates brain-gym sets, builds per-user learning journals.
2. **Session generation** (`GET /api/session`) — picks focus skills (weakest areas, weighted by recency), generates ~4 questions via OpenRouter with web grounding (`:online`).
3. **User answers** (`POST /api/session/answer`) — submits MCQ + written explanation + 3 follow-up MCQs per question.
4. **LLM judge** (`POST /api/session/process`) — reads the learner's cumulative per-skill history and returns `advance`/`hold`/`downgrade` per skill. Optionally auto-evolves the curriculum plan.
5. **Plan evolution** (`lib/plan-evolve.ts`) — LLM prunes/reorders/appends to the `planned` tail of the curriculum based on updated profile.

### Key paths

| Path | Purpose |
|------|---------|
| `app/page.tsx` | Root — shows onboarding or dashboard depending on profile |
| `app/layout.tsx` | Root layout (Poppins font, PWA manifest, theme color) |
| `app/login/page.tsx` | Auth page (password + magic link) |
| `app/auth/callback/route.ts` | Supabase auth callback handler |
| `app/api/session/` | Session CRUD: generate, answer, followup, reframe, process (judge) |
| `app/api/plan/` | Curriculum plan — generate (GET) and regenerate (POST) |
| `app/api/onboard/` | Onboarding wizard: set name, target role, experience |
| `app/api/learn/` | Generate a focused study article on a topic |
| `app/api/cron/daily/` | Daily cron: news, brain-gym, per-user session generation |
| `app/api/chat/` | Coach chat — long-term memory backed |
| `app/api/brain-gym/` | Speed-round questions (60s timed) |
| `app/api/papers/` | Curated must-read papers with summarize-on-open |
| `app/api/articles/` | Company articles feed |
| `app/api/news/` | AI news digest |
| `app/api/summarize/` | Generate study guide for a paper/article |
| `app/api/diagram/` | Mermaid diagram generation |
| `app/api/goals/` | Goal CRUD + daily check-off |
| `app/api/profile/` | User profile (name, role, experience) |
| `app/api/init/` | Seed baseline profile + curriculum on first run |
| `app/api/reset/` | Reset all progress |
| `components/` | React components — see below |
| `lib/` | Shared logic — see below |
| `supabase/` | `schema.sql` + numbered migrations + `all_migrations.sql` |
| `middleware.ts` | Route guard — skips `/api/`, `/login/`, `/auth/`; validates JWT locally |

### Component structure

- `Dashboard.tsx` — Main app shell (tabs: Session, Practice, Plan, Others menu)
- `Session.tsx` — Question UI: MCQ → written answer → follow-up MCQs → results
- `Onboarding.tsx` — First-run wizard (name, target role, experience)
- `Plan.tsx` — Curriculum plan display with progress
- `Profile.tsx` — Skill profile (radar chart, per-skill levels, history)
- `Coach.tsx` — Chat interface with long-term memory
- `BrainGym.tsx` — 60-second speed rounds
- `Library.tsx` — Saved links, topics, diagrams
- `Feed.tsx` — News feed & articles
- `News.tsx` — Daily AI news digest
- `Goals.tsx` — Goal management with check-offs
- `AccountPanel.tsx` — Settings (name, role, password, reset, sign out)
- `Mermaid.tsx` — Lazy-loaded Mermaid diagram renderer
- `AvatarMenu.tsx` — User avatar dropdown
- `StatHeader.tsx` — Stats bar (level, streak, today's questions)
- `ChangePassword.tsx` — Password change form
- `ResetPanel.tsx` — Reset progress confirmation
- `RegisterSW.tsx` — Service worker registration for PWA
- `components/ui/` — Reusable UI primitives (Markdown, Spinner, Toast)

### Lib modules

| Module | Purpose |
|--------|---------|
| `lib/openrouter.ts` | Thin OpenRouter client — `chat()` (non-streaming) and `chatStream()` (SSE). Server-only. Supports `:online` web search and `json` response format. |
| `lib/models.ts` | Role→model mapping (`judge`, `generate`, `web`, `coach`), each env-overridable. |
| `lib/session-gen.ts` | `pickFocusSkills()` (weakest-area selection), `generateSession()` (LLM question generation), `parseSession()` (JSON recovery from truncated LLM output), `salvageQuestions()` (recovers partial questions from cut-off responses). |
| `lib/plan-evolve.ts` | `evolvePlan()` — LLM-driven curriculum pruning/reordering/addition. Never touches `active`/`mastered` rows. |
| `lib/roles.ts` | 6 role definitions (architect, backend, frontend, data, em, generalist) — each defines skill subset, level ceiling, and LLM framing context. |
| `lib/skills.ts` | 29 skills across 5 domains (backend, frontend, data, management, general). `ALL_SKILLS` = full registry, `SKILLS` = original 12 architect skills (back-compat). |
| `lib/fetch-cache.ts` | Client-side in-memory GET cache (1min TTL, stale-while-revalidate, dedup). |
| `lib/brain-gym.ts` | Brain-gym question generation (7 cognitive domains). |
| `lib/quiz-gen.ts` | Legacy quiz generation (pre-dates session-gen). |
| `lib/news.ts` | AI news digest generation. |
| `lib/feeds.ts` | Paper/article feed curation. |
| `lib/site-url.ts` | Canonical site URL for auth redirects. |
| `lib/supabase/server.ts` | Server-side Supabase client (RLS-scoped to logged-in user). |
| `lib/supabase/client.ts` | Browser-side Supabase client. |
| `lib/supabase/admin.ts` | Service-role Supabase client (bypasses RLS, server-only, singleton). |

### Session model

A session is a JSON object in the `sessions` table. Each question has:
- `skill` — skill key from the registry
- `level` — 1-5 difficulty
- `concept` — short tag (e.g. "write-heavy sharding")
- `question` — MCQ text
- `options` — 4 strings
- `correct` — 0-3 index
- `explanation` — teaching text (3-5 sentences)
- `followup_prompt` — open-ended written question
- `followup_mcqs` — 3 deeper MCQs on the same concept

### Skills & levels

Each skill has a level (1-5), proficiency (0-100 EMA), and sessions-at-level counter. The LLM judge evaluates cumulative history and returns `advance`/`hold`/`downgrade`. Level names: 1=Foundational, 2=Applied, 3=Intermediate, 4=Advanced, 5=Expert/staff.

### Database

Supabase Postgres with Row-Level Security. Every user table has:
- `user_id` column (UUID, references `auth.users`)
- RLS policy: `auth.uid() = user_id`
- A trigger auto-creates a `profiles` row on signup

Key tables: `profiles`, `sessions`, `skill_profile`, `curriculum`, `learner_profile`, `daily_content`, `chat_messages`, `memory`, `goals`, `goal_logs`, `bookmarks`, `brain_gym_results`.

### Design system

Custom charcoal/lime palette (`tailwind.config.ts`):
- `charcoal.DEFAULT: #111112`, `charcoal.soft: #1c1c1e`, `charcoal.line: #2a2a2c`
- `brand-300: #c8f135` (lime accent), `brand-400: #b6dd1f`, `brand-500: #9dbf19`
- Poppins font (self-hosted via Next.js font), mobile-first, light-only (no dark mode)

### PWA

- `manifest.webmanifest` + `public/sw.js` for installability
- `public/icons/` — app icons (including SVG logo)
- `RegisterSW.tsx` registers the service worker
- Offline-tolerant app shell

### Deployment

Vercel + Supabase. Daily cron in `vercel.json` (`0 6 * * *` → `/api/cron/daily`). Hobby tier allows one cron and 60s function execution. API routes with heavy LLM work set `maxDuration: 120`.