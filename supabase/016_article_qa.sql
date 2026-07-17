-- Inline Q&A on a daily deep-dive article. While reading, the learner can ask
-- free-form follow-ups or highlight a passage and ask about it; each Q&A is
-- saved here, tied to that day's article (daily_learning.learn_date), so the
-- thread reloads next time they open it.
create table if not exists article_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  learn_date date not null,           -- the daily_learning article this belongs to
  selection text,                     -- highlighted passage, or null for free-form
  question text not null,
  answer text not null,
  created_at timestamptz not null default now()
);
create index if not exists article_questions_idx
  on article_questions(user_id, learn_date, created_at);

alter table article_questions enable row level security;
create policy "own article_questions" on article_questions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
