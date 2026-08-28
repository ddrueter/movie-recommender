# 🐕 CineHound

> **Sniff out your next favorite film.**

CineHound is a personalized movie recommendation engine that kills choice paralysis. Rate what you've watched — like, love, or dread it — and CineHound builds a taste profile from your history, then surfaces the films you're most likely to actually adore. No endless scrolling, no decade-old "also bought" lists. Just the next movie worth your Friday night.

**Live demo:** coming soon · **Stack:** React 19 · Vite · Supabase · Firebase · TMDB

---

## ✨ Why CineHound

Most recommendation apps drown you in a wall of posters sorted by "popularity" — which is just *everyone's* taste, not yours. CineHound is different. It's built around a **real collaborative filtering engine** that compares your ratings against the behavior of tens of thousands of real viewers, uncovers the hidden structure in your taste, and hands you a short list of films engineered to match.

The moment you land, three sections — **Trending Now**, **Popular**, and **Most Acclaimed** — give you an instantly meaningful browse of what the world is watching. The magic, though, starts the second you start rating.

### Core features

- **Personalized recommendations that sharpen as you rate** — collaborative filtering maps your taste to nearby films. Every Like or Love you log sharpens the signal; every Dislike teaches the hound to steer clear.
- **Real, live trending** — pulled from TMDB's *right now* weekly trending feed, enriched with full metadata (posters, cast, directors, genre) from our edge cache.
- **Popular & Most Acclaimed** — what's hyped and what's genuinely great, ranked with a Bayesian-inspired weighted score (`√vote_count × vote_average`) so cult gems aren't drowned out by blockbusters.
- **Whole-catalog search** — search the entire TMDB universe, sorted by how well each result matches your query, with one-click rating right from the results grid.
- **Two ways to recommend** — a ranked **Match Grid** of your top `% match` picks, or a **Spotlight** mode that hands you *one* star-of-the-moment ("Show me another" for a fresh pick, never repeated).
- **Your Scent Trail** — a living history of every film you've rated, annotated with your personal rating at a glance.
- **Adaptive, no-clutter UI** — measures your screen and renders exactly the right number of columns, collapses to *real* full-page grids on demand, and ships light & dark themes.
- **One-click detail** — click any card to open its TMDB page in a new tab. No digging.

---

## 🧠 How the recommendation engine works

CineHound uses a **hybrid signal**, fusing your personal viewing fingerprint with community consensus:

**1. Collaborative filtering (the core).**
A pre-built **movie similarity matrix** maps every film to its nearest neighbors. The matrix ships pre-built from the **MovieLens 25M dataset** — 25 million real ratings from 162,000 viewers — joined to **TMDB IDs**. Predictions work *out of the box*, no user history required to kick-start the engine.

**2. Acclaim blending.**
A configurable weight blends in universal acclaim — `√vote_count × vote_average` measures how many people loved a film *and* how much — so overlooked gems earn a fair shot alongside guaranteed hits.

**3. Log-normal scoring.**
Raw signals are log-compressed onto a clean 0–100 scale, producing a meaningful **"% Match"** on every card without wild outliers. A Bayesian-informed ranking keeps deterministic order when you browse, and a geometric-decay sampler keeps Spotlight picks on-matching without repeating.

Under the hood the matrix is **~67MB of pre-computed Pearson correlation** loaded once and cached, with batched metadata lookups — recommendations resolve fast even against a big catalog.

---

## 🏗 Tech stack

| Layer | The goods |
|---|---|
| Frontend | **React 19 · Vite 7** |
| API | **Vercel serverless functions** (Node.js) |
| Auth | **Firebase Authentication** (email + providers) |
| Database | **Supabase Postgres** (ratings, profiles, metadata cache) |
| Recommendation engine | **Pearson correlation matrix** (MovieLens 25M → TMDB) |
| Movie metadata | **TMDB API**, cached in Supabase & served from the edge |
| CI/CD | **GitHub Actions** (rebuild matrix) → **Vercel** |

```
api/            Vercel serverless: home, recommendations, ratings, search, sync
scripts/        Metadata crawler, hot-refresh, matrix builder, seed, verifiers
src/            React app (App.jsx + lib/)
supabase/       schema + migrations
public/         static matrix (similarity_matrix.json)
.github/        CI workflow
```

---

## 🤝 Contributing

CineHound is a learning, open-architecture project happily accepting ideas, bug reports, and PRs. Open an issue to propose a feature before writing a big change. Topics we'd love help with:

- Better recommendation blending / cold-start handling.
- Watching a *rated history*, rating importers, Watchlist / "Up Next".
- Performance on the 67MB similarity matrix (streaming, compressed, incremental).

### Local development (quickstart)

```bash
git clone https://github.com/ddrueter/movie-recommender.git
cd movie-recommender
npm install
cp .env.example .env   # add your keys
npm run seed            # optional: fetch a starter metadata cache
npm run dev             # http://localhost:5173
```

See `.env.example` for every env var. `npm run build-matrix` rebuilds the similarity matrix from `scripts/data/ratings.csv` + `links.csv` (MovieLens 25M); `.github/workflows/rebuild-matrix.yml` pipelines an automated rebuild and uploads the matrix as a build artifact.

---

## 📜 License & attribution

Personal / educational use. MovieLens data under its [license terms](https://files.grouplens.org/datasets/movielens/ml-25m-README.html). Movie metadata & imagery courtesy of [The Movie Database](https://www.themoviedb.org/).