// Load a minimal seed dataset so the app has a starting catalog even before
// the first full metadata crawl finishes. Safe to run multiple times.

import { createSupabaseClientFromEnv } from '../api/_lib/movie-metadata.js';

const SEED = [
  { tmdb_id: '27205', title: 'Inception', year: '2010', release_date: '2010-07-16', poster_path: '/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg', vote_average: 8.4, vote_count: 37000, popularity: 120, overview: 'Cobb, a skilled thief, commits corporate espionage by infiltrating the subconscious.', genres: ['Action', 'Science Fiction', 'Adventure'], directors: ['Christopher Nolan'], actors: ['Leonardo DiCaprio', 'Joseph Gordon-Levitt', 'Elliot Page'], keywords: ['dream', 'subconscious', 'heist'], updated_at: new Date().toISOString() },
  { tmdb_id: '155', title: 'The Dark Knight', year: '2008', release_date: '2008-07-18', poster_path: '/qJ2tW6WMUDux911B6EMThmGXzGc.jpg', vote_average: 8.5, vote_count: 33000, popularity: 100, overview: 'Batman raises the stakes in his war on crime.', genres: ['Action', 'Crime', 'Drama'], directors: ['Christopher Nolan'], actors: ['Christian Bale', 'Heath Ledger', 'Aaron Eckhart'], keywords: ['joker', 'gotham', 'vigilante'], updated_at: new Date().toISOString() },
  { tmdb_id: '680', title: 'Pulp Fiction', year: '1994', release_date: '1994-10-14', poster_path: '/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg', vote_average: 8.5, vote_count: 28000, popularity: 90, overview: 'The lives of two mob hitmen, a boxer, and a pair of diner bandits intertwine.', genres: ['Crime', 'Drama'], directors: ['Quentin Tarantino'], actors: ['John Travolta', 'Samuel L. Jackson', 'Uma Thurman'], keywords: ['hitman', 'non-linear', 'los angeles'], updated_at: new Date().toISOString() },
  { tmdb_id: '550', title: 'Fight Club', year: '1999', release_date: '1999-10-15', poster_path: '/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg', vote_average: 8.4, vote_count: 29000, popularity: 95, overview: 'An insomniac office worker and a devil-may-care soap maker form an underground fight club.', genres: ['Drama'], directors: ['David Fincher'], actors: ['Brad Pitt', 'Edward Norton', 'Helena Bonham Carter'], keywords: ['dissociative identity disorder', 'violence', 'consumerism'], updated_at: new Date().toISOString() },
  { tmdb_id: '13', title: 'Forrest Gump', year: '1994', release_date: '1994-07-06', poster_path: '/arw2vcBveWOVZr6pxd9XTd1TdQa.jpg', vote_average: 8.5, vote_count: 27000, popularity: 85, overview: 'The presidencies of Kennedy and Johnson, the Vietnam War, and more, through the eyes of one man.', genres: ['Comedy', 'Drama', 'Romance'], directors: ['Robert Zemeckis'], actors: ['Tom Hanks', 'Robin Wright', 'Gary Sinise'], keywords: ['vietnam', 'running', 'alabama'], updated_at: new Date().toISOString() },
];

async function main() {
  const supabase = createSupabaseClientFromEnv();

  const { data: existing } = await supabase.from('movie_metadata').select('tmdb_id').in('tmdb_id', SEED.map((r) => r.tmdb_id));
  const existingIds = new Set((existing || []).map((r) => r.tmdb_id));

  const toInsert = SEED.filter((r) => !existingIds.has(r.tmdb_id));
  if (toInsert.length === 0) {
    console.log('All seed movies already present - nothing to do.');
    return;
  }

  const { error } = await supabase.from('movie_metadata').insert(toInsert);
  if (error) {
    console.error('Seed insert failed:', error.message);
    process.exit(1);
  }
  console.log('Inserted ' + toInsert.length + ' seed movies.');
}

main().catch((err) => { console.error(err.message); process.exit(1); });
