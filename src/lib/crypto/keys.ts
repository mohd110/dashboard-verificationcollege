import 'server-only';

import { createClient } from '@/lib/supabase/server';

import type { IssuerKeyResolver, KeyStatus, PublicKeyRecord, SigningAlgorithm } from './signer';
import { StaticKeyResolver } from './verify';

/**
 * The university's published signing keys, as this application sees them.
 *
 * Verification is arithmetic over a key we already hold, so a gate must not
 * need a database round trip to check a card. The keys are fetched once and
 * held for a few minutes; a rotation is picked up on the next refresh, and a
 * key that has been revoked is still returned, carrying its status, so the
 * verifier refuses it rather than merely failing to find it.
 */

type KeyRow = {
  kid: string;
  alg: string;
  public_jwk: Record<string, unknown>;
  status: string;
  not_before: string;
  not_after: string | null;
};

/** How long a fetched key set is trusted before it is read again. */
const CACHE_MILLISECONDS = 5 * 60 * 1000;

let cached: { keys: PublicKeyRecord[]; fetchedAt: number } | null = null;

function toRecord(row: KeyRow): PublicKeyRecord {
  return {
    kid: row.kid,
    alg: row.alg as SigningAlgorithm,
    publicJwk: row.public_jwk as JsonWebKey,
    status: row.status as KeyStatus,
    notBefore: row.not_before,
    notAfter: row.not_after ?? undefined,
  };
}

/**
 * Read through a SECURITY DEFINER function rather than the table.
 *
 * Policy on issuer_keys lists the administrative roles, and a guard holds none
 * of them. A public key is public by definition and is already served at
 * /.well-known/jwks.json, so the function publishes the same thing to a signed
 * -in session without widening the table policy for everyone.
 */
export async function loadIssuerKeys(): Promise<PublicKeyRecord[]> {
  const now = Date.now();
  if (cached && now - cached.fetchedAt < CACHE_MILLISECONDS) return cached.keys;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('published_issuer_keys');

  let rows = (data ?? []) as KeyRow[];

  if (error) {
    // The function arrives with migration 0107. Until it is applied, an
    // administrator can still read the table directly, so the console works
    // for them and only a guard sees the gap. Falling back beats refusing
    // every card for a reason that has nothing to do with the card.
    const direct = await supabase
      .from('issuer_keys')
      .select('kid, alg, public_jwk, status, not_before, not_after')
      .order('not_before', { ascending: false });

    if (direct.error) {
      // A stale key set still verifies correctly; an empty one refuses every
      // card. Keeping what we had is the safer failure.
      if (cached) return cached.keys;
      throw new Error(`The signing keys could not be read: ${error.message}`);
    }

    rows = (direct.data ?? []) as KeyRow[];
  }

  const keys = rows.map(toRecord);
  cached = { keys, fetchedAt: now };
  return keys;
}

export async function issuerKeyResolver(): Promise<IssuerKeyResolver> {
  return new StaticKeyResolver(await loadIssuerKeys());
}

/** Drops the cache, so a freshly rotated key is used on the very next scan. */
export function forgetIssuerKeys(): void {
  cached = null;
}
