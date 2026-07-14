-- Phase 2: session engine + slow-ramp support.

-- Track consecutive strong days per skill so levels only rise after sustained success.
alter table skill_profile add column if not exists level_streak int not null default 0;

-- A learning session: the day's ~4-5 questions across ~2 weak sectors.
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_date date not null,
  focus_skills text[] default '{}',   -- the ~2 sectors this session targets
  questions jsonb not null default '[]'::jsonb,  -- [{skill, level, concept, question, options, correct, explanation, followup_prompt}]
  responses jsonb not null default '[]'::jsonb,  -- [{qi, chosen, followup_text, mcq_correct, followup_score, feedback}]
  status text not null default 'active',  -- active | complete
  created_at timestamptz not null default now(),
  unique (user_id, session_date)
);
create index if not exists sessions_user_idx on sessions(user_id, session_date desc);

alter table sessions enable row level security;
create policy "own sessions" on sessions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
