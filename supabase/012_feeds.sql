-- Summaries for papers / company articles, generated on open and cached by URL.
-- Global (content is the same for everyone), readable by any authed user;
-- writes happen via the admin client (service role), same as daily_content.
create table if not exists feed_summaries (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,
  title text,
  kind text not null,          -- 'paper' | 'article'
  summary text not null,       -- markdown
  created_at timestamptz not null default now()
);
create index if not exists feed_summaries_url_idx on feed_summaries(url);

alter table feed_summaries enable row level security;
do $$ begin
  create policy "read feed_summaries" on feed_summaries for select
    using (auth.role() = 'authenticated');
exception when duplicate_object then null; end $$;
