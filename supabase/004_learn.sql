-- Saved study articles: when the user marks a quiz concept as "learn more",
-- the LLM writes a summarized article and it's stored here as a knowledge library.
create table if not exists learn_articles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  concept text not null,
  question text,
  article text not null,        -- markdown-ish summarized article
  created_at timestamptz not null default now()
);
create index if not exists learn_articles_user_idx on learn_articles(user_id, created_at desc);

alter table learn_articles enable row level security;
create policy "own learn_articles" on learn_articles for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
