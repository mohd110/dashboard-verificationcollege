/**
 * Generates the Ed25519 key this dashboard signs cards with.
 *
 *   npm run key:generate
 *
 * What it does, in order:
 *
 *   1. Makes a fresh Ed25519 keypair.
 *   2. Marks every currently active key for this university as `rotated`.
 *      Rotated keys stay published in the JWKS, so every card already issued
 *      keeps verifying. Nothing is revoked and nothing is deleted.
 *   3. Registers the new public key as `active`.
 *   4. Prints the two lines to paste into .env.local.
 *
 * The private half is printed once and never stored in the database. If it is
 * lost, run this again: a new key is issued and old cards keep working.
 *
 * PROTOTYPE ONLY. A key in an environment variable is readable by anyone with
 * dashboard access. That is acceptable for fabricated demo students and
 * unacceptable the moment a real one is issued a card, because whoever holds
 * this key can mint unlimited perfect university IDs. The replacement is a KMS
 * behind the same CredentialSigner interface.
 */

import { createClient } from '@supabase/supabase-js';
import { exportJWK, generateKeyPair } from 'jose';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const universityCode = process.env.DEMO_UNIVERSITY_CODE ?? 'northfield';

if (!url || !serviceRoleKey) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.');
  process.exit(1);
}

const db = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: university, error: universityError } = await db
  .from('universities')
  .select('id, code, legal_name')
  .eq('code', universityCode)
  .maybeSingle();

if (universityError || !university) {
  console.error(`No university with code "${universityCode}".`);
  process.exit(1);
}

const { privateKey, publicKey } = await generateKeyPair('EdDSA', {
  crv: 'Ed25519',
  extractable: true,
});

const privateJwk = await exportJWK(privateKey);
const publicJwk = await exportJWK(publicKey);
delete publicJwk.d;

const year = new Date().getUTCFullYear();
const month = String(new Date().getUTCMonth() + 1).padStart(2, '0');
const suffix = Math.random().toString(36).slice(2, 6);
const kid = `${university.code.slice(0, 4)}-${year}-${month}-${suffix}`;

// Rotate rather than revoke. A revoked key makes every card it signed fail;
// a rotated one keeps them all working and simply stops being used for new
// credentials.
const { data: rotated, error: rotateError } = await db
  .from('issuer_keys')
  .update({ status: 'rotated' })
  .eq('university_id', university.id)
  .eq('status', 'active')
  .select('kid');

if (rotateError) {
  console.error(`Could not rotate the existing keys: ${rotateError.message}`);
  process.exit(1);
}

const { error: insertError } = await db.from('issuer_keys').insert({
  university_id: university.id,
  kid,
  alg: 'EdDSA',
  public_jwk: publicJwk,
  private_key_ref: 'env:DEMO_SIGNING_KEY_PRIVATE_JWK',
  status: 'active',
  not_before: new Date().toISOString(),
});

if (insertError) {
  console.error(`Could not register the new key: ${insertError.message}`);
  process.exit(1);
}

console.log(`\nUniversity   ${university.legal_name}`);
if (rotated?.length) {
  console.log(`Rotated      ${rotated.map((row) => row.kid).join(', ')}`);
  console.log('             Cards signed by these keys still verify.');
}
console.log(`New key      ${kid} (EdDSA, active)\n`);
console.log('Add these two lines to .env.local, then restart the dev server:\n');
console.log(`DEMO_SIGNING_KEY_KID=${kid}`);
console.log(`DEMO_SIGNING_KEY_PRIVATE_JWK=${JSON.stringify(privateJwk)}\n`);
console.log('The private key is printed once and is not stored anywhere else.\n');
