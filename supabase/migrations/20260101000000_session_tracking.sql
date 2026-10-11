-- Active sessions and chronological navigation events per user.

create table if not exists user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  created_at timestamptz default now(),
  last_seen_at timestamptz default now()
);

create table if not exists session_navigation_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references user_sessions(id) on delete cascade,
  user_id uuid references auth.users(id),
  path text not null,
  client_timestamp timestamptz not null
);

-- Clients write directly with the publishable key, so lock rows to their owner.
alter table user_sessions enable row level security;
alter table session_navigation_events enable row level security;

drop policy if exists "user_sessions_select_own" on user_sessions;
create policy "user_sessions_select_own" on user_sessions
  for select using (auth.uid() = user_id);

drop policy if exists "user_sessions_insert_own" on user_sessions;
create policy "user_sessions_insert_own" on user_sessions
  for insert with check (auth.uid() = user_id);

drop policy if exists "user_sessions_update_own" on user_sessions;
create policy "user_sessions_update_own" on user_sessions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "session_navigation_events_select_own" on session_navigation_events;
create policy "session_navigation_events_select_own" on session_navigation_events
  for select using (auth.uid() = user_id);

drop policy if exists "session_navigation_events_insert_own" on session_navigation_events;
create policy "session_navigation_events_insert_own" on session_navigation_events
  for insert with check (auth.uid() = user_id);

create index if not exists user_sessions_user_id_idx
  on user_sessions (user_id);

create index if not exists session_navigation_events_session_id_idx
  on session_navigation_events (session_id);

create index if not exists session_navigation_events_user_id_idx
  on session_navigation_events (user_id);
