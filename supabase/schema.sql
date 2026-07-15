-- PI Companion — database schema
-- Run this in Supabase > SQL Editor.
-- Single-user app, but everything is scoped by auth.uid() with RLS so it's safe.

-- ---------- profiles ----------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  timezone text default 'UTC',
  prefs jsonb not null default '{}'::jsonb,   -- coaching style, focus areas, etc.
  created_at timestamptz not null default now()
);

-- ---------- coach long-term memory ----------
create table if not exists memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'note',          -- note | preference | milestone | insight
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists memory_user_idx on memory(user_id, created_at desc);

-- ---------- goals ----------
create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  cadence text not null default 'daily',       -- daily | weekly | monthly
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists goals_user_idx on goals(user_id);

-- ---------- goal check-off log ----------
create table if not exists goal_logs (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references goals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  done boolean not null default true,
  created_at timestamptz not null default now(),
  unique (goal_id, log_date)
);
create index if not exists goal_logs_user_date_idx on goal_logs(user_id, log_date);

-- ---------- chat history ----------
create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,                          -- user | assistant | system
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists chat_user_idx on chat_messages(user_id, created_at);

-- ---------- daily generated content (shared, one row per day+type) ----------
create table if not exists daily_content (
  id uuid primary key default gen_random_uuid(),
  content_date date not null,
  type text not null,                          -- eng_q | brain_gym | news
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (content_date, type)
);
create index if not exists daily_content_date_idx on daily_content(content_date);

-- ---------- daily quiz results ----------
create table if not exists quiz_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  quiz_date date not null,
  score int not null,               -- number correct
  total int not null,               -- number of questions
  answers jsonb not null default '[]'::jsonb,   -- [{qi, chosen, correct, isCorrect}]
  weak_concepts text[] default '{}',            -- concepts of questions gotten wrong
  created_at timestamptz not null default now(),
  unique (user_id, quiz_date)
);
create index if not exists quiz_results_user_idx on quiz_results(user_id, quiz_date desc);

-- ================= Row Level Security =================
alter table profiles      enable row level security;
alter table memory        enable row level security;
alter table goals         enable row level security;
alter table goal_logs     enable row level security;
alter table chat_messages enable row level security;
alter table daily_content enable row level security;
alter table quiz_results  enable row level security;

-- Per-user tables: owner can do everything with their own rows.
create policy "own profile"   on profiles      for all using (auth.uid() = id)      with check (auth.uid() = id);
create policy "own memory"    on memory        for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own goals"     on goals         for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own goal_logs" on goal_logs     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own chat"      on chat_messages for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own quiz"      on quiz_results  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- daily_content: any signed-in user may read; only the service role writes (cron).
create policy "read daily" on daily_content for select using (auth.role() = 'authenticated');

-- Auto-create a profile row when a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Name from signup metadata, else the email's local part, else a neutral default.
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
