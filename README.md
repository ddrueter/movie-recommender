# CineHound

> Sniff out your next favorite film. A tactical recommendation engine.

CineHound computes personalized film recommendations using collaborative filtering with Pearson correlation on the MovieLens 25M dataset. It intercepts choice paralysis — matching your rating vectors against a similarity matrix to surface high-affinity films. Metadata and poster art are sourced from TMDB and cached in Supabase. The stack: React + Vite on the frontend, Vercel serverless functions for the API, Firebase for authentication, and Supabase Postgres for data persistence.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 7 |
| API / Backend | Vercel serverless functions (Node.js) |
| Auth | Firebase Authentication (Google, email/password) |
| Database | Supabase Postgres |
| Recommendations | Pearson correlation similarity matrix (MovieLens 25M + user ratings) |
| Metadata | TMDB API (cached in Supabase) |
| Storage | Local JSON for similarity matrix, bundled with serverless function |

## Prerequisites

- **Node.js** 18+ and **npm** 9+
- A **Supabase** project (free tier works)
- A **Firebase** project with Authentication enabled
- A **TMDB** API key (free at [themoviedb.org](https://www.themoviedb.org/settings/api))
- A **Vercel** account for deployment (free Hobby plan works)
- **Git**

## Local Setup

### 1. Clone and install

```bash
git clone https://github.com/<your-username>/cinehound.git
cd cinehound
npm install
```

### 2. Configure environment variables

Copy the example file and fill in your keys:

```bash
cp .env.example .env
```

Edit [`.env`](.env.example) with your actual values:

| Variable | Where to get it |
|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase Console → Project Settings → Web API Key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Console → Project Settings → Auth Domain |
| `VITE_FIREBASE_PROJECT_ID` | Firebase Console → Project Settings → Project ID |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase Console → Service Accounts → Generate New Private Key (paste entire JSON as one line) |
| `SUPABASE_URL` | Supabase Dashboard → Settings → API → Project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase Dashboard → Settings → API → anon/public key |
| `SUPABASE_SECRET_KEY` | Supabase Dashboard → Settings → API → service_role key |
| `TMDB_READ_ACCESS_TOKEN` | TMDB Account → API → API Read Access Token |
| `BLOB_READ_WRITE_TOKEN` | Required only if using Vercel Blob (optional for local dev) |

### 3. Set up the Supabase database

Run the schema file against your Supabase project:

1. Open the [Supabase SQL Editor](https://supabase.com/dashboard/project/_/sql)
2. Paste the contents of [`supabase/schema.sql`](supabase/schema.sql) and run it

This creates the `ratings`, `movie_metadata`, and `profiles` tables with proper indexes.

### 4. Build the similarity matrix

The repository includes a pre-built similarity matrix ([`public/similarity_matrix.json`](public/similarity_matrix.json), ~67 MB). To rebuild it from scratch:

```bash
npm run build-matrix
```

This requires `scripts/data/links.csv` and `scripts/data/ratings.csv` from the MovieLens 25M dataset. Download them from [MovieLens](https://grouplens.org/datasets/movielens/25m/) and place the CSVs in `scripts/data/`.

### 5. Cache TMDB metadata (optional but recommended)

Populate your Supabase database with movie metadata from TMDB:

```bash
npm run refresh-metadata
```

This crawls TMDB's discover API using year-range partitioning to find as many movies as possible. The first run may take 15–30 minutes. Subsequent runs with `INCREMENTAL=true` in `.env` fetch only new movies.

### 6. Run locally

```bash
npm run dev
```

Opens at `http://localhost:5173`. The Vite dev server handles API routes locally via middleware — no separate backend required.

## Deploy to Vercel

### 1. Push to GitHub

```bash
git add .
git commit -m "Initial commit"
git push origin main
```

### 2. Import to Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your GitHub repository
3. Vercel auto-detects Vite — no framework preset changes needed
4. Under **Environment Variables**, add every variable from your `.env` (both the `VITE_*` frontend vars and the backend vars like `SUPABASE_SECRET_KEY`, `TMDB_READ_ACCESS_TOKEN`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `RECS_POPULARITY_WEIGHT`, etc.)
5. Click **Deploy**

### 3. Post-deploy

- In Firebase Console → Authentication → Settings → Authorized Domains, add your Vercel domain (`<project>.vercel.app`)
- In Supabase Dashboard → Authentication → Settings → Site URL, add your Vercel URL

### 4. Redeploy on changes

Push to `main` — Vercel redeploys automatically. No manual steps required.

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server with local API routes |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview production build locally |
| `npm run build-matrix` | Rebuild the similarity matrix from MovieLens CSVs |
| `npm run refresh-metadata` | Crawl TMDB and cache metadata in Supabase |
| `npm run lint` | Run ESLint |

## Project Structure

```
├── api/                        # Vercel serverless functions
│   ├── _lib/                   # Shared backend utilities
│   │   ├── auth.js             # Firebase token verification
│   │   ├── blob.js             # Similarity matrix loader
│   │   ├── content-recs.js     # Recommendation scoring engine
│   │   ├── movie-metadata.js   # TMDB interaction & Supabase cache
│   │   ├── profiles.js         # User profile helpers
│   │   └── supabase.js         # Supabase client factory
│   ├── home.js                 # GET /api/home — popular & top-rated
│   ├── profile-sync.js         # POST /api/profile-sync — auth sync
│   ├── ratings.js              # POST /api/ratings — save/delete rating
│   ├── recommendations.js      # GET /api/recommendations — CF + acclaim
│   ├── search-tmdb.js          # GET /api/search-tmdb — TMDB search proxy
│   └── user-ratings.js         # GET /api/user-ratings — rated movies
├── public/
│   └── similarity_matrix.json  # Pre-built Pearson correlation matrix (~67 MB)
├── scripts/
│   ├── cache-movie-metadata.js # TMDB metadata crawler
│   ├── rebuild-similarity-matrix.js  # Matrix builder (single-threaded)
│   ├── create-similarity-matrix.js   # Matrix builder (worker threads)
│   ├── similarity-worker.js    # Worker for parallel matrix build
│   ├── data/                   # MovieLens CSV source files
│   └── output/                 # Generated cache files (gitignored)
├── src/
│   ├── App.jsx                 # Main application component
│   ├── lib/
│   │   ├── api.js              # Frontend API client
│   │   ├── auth.js             # Firebase auth helpers
│   │   ├── config.js           # App configuration
│   │   ├── profileSync.js      # Profile sync client
│   │   └── ratingMap.js        # Rating value utilities
│   └── ...
├── supabase/
│   └── schema.sql              # Database schema
├── .env.example                # Environment variable template
├── vercel.json                 # Vercel deployment config
├── vite.config.js              # Vite config with local API middleware
└── package.json
```

## Recommendation Engine

The engine uses a hybrid approach:

1. **Collaborative Filtering**: A Pearson correlation similarity matrix maps every movie to its nearest neighbors. User ratings weight each neighbor's contribution.
2. **Acclaim Blend**: A configurable weight (`RECS_POPULARITY_WEIGHT`, 0–1) blends in universal acclaim — how highly rated and widely voted a movie is — using Bayesian weighted rating (`sqrt(vote_count) × vote_average`).
3. **Log-Normalization**: Scores are compressed via log-scale to avoid extreme outliers and produce meaningful percentage match values.

Tune `RECS_POPULARITY_WEIGHT` in your environment variables:
- `0` = pure collaborative filtering (no popularity bias)
- `0.35` = moderate blend (default)
- `0.75` = strong acclaim signal
- `1` = almost entirely acclaim-driven

## License

This project is for personal/educational use. MovieLens data is used under its [license terms](https://files.grouplens.org/datasets/movielens/ml-25m-README.html).
