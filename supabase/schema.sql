create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_uid text not null unique,
  email text unique,
  display_name text,
  provider_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  tmdb_id text not null,
  rating integer not null,
  created_at timestamptz not null default now(),
  unique (user_id, tmdb_id)
);

create index if not exists ratings_user_id_idx on public.ratings (user_id);
create index if not exists ratings_tmdb_id_idx on public.ratings (tmdb_id);

create table if not exists public.movie_metadata (
  tmdb_id text primary key,
  title text not null,
  year text not null default '',
  release_date text not null default '',
  poster_path text,
  poster_url text,
  vote_average numeric,
  vote_count integer not null default 0,
  popularity numeric not null default 0,
  overview text,
  genres text[] not null default '{}'::text[],
  directors text[] not null default '{}'::text[],
  actors text[] not null default '{}'::text[],
  keywords text[] not null default '{}'::text[],
  updated_at timestamptz not null default now()
);

alter table if exists public.movie_metadata
  add column if not exists year text not null default '',
  add column if not exists release_date text not null default '',
  add column if not exists poster_path text,
  add column if not exists poster_url text,
  add column if not exists vote_average numeric,
  add column if not exists vote_count integer not null default 0,
  add column if not exists popularity numeric not null default 0,
  add column if not exists overview text,
  add column if not exists genres text[] not null default '{}'::text[],
  add column if not exists directors text[] not null default '{}'::text[],
  add column if not exists actors text[] not null default '{}'::text[],
  add column if not exists keywords text[] not null default '{}'::text[],
  add column if not exists updated_at timestamptz not null default now();

create index if not exists movie_metadata_title_idx on public.movie_metadata using gin (to_tsvector('english', title));
