import { getBearerToken, verifyFirebaseToken } from './_lib/auth.js';
import { createSupabaseClient } from './_lib/supabase.js';

export default async function handler(request, response) {
  console.info('[ratings] incoming request', {
    method: request.method,
    url: request.url,
  });

  if (request.method !== 'POST') {
    console.warn('[ratings] rejected non-POST request');
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    await verifyFirebaseToken(getBearerToken(request));
  } catch (error) {
    console.warn('[ratings] auth rejected', { error: error.message });
    response.status(401).json({ error: error.message });
    return;
  }

  let body = {};
  try {
    body = await new Promise((resolve, reject) => {
      let raw = '';
      request.on('data', (chunk) => {
        raw += chunk;
      });
      request.on('end', () => {
        resolve(raw ? JSON.parse(raw) : {});
      });
      request.on('error', reject);
    });
  } catch (error) {
    console.error('[ratings] invalid request body', { error: error.message });
    response.status(400).json({ error: 'Invalid JSON' });
    return;
  }

  console.info('[ratings] parsed body', {
    hasUserId: Boolean(body.userId),
    hasTmdbId: Boolean(body.tmdbId),
    ratingType: typeof body.rating,
  });

  if (!body.userId || !body.tmdbId) {
    response.status(400).json({ error: 'Missing required rating fields' });
    return;
  }

  const supabase = createSupabaseClient();

  // If rating is null, delete the rating row
  if (body.rating === null) {
    console.info('[ratings] deleting rating', {
      userId: body.userId,
      tmdbId: body.tmdbId,
    });

    const { error } = await supabase
      .from('ratings')
      .delete()
      .eq('user_id', body.userId)
      .eq('tmdb_id', body.tmdbId);

    if (error) {
      console.error('[ratings] Supabase delete failed', { error: error.message });
      response.status(500).json({ error: 'Failed to delete rating', details: error.message });
      return;
    }

    console.info('[ratings] delete succeeded');
    response.status(200).json({ ok: true, deleted: true });
    return;
  }

  if (typeof body.rating !== 'number') {
    response.status(400).json({ error: 'Missing required rating fields' });
    return;
  }

  console.info('[ratings] writing to Supabase', {
    userId: body.userId,
    tmdbId: body.tmdbId,
    rating: body.rating,
  });

  const { data, error } = await supabase.from('ratings').upsert([
    {
      user_id: body.userId,
      tmdb_id: body.tmdbId,
      rating: body.rating,
      created_at: new Date().toISOString(),
    },
  ], { onConflict: 'user_id,tmdb_id' }).select();

  if (error) {
    console.error('[ratings] Supabase write failed', { error: error.message });
    response.status(500).json({ error: 'Failed to save rating', details: error.message });
    return;
  }

  console.info('[ratings] write succeeded', { savedCount: data?.length ?? 0 });
  response.status(200).json({ ok: true, saved: data?.[0] ?? null });
}
