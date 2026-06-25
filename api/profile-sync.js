import { getBearerToken, verifyFirebaseToken } from './_lib/auth.js';
import { createSupabaseClient } from './_lib/supabase.js';

async function parseJsonBody(request) {
  return new Promise((resolve, reject) => {
    let raw = '';

    request.on('data', (chunk) => {
      raw += chunk;
    });

    request.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });

    request.on('error', reject);
  });
}

function buildProviderData(decoded, body = {}) {
  const firebaseData = decoded.firebase && typeof decoded.firebase === 'object' ? decoded.firebase : {};

  return {
    providerId: body.providerId || decoded.providerId || firebaseData.sign_in_provider || '',
    email: body.email || decoded.email || '',
    displayName: body.displayName || body.label || decoded.name || decoded.email || decoded.uid || '',
    picture: body.picture || decoded.picture || '',
    firebase: Boolean(decoded.firebase),
    demo: Boolean(decoded.demo),
    claims: {
      ...firebaseData,
      uid: decoded.uid,
      email: decoded.email || body.email || '',
      name: decoded.name || body.displayName || body.label || '',
      providerId: body.providerId || decoded.providerId || firebaseData.sign_in_provider || '',
    },
    lastSyncedAt: new Date().toISOString(),
  };
}

export default async function handler(request, response) {
  console.info('[profile-sync] incoming request', {
    method: request.method,
    url: request.url,
  });

  if (request.method !== 'POST') {
    console.warn('[profile-sync] rejected non-POST request');
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let decoded;
  try {
    decoded = await verifyFirebaseToken(getBearerToken(request));
  } catch (error) {
    console.warn('[profile-sync] auth rejected', { error: error.message });
    response.status(401).json({ error: error.message });
    return;
  }

  let body = {};
  try {
    body = await parseJsonBody(request);
  } catch (error) {
    console.error('[profile-sync] invalid request body', { error: error.message });
    response.status(400).json({ error: 'Invalid JSON' });
    return;
  }

  const authUid = String(decoded.uid || body.uid || '').trim();
  if (!authUid) {
    response.status(400).json({ error: 'Missing auth uid' });
    return;
  }

  const now = new Date().toISOString();
  const supabase = createSupabaseClient();
  const profile = {
    auth_uid: authUid,
    email: body.email || decoded.email || null,
    display_name: body.displayName || body.label || decoded.name || decoded.email || decoded.uid || null,
    provider_data: buildProviderData(decoded, body),
    updated_at: now,
  };

  console.info('[profile-sync] writing to Supabase', {
    authUid: profile.auth_uid,
    hasEmail: Boolean(profile.email),
    displayName: profile.display_name,
  });

  const { data, error } = await supabase
    .from('profiles')
    .upsert([profile], { onConflict: 'auth_uid' })
    .select();

  if (error) {
    console.error('[profile-sync] Supabase write failed', { error: error.message });
    response.status(500).json({ error: 'Failed to sync profile', details: error.message });
    return;
  }

  console.info('[profile-sync] write succeeded', { savedCount: data?.length ?? 0 });
  response.status(200).json({ ok: true, profile: data?.[0] ?? profile });
}
