-- Convenience: run this ONE file in Supabase SQL Editor to apply every migration
-- (003 quiz, 004 learn, 005 skill_profile, 006 butler_v2) at once.
-- Safe to re-run (create if not exists / policies may error if they already exist —
-- ignore "already exists" errors, or drop first).

-- ---------- 003: quiz results ----------
create table if not exists quiz_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  quiz_date date not null,
  score int not null,
  total int not null,
  answers jsonb not null default '[]'::jsonb,
  weak_concepts text[] default '{}',
  created_at timestamptz not null default now(),
  unique (user_id, quiz_date)
);
create index if not exists quiz_results_user_idx on quiz_results(user_id, quiz_date desc);
alter table quiz_results enable row level security;
do $$ begin
  create policy "own quiz_results" on quiz_results for all
    using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

-- ---------- 004: learn articles ----------
create table if not exists learn_articles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  concept text not null,
  question text,
  article text not null,
  created_at timestamptz not null default now()
);
create index if not exists learn_articles_user_idx on learn_articles(user_id, created_at desc);
alter table learn_articles enable row level security;
do $$ begin
  create policy "own learn_articles" on learn_articles for all
    using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

-- ---------- 005: skill profile ----------
create table if not exists skill_profile (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  skill text not null,
  level int not null default 1,
  proficiency int not null default 0,
  seen int not null default 0,
  correct int not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id, skill)
);
create index if not exists skill_profile_user_idx on skill_profile(user_id);
alter table skill_profile enable row level security;
do $$ begin
  create policy "own skill_profile" on skill_profile for all
    using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

-- ---------- 006: brain gym log + concept diagrams ----------
create table if not exists brain_gym_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  log_date date not null,
  duration_sec int,
  completed boolean not null default false,
  correct boolean,
  created_at timestamptz not null default now()
);
create index if not exists brain_gym_log_user_idx on brain_gym_log(user_id, created_at desc);

create table if not exists concept_diagrams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  concept text not null,
  skill text,
  diagram text not null,
  caption text,
  created_at timestamptz not null default now()
);
create index if not exists concept_diagrams_user_idx on concept_diagrams(user_id, created_at desc);

alter table brain_gym_log enable row level security;
alter table concept_diagrams enable row level security;
do $$ begin
  create policy "own brain_gym_log" on brain_gym_log for all
    using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "own concept_diagrams" on concept_diagrams for all
    using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
