/** The signed-in owner's ID token. Loaded lazily so callers stay importable without Firebase. */
export async function ownerToken(): Promise<string | undefined> {
    const { firebaseAuth } = await import('@/lib/auth/firebase');
    return firebaseAuth.currentUser?.getIdToken();
}
