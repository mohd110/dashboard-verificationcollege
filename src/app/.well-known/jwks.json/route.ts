import { createAdminClient } from '@/lib/supabase/admin';

/**
 * The university's published signing keys.
 *
 *     GET /.well-known/jwks.json
 *
 * A verifier syncs this on startup and then holds it, so checking a card needs
 * no network at all. It is deliberately public: a public key is public, and the
 * more widely it is available the harder it is for anyone to quietly substitute
 * their own.
 *
 * Every key the university has published appears here, including rotated ones,
 * because cards issued under an old key must keep verifying until they expire.
 * Revoked and compromised keys appear too, carrying their status, so a verifier
 * knows to REFUSE them rather than merely fail to find them. Silence would be
 * indistinguishable from a key it had not synced yet.
 *
 * The same endpoint is served by the verification dashboard. Both read the same
 * table, so both answer the same thing.
 */

export const revalidate = 300;

type IssuerKeyRow = {
  kid: string;
  alg: string;
  public_jwk: Record<string, unknown>;
  status: 'active' | 'rotated' | 'revoked' | 'compromised';
  not_before: string;
  not_after: string | null;
  revoked_at: string | null;
};

export async function GET() {
  let db;
  try {
    // No user is behind this request, so there is no session to act as. The
    // rows returned carry public keys only.
    db = createAdminClient();
  } catch {
    return Response.json({ error: 'not configured' }, { status: 503 });
  }

  const { data, error } = await db
    .from('issuer_keys')
    .select('kid, alg, public_jwk, status, not_before, not_after, revoked_at')
    .order('not_before', { ascending: false })
    .returns<IssuerKeyRow[]>();

  if (error) {
    return Response.json({ error: 'could not read keys' }, { status: 500 });
  }

  const keys = (data ?? []).map((row) => ({
    ...row.public_jwk,
    kid: row.kid,
    alg: row.alg,
    use: 'sig',
    // Non-standard members, namespaced so they cannot collide with JWK fields.
    // A verifier needs the status; the JWKS specification has nowhere to put it.
    'x-status': row.status,
    'x-not-before': row.not_before,
    ...(row.not_after ? { 'x-not-after': row.not_after } : {}),
    ...(row.revoked_at ? { 'x-revoked-at': row.revoked_at } : {}),
  }));

  return Response.json(
    { keys },
    {
      headers: {
        'content-type': 'application/jwk-set+json',
        'cache-control': 'public, max-age=300, stale-while-revalidate=86400',
      },
    },
  );
}
