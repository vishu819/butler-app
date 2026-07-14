-- Per-skill adaptive profile: one row per (user, skill). Tracks proficiency and
-- an adaptive difficulty level so Butler can start easy, target weaknesses, and ramp up.
create table if not exists skill_profile (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  skill text not null,                 -- one of the fixed architect competencies
  level int not null default 1,        -- adaptive difficulty 1..5
  proficiency int not null default 0,  -- rolling 0..100 (correct-rate based)
  seen int not null default 0,         -- total questions answered in this skill
  correct int not null default 0,      -- total correct
  updated_at timestamptz not null default now(),
  unique (user_id, skill)
);
create index if not exists skill_profile_user_idx on skill_profile(user_id);

alter table skill_profile enable row level security;
create policy "own skill_profile" on skill_profile for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
