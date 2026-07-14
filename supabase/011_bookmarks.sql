-- Bookmarks: news articles / links the user saves into their Library.
create table if not exists bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  url text not null,
  source text,                  -- hostname, for display
  created_at timestamptz not null default now(),
  unique (user_id, url)         -- same link can't be bookmarked twice
);
create index if not exists bookmarks_user_idx on bookmarks(user_id, created_at desc);

alter table bookmarks enable row level security;
create policy "own bookmarks" on bookmarks for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
