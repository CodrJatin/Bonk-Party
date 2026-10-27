-- Optional: permanent Hall of Fame for Bonk Party.
-- Paste this into Supabase -> SQL Editor -> Run. Then set SUPABASE_URL and
-- SUPABASE_SERVICE_KEY on your Render service.

create table if not exists public.hall_of_fame (
  name_key   text primary key,
  name       text not null,
  wins       integer not null default 0,
  matches    integer not null default 0,
  points     integer not null default 0,
  round_wins integer not null default 0,
  updated_at timestamptz not null default now()
);

-- Only the server (using the secret/service key) touches this table.
alter table public.hall_of_fame enable row level security;

-- Atomic "add this match result" so two matches finishing at once never clobber each other.
create or replace function public.record_result(
  p_key text, p_name text, p_win integer, p_points integer, p_rounds integer
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.hall_of_fame (name_key, name, wins, matches, points, round_wins, updated_at)
  values (p_key, p_name, p_win, 1, p_points, p_rounds, now())
  on conflict (name_key) do update set
    name       = excluded.name,
    wins       = hall_of_fame.wins + excluded.wins,
    matches    = hall_of_fame.matches + 1,
    points     = hall_of_fame.points + excluded.points,
    round_wins = hall_of_fame.round_wins + excluded.round_wins,
    updated_at = now();
$$;

revoke all on function public.record_result(text, text, integer, integer, integer) from public, anon, authenticated;
