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

update public.movie_metadata
set
  year = coalesce(year, release_date, ''),
  release_date = coalesce(release_date, ''),
  poster_path = poster_path,
  poster_url = poster_url,
  vote_average = vote_average,
  vote_count = coalesce(vote_count, 0),
  popularity = coalesce(popularity, 0),
  overview = coalesce(overview, ''),
  genres = coalesce(genres, '{}'::text[]),
  directors = coalesce(directors, '{}'::text[]),
  actors = coalesce(actors, '{}'::text[]),
  keywords = coalesce(keywords, '{}'::text[]),
  updated_at = coalesce(updated_at, now())
where true;

create index if not exists movie_metadata_title_idx on public.movie_metadata using gin (to_tsvector('english', title));
