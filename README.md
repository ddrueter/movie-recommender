# CineHound

> Sniff out your next favorite film.

CineHound is a personalized movie recommendation engine that cuts through choice paralysis. Rate what you've watched, and it surfaces films you'll actually want to see — no endless scrolling required.

## What It Does

- **Personalized Recommendations** — Collaborative filtering with Pearson correlation maps your taste against millions of ratings. Every film you rate sharpens the signal.
- **Real Trending** — Fetches what's hot *right now* from TMDB's trending endpoint, enriched with full metadata from a local cache.
- **Popular & Top Rated** — Browse the most popular and highest-acclaimed films, all with ratings, posters, cast, and genres at a glance.
- **Smart Search** — Search TMDB's entire catalog. Results are sorted by how well they match your query, with instant rating from the results grid.
- **Adaptive Grid** — The interface measures your screen and renders exactly the right number of columns. Compact home sections expand to full-page views on demand.
- **One-Click Info** — Click any movie card to open its TMDB page in a new tab. No digging around for details.

## How It Works

CineHound uses a **hybrid recommendation engine**:

1. **Collaborative Filtering** — A Pearson correlation similarity matrix maps every movie to its nearest neighbors. Your ratings weight each neighbor's contribution to your predictions.
2. **Acclaim Blend** — A configurable weight blends in universal acclaim (Bayesian weighted rating: `√vote_count × vote_average`), so undiscovered gems get a fair shot alongside blockbusters.
3. **Log-Normalization** — Scores are compressed via log-scale to produce meaningful percentage matches without extreme outliers.

Metadata and poster art come from TMDB, cached in Supabase for speed. The similarity matrix (derived from the MovieLens 25M dataset) ships pre-built so recommendations work out of the box.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 7 |
| API | Vercel serverless functions (Node.js) |
| Auth | Firebase Authentication |
| Database | Supabase Postgres |
| Recommendations | Pearson correlation matrix (MovieLens 25M + user ratings) |
| Metadata | TMDB API, cached in Supabase |

## Setup

### Prerequisites

- Node.js 18+ and npm 9+
- A Supabase project (free tier works)
- A Firebase project with Authentication enabled
- A TMDB API key (free at [themoviedb.org](https://www.themoviedb.org/settings/api))

### Quick Start

```bash
git clone https://github.com/ddrueter/cinehound.git
cd cinehound
npm install
cp .env.example .env
# Edit .env with your API keys
npm run dev
```

Opens at `http://localhost:5173`. See [`.env.example`](.env.example) for the full list of environment variables.

### Database

Run [`supabase/schema.sql`](supabase/schema.sql) in your Supabase SQL Editor to create the `ratings`, `movie_metadata`, and `profiles` tables.

### Metadata Cache

The app shows richer movie data (posters, cast, genres) when metadata is cached:

```bash
npm run refresh-metadata      # Full crawl (~15-30 min first run)
npm run refresh-hot            # Daily: update trending + popular + now-playing
```

Metadata is stored in Supabase and served from the edge. The hot refresh keeps trending current without re-crawling the entire catalog.

### Similarity Matrix

A pre-built matrix ships in [`public/similarity_matrix.json`](public/similarity_matrix.json). To rebuild from the MovieLens 25M dataset:

```bash
npm run build-matrix
```

Requires `scripts/data/links.csv` and `scripts/data/ratings.csv` from [MovieLens](https://grouplens.org/datasets/movielens/25m/).

### Deploy

Push to GitHub and import into Vercel. Add all environment variables from your `.env` to the Vercel project settings. No build configuration needed — Vercel auto-detects Vite.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server with local API routes |
| `npm run build` | Production build |
| `npm run build-matrix` | Rebuild similarity matrix from MovieLens CSVs |
| `npm run refresh-metadata` | Full TMDB metadata crawl |
| `npm run refresh-hot` | Quick refresh: trending + popular + now-playing |
| `npm run lint` | ESLint |

## Project Structure

```
├── api/                        # Vercel serverless functions
│   ├── _lib/                   # Shared backend utilities
│   ├── home.js                 # GET /api/home — trending, popular, top rated
│   ├── trending.js             # GET /api/trending — TMDB trending + cache
│   ├── recommendations.js      # GET /api/recommendations
│   ├── search-tmdb.js          # GET /api/search-tmdb
│   ├── ratings.js              # POST /api/ratings
│   ├── profile-sync.js         # POST /api/profile-sync
│   └── user-ratings.js         # GET /api/user-ratings
├── public/
│   └── similarity_matrix.json  # Pre-built matrix (~67 MB)
├── scripts/
│   ├── cache-movie-metadata.js # Full metadata crawler
│   ├── refresh-hot-metadata.js # Daily hot refresh
│   ├── rebuild-similarity-matrix.js
│   └── data/                   # MovieLens CSV source files
├── src/
│   ├── App.jsx                 # Main application
│   ├── lib/                    # Frontend utilities
│   └── ...
├── supabase/
│   └── schema.sql              # Database schema
├── vercel.json
└── vite.config.js
```

## License

Personal/educational use. MovieLens data under its [license terms](https://files.grouplens.org/datasets/movielens/ml-25m-README.html). TMDB data courtesy of [The Movie Database](https://www.themoviedb.org/).
