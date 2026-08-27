import { createRemoteJWKSet, jwtVerify } from 'jose';

// Firebase publishes its public signing keys here.
// jose caches them automatically and handles key rotation.
const FIREBASE_JWKS = createRemoteJWKSet(
    new URL(
        'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
    )
);

/**
 * Verifies a Firebase ID token cryptographically.
 * Checks: signature, expiry (exp), issuer (iss), and audience (aud).
 * Returns the Firebase UID (sub) on success, null on any failure.
 */
export async function verifyFirebaseToken(token: string): Promise<string | null> {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    if (!projectId) {
        console.error('[verifyFirebaseToken] NEXT_PUBLIC_FIREBASE_PROJECT_ID env var is not set');
        return null;
    }
    try {
        const { payload } = await jwtVerify(token, FIREBASE_JWKS, {
            issuer: `https://securetoken.google.com/${projectId}`,
            audience: projectId,
        });
        return typeof payload.sub === 'string' && payload.sub ? payload.sub : null;
    } catch {
        return null;
    }
}
