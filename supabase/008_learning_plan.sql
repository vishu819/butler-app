-- Phase 1: LLM-maintained learner profile + adaptive curriculum plan.

-- One narrative profile per user: the LLM's evolving understanding of the learner.
create table if not exists learner_profile (
  user_id uuid primary key references auth.users(id) on delete cascade,
  narrative text,                    -- LLM prose: how they think, what they know
  strengths text[] default '{}',
  gaps text[] default '{}',          -- misconceptions / weak spots
  misconceptions jsonb default '[]'::jsonb, -- [{topic, note}]
  updated_at timestamptz not null default now()
);

-- Curriculum = an ordered plan of modules, each with topics. LLM-designed, adaptive.
create table if not exists curriculum (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  module text not null,              -- e.g. "Distributed Systems Foundations"
  topic text not null,               -- e.g. "CAP theorem tradeoffs in practice"
  skill text,                        -- maps to one of the 12 skill keys
  rationale text,                    -- why this topic, why now
  position int not null default 0,   -- order within the plan
  status text not null default 'planned',  -- planned | active | mastered | needs_review
  mastery int not null default 0,    -- 0-100, LLM-assessed understanding
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists curriculum_user_idx on curriculum(user_id, position);

alter table learner_profile enable row level security;
alter table curriculum enable row level security;
create policy "own learner_profile" on learner_profile for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own curriculum" on curriculum for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
