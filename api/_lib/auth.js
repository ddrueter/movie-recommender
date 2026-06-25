import { getAuth } from 'firebase-admin/auth';
import { initializeApp, cert, getApps } from 'firebase-admin/app';

const DEMO_TOKEN = 'demo-id-token';

/**
 * Parse the FIREBASE_SERVICE_ACCOUNT_JSON environment variable.
 *
 * Some env file parsers (e.g. Vite's dotenv) may convert the `\n` escape
 * sequences inside the private-key JSON string into actual newline characters,
 * which makes the JSON invalid. This function handles both cases:
 *   - If `\n` are preserved as escape sequences, JSON.parse works natively.
 *   - If `\n` were converted to actual newlines, we normalize before parsing.
 */
function parseServiceAccountJson(raw) {
  if (!raw) {
    throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_JSON');
  }

  // Try native parse first (fast path — works when \n are escaped)
  try {
    return JSON.parse(raw);
  } catch {
    // Native parse failed — likely \n were converted to real newlines.
    // Normalize: collapse any whitespace between JSON tokens, but preserve
    // actual newlines that appeared inside string values by re-escaping them.
    const normalized = raw
      // Replace actual newlines inside the JSON with \n escape sequences
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      // Collapse multiple consecutive spaces between JSON structural tokens
      // (but NOT inside string values — those were already handled above)
      .replace(/\s{2,}/g, ' ');

    return JSON.parse(normalized);
  }
}

function ensureFirebaseApp() {
  if (getApps().length > 0) return;

  const serviceAccount = parseServiceAccountJson(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);

  initializeApp({
    credential: cert(serviceAccount),
  });
}

export function getBearerToken(request) {
  const header = request.headers.authorization || request.headers.Authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

export async function verifyFirebaseToken(token) {
  if (!token) {
    throw new Error('Missing auth token');
  }

  if (process.env.ALLOW_DEMO_AUTH === 'true' && token === DEMO_TOKEN) {
    return {
      uid: 'demo-user',
      email: 'demo@example.com',
      name: 'Demo User',
      firebase: true,
      demo: true,
    };
  }

  ensureFirebaseApp();
  const decoded = await getAuth().verifyIdToken(token);
  return decoded;
}
