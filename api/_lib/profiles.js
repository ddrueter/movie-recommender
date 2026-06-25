function getDecodedValue(decoded, keys = []) {
  for (const key of keys) {
    const value = decoded?.[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
}

export function buildProfileRow(decoded, body = {}) {
  const firebaseData = decoded?.firebase && typeof decoded.firebase === 'object' ? decoded.firebase : {};
  const authUid = String(decoded?.uid || body.uid || '').trim();
  const email = getDecodedValue(decoded, ['email']) || getDecodedValue(body, ['email']);
  const displayName =
    getDecodedValue(body, ['displayName', 'label']) ||
    getDecodedValue(decoded, ['name', 'displayName', 'label']) ||
    email ||
    authUid;
  const providerId =
    getDecodedValue(body, ['providerId']) ||
    getDecodedValue(decoded, ['providerId']) ||
    getDecodedValue(firebaseData, ['sign_in_provider']) ||
    '';

  return {
    auth_uid: authUid,
    email: email || null,
    display_name: displayName || null,
    provider_data: {
      providerId,
      email: email || '',
      displayName: displayName || '',
      picture: getDecodedValue(body, ['picture']) || getDecodedValue(decoded, ['picture']) || '',
      firebase: Boolean(decoded?.firebase),
      demo: Boolean(decoded?.demo),
      claims: {
        ...firebaseData,
        uid: authUid,
        email,
        name: getDecodedValue(decoded, ['name']) || displayName || '',
        providerId,
      },
      lastSyncedAt: new Date().toISOString(),
    },
    updated_at: new Date().toISOString(),
  };
}

export async function upsertProfileRow(supabase, decoded, body = {}) {
  const profile = buildProfileRow(decoded, body);

  if (!profile.auth_uid) {
    throw new Error('Missing auth uid');
  }

  const { data, error } = await supabase
    .from('profiles')
    .upsert([profile], { onConflict: 'auth_uid' })
    .select();

  if (error) {
    throw error;
  }

  return data?.[0] ?? profile;
}
