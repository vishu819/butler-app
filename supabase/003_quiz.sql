-- Daily MCQ quiz results. Replaces the open-ended `answers` flow.
create table if not exists quiz_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  quiz_date date not null,
  score int not null,               -- number correct
  total int not null,               -- number of questions
  answers jsonb not null default '[]'::jsonb,   -- [{qi, chosen, correct}]
  weak_concepts text[] default '{}',            -- concepts of questions gotten wrong
  created_at timestamptz not null default now(),
  unique (user_id, quiz_date)
);
create index if not exists quiz_results_user_idx on quiz_results(user_id, quiz_date desc);

alter table quiz_results enable row level security;
create policy "own quiz_results" on quiz_results for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
