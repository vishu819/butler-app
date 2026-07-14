-- Butler v2: brain-gym category rotation/log + concept recap diagrams.

-- Log every brain-gym attempt so we can rotate categories and show progress.
create table if not exists brain_gym_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,            -- memory | logic | spatial | pattern | mental_math | verbal | attention
  log_date date not null,
  duration_sec int,                  -- how long the timed exercise ran
  completed boolean not null default false,
  correct boolean,                   -- did they get it right (if applicable)
  created_at timestamptz not null default now()
);
create index if not exists brain_gym_log_user_idx on brain_gym_log(user_id, created_at desc);

-- Concept recap diagrams: a saved visual summary of a learned concept.
create table if not exists concept_diagrams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  concept text not null,
  skill text,
  diagram text not null,             -- mermaid diagram source
  caption text,
  created_at timestamptz not null default now()
);
create index if not exists concept_diagrams_user_idx on concept_diagrams(user_id, created_at desc);

alter table brain_gym_log enable row level security;
alter table concept_diagrams enable row level security;
create policy "own brain_gym_log" on brain_gym_log for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own concept_diagrams" on concept_diagrams for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
