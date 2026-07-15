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

-- ---------- 007: daily learning digest ----------
create table if not exists daily_learning (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  learn_date date not null,
  summary text not null,
  concepts text[] default '{}',
  score int, total int,
  created_at timestamptz not null default now(),
  unique (user_id, learn_date)
);
create index if not exists daily_learning_user_idx on daily_learning(user_id, learn_date desc);
alter table daily_learning enable row level security;
do $$ begin
  create policy "own daily_learning" on daily_learning for all
    using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

-- ---------- 008: learner profile + curriculum ----------
create table if not exists learner_profile (
  user_id uuid primary key references auth.users(id) on delete cascade,
  narrative text, strengths text[] default '{}', gaps text[] default '{}',
  misconceptions jsonb default '[]'::jsonb, updated_at timestamptz not null default now()
);
create table if not exists curriculum (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  module text not null, topic text not null, skill text, rationale text,
  position int not null default 0, status text not null default 'planned',
  mastery int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists curriculum_user_idx on curriculum(user_id, position);
alter table learner_profile enable row level security;
alter table curriculum enable row level security;
do $$ begin
  create policy "own learner_profile" on learner_profile for all
    using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "own curriculum" on curriculum for all
    using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

-- ---------- 009: session engine + slow-ramp ----------
alter table skill_profile add column if not exists level_streak int not null default 0;
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_date date not null, focus_skills text[] default '{}',
  questions jsonb not null default '[]'::jsonb, responses jsonb not null default '[]'::jsonb,
  status text not null default 'active', created_at timestamptz not null default now(),
  unique (user_id, session_date)
);
create index if not exists sessions_user_idx on sessions(user_id, session_date desc);
alter table sessions enable row level security;
do $$ begin
  create policy "own sessions" on sessions for all
    using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

-- ---------- 010: confidence-gated progression ----------
alter table skill_profile add column if not exists sessions_at_level int not null default 0;
alter table skill_profile add column if not exists history jsonb not null default '[]'::jsonb;

-- ---------- 011: bookmarks (saved AI-news links) ----------
create table if not exists bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  url text not null,
  source text,
  created_at timestamptz not null default now(),
  unique (user_id, url)
);
create index if not exists bookmarks_user_idx on bookmarks(user_id, created_at desc);
alter table bookmarks enable row level security;
do $$ begin
  create policy "own bookmarks" on bookmarks for all
    using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

-- ---------- 012: feed summaries (papers / company articles) ----------
create table if not exists feed_summaries (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,
  title text,
  kind text not null,
  summary text not null,
  created_at timestamptz not null default now()
);
create index if not exists feed_summaries_url_idx on feed_summaries(url);
alter table feed_summaries enable row level security;
do $$ begin
  create policy "read feed_summaries" on feed_summaries for select
    using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;

-- ---------- 013: multi-user profile name default ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'name', ''),
      nullif(split_part(new.email, '@', 1), ''),
      'there'
    )
  );
  return new;
end;
$$;
