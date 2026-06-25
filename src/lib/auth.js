import { appConfig } from './config.js';

let authModulePromise;
let appModulePromise;
let authInstance;

async function loadFirebaseModules() {
  if (!appModulePromise) {
    appModulePromise = import('firebase/app');
  }
  if (!authModulePromise) {
    authModulePromise = import('firebase/auth');
  }

  const [{ initializeApp, getApps }, authModule] = await Promise.all([appModulePromise, authModulePromise]);
  return { initializeApp, getApps, authModule };
}

async function getFirebaseAuth() {
  if (authInstance) return authInstance;

  const { initializeApp, getApps, authModule } = await loadFirebaseModules();
  const app = getApps().length
    ? getApps()[0]
    : initializeApp({
        apiKey: appConfig.firebase.apiKey,
        authDomain: appConfig.firebase.authDomain,
        projectId: appConfig.firebase.projectId,
      });

  authInstance = authModule.getAuth(app);
  return authInstance;
}

async function buildSession(user) {
  if (!user) return null;

  const token = await user.getIdToken();
  const label = user.displayName || user.email || user.uid;

  return {
    uid: user.uid,
    email: user.email || '',
    label,
    token,
    providerId: user.providerData?.[0]?.providerId || '',
  };
}

async function syncProfile(session, extra = {}) {
  if (!session?.token || !session?.uid) return null;

  const { syncProfile: syncProfileRequest } = await import('./api.js');
  return syncProfileRequest({
    authToken: session.token,
    userId: session.uid,
    email: session.email,
    displayName: session.label,
    providerId: session.providerId,
    ...extra,
  });
}

export function getAuthHeader(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function getDemoSession() {
  const session = {
    uid: 'demo-user',
    email: 'demo@example.com',
    label: 'Demo User',
    token: 'demo-id-token',
    providerId: 'demo',
  };

  void syncProfile(session).catch((error) => {
    console.warn('[auth] demo profile sync failed', { error: error.message });
  });

  return session;
}

export async function getDemoToken() {
  return (await getDemoSession()).token;
}

export async function getFirebaseSession() {
  const auth = await getFirebaseAuth();
  const session = await buildSession(auth.currentUser);

  if (session) {
    void syncProfile(session).catch((error) => {
      console.warn('[auth] session profile sync failed', { error: error.message });
    });
  }

  return session;
}

export async function getFirebaseUserToken() {
  const session = await getFirebaseSession();
  return session?.token ?? null;
}

export async function signInWithFirebasePopup() {
  const auth = await getFirebaseAuth();
  const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
  const result = await signInWithPopup(auth, new GoogleAuthProvider());
  const session = await buildSession(result.user);

  if (session) {
    void syncProfile(session).catch((error) => {
      console.warn('[auth] sign-in profile sync failed', { error: error.message });
    });
  }

  return session;
}

export async function signOutFirebase() {
  const auth = await getFirebaseAuth();
  const { signOut } = await import('firebase/auth');
  await signOut(auth);
}
