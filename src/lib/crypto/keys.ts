import 'server-only';

import { createClient, createServiceClient } from '@/lib/supabase/server';

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
 *
 * @param anonymous read with the service role because the caller has no
 * session at all. The student pass is the one such caller: a student proves
 * who they are by presenting a signed card, which cannot be checked without
 * first holding the key that signed it. Nothing private is exposed either way
 * — these are public keys, already served at /.well-known/jwks.json.
 */
export async function loadIssuerKeys(anonymous = false): Promise<PublicKeyRecord[]> {
  const now = Date.now();
  if (cached && now - cached.fetchedAt < CACHE_MILLISECONDS) return cached.keys;

  // published_issuer_keys() filters on current_university_id(), which is null
  // when there is no signed-in user. Called with the service role it therefore
  // succeeds and returns nothing, which reads downstream as "signed by a key
  // this university does not publish" — a confusing way to say "we could not
  // look". An anonymous caller reads the table instead, which the service role
  // may do and which needs no session to scope it.
  if (anonymous) {
    const service = await createServiceClient();
    const { data: keyRows, error: keyError } = await service
      .from('issuer_keys')
      .select('kid, alg, public_jwk, status, not_before, not_after')
      .order('not_before', { ascending: false });

    if (keyError) {
      if (cached) return cached.keys;
      throw new Error(`The signing keys could not be read: ${keyError.message}`);
    }

    const anonKeys = ((keyRows ?? []) as KeyRow[]).map(toRecord);
    if (anonKeys.length === 0) return cached?.keys ?? anonKeys;

    cached = { keys: anonKeys, fetchedAt: now };
    return anonKeys;
  }

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

  // An empty set is never cached. A read that comes back with no keys refuses
  // every card on campus, and caching that would keep refusing them for five
  // minutes after whatever caused it had been fixed. Falling back to a stale
  // set, or to reading again on the next scan, is the safer failure.
  if (keys.length === 0) return cached?.keys ?? keys;

  cached = { keys, fetchedAt: now };
  return keys;
}

export async function issuerKeyResolver(anonymous = false): Promise<IssuerKeyResolver> {
  return new StaticKeyResolver(await loadIssuerKeys(anonymous));
}

/** Drops the cache, so a freshly rotated key is used on the very next scan. */
export function forgetIssuerKeys(): void {
  cached = null;
}
