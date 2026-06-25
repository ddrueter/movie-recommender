import { createClient } from '@supabase/supabase-js';

let supabaseClient;

function normalizeSupabaseUrl(rawUrl) {
  if (!rawUrl) return '';

  const trimmedUrl = rawUrl.trim().replace(/\/+$/, '');
  const restV1Suffix = '/rest/v1';

  if (trimmedUrl.endsWith(restV1Suffix)) {
    console.warn('[supabase] SUPABASE_URL should point to the project root, not /rest/v1. Normalizing value.');
    return trimmedUrl.slice(0, -restV1Suffix.length);
  }

  return trimmedUrl;
}

export function createSupabaseClient() {
  if (supabaseClient) return supabaseClient;

  const rawUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const url = normalizeSupabaseUrl(rawUrl);

  console.info('[supabase] creating client', {
    hasRawUrl: Boolean(rawUrl),
    normalizedUrl: url || '(missing)',
    hasSecretKey: Boolean(secretKey),
  });

  if (!url || !secretKey) {
    throw new Error('Missing Supabase environment variables');
  }

  supabaseClient = createClient(url, secretKey, {
    auth: { persistSession: false },
  });

  return supabaseClient;
}
