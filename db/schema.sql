create schema if not exists mibr_fantasy_world_cup;

create table if not exists mibr_fantasy_world_cup.authorized_users (
  discord_user_id text primary key,
  display_label text not null,
  discord_avatar_url text,
  role text not null default 'player' check (role in ('owner', 'admin', 'player')),
  paid_entry boolean not null default false,
  paid_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists mibr_fantasy_world_cup.teams (
  id text primary key,
  name text not null,
  short_name text not null,
  abbreviation text not null,
  flag_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists mibr_fantasy_world_cup.matches (
  id text primary key,
  provider_match_id text,
  stage text not null,
  group_name text,
  kickoff_at timestamptz not null,
  lock_at timestamptz not null,
  venue text,
  home_team_id text references mibr_fantasy_world_cup.teams(id),
  away_team_id text references mibr_fantasy_world_cup.teams(id),
  status text not null default 'SCHEDULED',
  home_score integer,
  away_score integer,
  winner text check (winner in ('home', 'away', 'draw')),
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (home_score is null or home_score >= 0),
  check (away_score is null or away_score >= 0)
);

create table if not exists mibr_fantasy_world_cup.predictions (
  id bigserial primary key,
  discord_user_id text not null references mibr_fantasy_world_cup.authorized_users(discord_user_id),
  match_id text not null references mibr_fantasy_world_cup.matches(id),
  predicted_winner text not null check (predicted_winner in ('home', 'away', 'draw')),
  predicted_home_score integer,
  predicted_away_score integer,
  winner_points integer not null default 0,
  score_points integer not null default 0,
  total_points integer not null default 0,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (discord_user_id, match_id),
  check (predicted_home_score is null or predicted_home_score >= 0),
  check (predicted_away_score is null or predicted_away_score >= 0),
  check (
    predicted_home_score is null
    or predicted_away_score is null
    or (
      (predicted_winner = 'home' and predicted_home_score > predicted_away_score)
      or (predicted_winner = 'away' and predicted_away_score > predicted_home_score)
      or (predicted_winner = 'draw' and predicted_home_score = predicted_away_score)
    )
  )
);

create table if not exists mibr_fantasy_world_cup.match_sync_runs (
  id bigserial primary key,
  source text not null,
  scope text not null,
  status text not null,
  message text,
  created_at timestamptz not null default now()
);

create table if not exists mibr_fantasy_world_cup.match_source_observations (
  id bigserial primary key,
  source text not null,
  scope text not null,
  status text not null,
  message text,
  payload_hash text,
  payload jsonb,
  normalized_matches integer not null default 0,
  observed_at timestamptz not null default now()
);

create table if not exists mibr_fantasy_world_cup.match_observations (
  id bigserial primary key,
  source text not null,
  match_id text not null,
  provider_match_id text,
  stage text not null,
  group_name text,
  kickoff_at timestamptz not null,
  lock_at timestamptz not null,
  venue text,
  home_team_name text not null,
  away_team_name text not null,
  status text not null,
  home_score integer,
  away_score integer,
  winner text,
  raw jsonb,
  observed_at timestamptz not null default now(),
  unique (source, match_id)
);

create table if not exists mibr_fantasy_world_cup.match_conflicts (
  id bigserial primary key,
  match_id text not null,
  field_name text not null,
  selected_value text not null,
  observed_values jsonb not null,
  status text not null default 'open',
  observed_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (match_id, field_name, status)
);

create index if not exists matches_kickoff_at_idx
  on mibr_fantasy_world_cup.matches (kickoff_at);

create index if not exists matches_status_idx
  on mibr_fantasy_world_cup.matches (status);

create index if not exists predictions_match_id_idx
  on mibr_fantasy_world_cup.predictions (match_id);

create or replace function mibr_fantasy_world_cup.reject_inactive_prediction()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from mibr_fantasy_world_cup.authorized_users u
    where u.discord_user_id = new.discord_user_id
      and u.active = true
  ) then
    raise exception 'User is not active for MiBR fantasy predictions';
  end if;

  return new;
end;
$$;

drop trigger if exists predictions_require_active_user
  on mibr_fantasy_world_cup.predictions;

create trigger predictions_require_active_user
  before insert or update on mibr_fantasy_world_cup.predictions
  for each row
  execute function mibr_fantasy_world_cup.reject_inactive_prediction();

create index if not exists match_source_observations_source_idx
  on mibr_fantasy_world_cup.match_source_observations (source, observed_at desc);

create index if not exists match_observations_match_id_idx
  on mibr_fantasy_world_cup.match_observations (match_id);

create index if not exists match_conflicts_status_idx
  on mibr_fantasy_world_cup.match_conflicts (status, observed_at desc);

alter table if exists mibr_fantasy_world_cup.authorized_users
  add column if not exists paid_entry boolean not null default false;

alter table if exists mibr_fantasy_world_cup.authorized_users
  add column if not exists paid_at timestamptz;

create index if not exists authorized_users_paid_entry_idx
  on mibr_fantasy_world_cup.authorized_users (paid_entry);
