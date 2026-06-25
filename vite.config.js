import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const apiRouteLoaders = {
  '/api/search-tmdb': () => import('./api/search-tmdb.js'),
  '/api/ratings': () => import('./api/ratings.js'),
  '/api/recommendations': () => import('./api/recommendations.js'),
  '/api/profile-sync': () => import('./api/profile-sync.js'),
  '/api/home': () => import('./api/home.js'),
  '/api/user-ratings': () => import('./api/user-ratings.js'),
};

function createJsonResponse(response) {
  return {
    status(code) {
      response.statusCode = code;
      return this;
    },
    json(payload) {
      if (!response.headersSent) {
        response.setHeader('Content-Type', 'application/json');
      }
      response.end(JSON.stringify(payload));
      return this;
    },
    send(payload) {
      if (typeof payload === 'object') {
        return this.json(payload);
      }
      response.end(String(payload));
      return this;
    },
  };
}

function loadBackendEnv(mode) {
  const env = loadEnv(mode, process.cwd(), '');
  const backendKeys = [
    'FIREBASE_SERVICE_ACCOUNT_JSON',
    'SUPABASE_URL',
    'SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_SECRET_KEY',
    'TMDB_READ_ACCESS_TOKEN',
    'BLOB_READ_WRITE_TOKEN',
    'RECS_POPULARITY_WEIGHT',
  ];

  for (const key of backendKeys) {
    if (env[key] !== undefined && process.env[key] === undefined) {
      process.env[key] = env[key];
    }
  }

  process.env.ALLOW_DEMO_AUTH = 'true';
  console.info('[vite] loaded backend env for local dev', {
    hasTmdbReadAccessToken: Boolean(process.env.TMDB_READ_ACCESS_TOKEN),
  });
}

function localApiRoutesPlugin() {
  return {
    name: 'local-api-routes',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url) {
          next();
          return;
        }

        const url = new URL(req.url, `http://${req.headers.host}`);
        const loader = apiRouteLoaders[url.pathname];

        if (!loader) {
          next();
          return;
        }

        try {
          const module = await loader();
          await module.default(req, createJsonResponse(res));
        } catch (error) {
          console.error(`[local-api-routes] ${url.pathname}`, error);

          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
          }

          if (!res.writableEnded) {
            res.end(JSON.stringify({
              error: error.message,
              details: error.stack,
            }));
          }
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  if (command === 'serve') {
    loadBackendEnv(mode);
  }

  return {
    plugins: [react(), localApiRoutesPlugin()],
  };
});
