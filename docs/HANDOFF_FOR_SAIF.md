# Handoff to Saif — identity, QR and credential verification

From Mammu. Written 10 September 2026, after adding card issuance to the
campus dashboard (`gbpuat-smart-identity`).

Read section 1 before your next deploy. It contains one change that will make
your issuer record the wrong key against every card it signs, and one that
already breaks your student list.

---

## 1. Things that need a change on your side

### 1.1 The active signing key has rotated

The dashboard now issues cards, which means it needs a private key. Yours lives
only in your `.env.local`, so a new one was generated rather than asking you for
it.

| kid | status | who holds the private half |
|---|---|---|
| `nf-2026-01` | **rotated** | you |
| `nort-2026-09-szj6` | **active** | the campus dashboard |

Nothing was revoked and nothing was deleted. Both keys are still published at
`/.well-known/jwks.json`, and your `verify.ts` accepts any key whose status is
not `revoked` or `compromised`, so **every card you have already issued still
verifies**.

What does break is `lib/issuance/issue.ts`. Step 2 picks the key like this:

```ts
.eq('university_id', request.universityId)
.eq('status', 'active')
.limit(1)
```

That now returns `nort-2026-09-szj6`, while `EnvKeySigner.fromEnv()` still signs
with `nf-2026-01`. The card would be signed by one key and recorded in
`credentials.issuer_key_id` as having been signed by another. Verification would
still pass, because the `kid` travels in the JWS header, but the database would
be lying about which key produced which credential, which is exactly the record
an investigation depends on.

**The fix is one line.** Pin the lookup to the key you are actually signing
with:

```ts
.eq('status', 'active')
.eq('kid', signer.kid)      // add this
.limit(1)
```

Then decide which of these you want:

- **Keep issuing from your dashboard too.** Set `nf-2026-01` back to `active`.
  Two active keys is fine as long as both issuers pin on `kid` as above.
- **Stop issuing from your dashboard.** Change nothing else. Cards are issued
  from the campus dashboard, and yours stays the verifier.

There is a script on my side that does the rotation properly, if you ever need
another key: `npm run key:generate`. It marks the previous key `rotated` rather
than `revoked`, registers the new public key, and prints the private half once.

### 1.2 `verification-service.ts` returns a credential id in the `personId` field

In `lib/core/crypto/verification-service.ts`:

```ts
personId: claims?.jti,
credentialId: claims?.jti,
```

`jti` is 22 base64url characters. `people.id` is a uuid. Anything that takes
your `personId` and writes it to `campus_events.person_id` gets a
`22P02 invalid input syntax for type uuid` and the event is lost.

Resolve the person properly. There is now a function for it that works for any
signed-in role, including a guard who holds no read on `people`:

```sql
select * from resolve_credential_holder('<jti from the verified claims>');
```

It returns `person_id`, `credential_id`, `full_name`, `student_id`,
`department`, `person_status`, `credential_state`, `reason_code` and
`expires_at`, scoped to the caller's own university. It performs no
cryptography and makes no decision about validity — that stays yours.

### 1.3 The status lookup queries a uuid column with a `jti`

Same file, in `lookupStatus`:

```ts
db.from('credential_status').select('status').eq('credential_id', claims.jti)
```

`credential_status.credential_id` is a uuid and `claims.jti` never is, so that
query is always a miss. The fallback underneath it does the right thing, so
nothing is broken, but every scan pays for a query that cannot succeed. Delete
the first branch, or fold it into `resolve_credential_holder`, which returns the
status in the same round trip.

---

## 2. Things that changed in the shared database

Three migrations were added. All are additive. Nothing was dropped, renamed or
overwritten.

### 2.1 `0106_shared_person_columns.sql` — the student number and department

`people.student_id` and `people.department` existed and were **NULL for all 150
students**. Tabish's library searches on exactly those two columns, so his
student lookup found nobody, and my student list showed a column of dashes.

The canonical values were, and still are, `enrolments.student_number` and
`departments.name`. Those two `people` columns are now a **maintained
projection** of them:

- a one-off backfill filled every gap, overwriting nothing that already had a
  value;
- a trigger on `people` fills them on insert;
- a trigger on `enrolments` updates them when a student number or department
  changes.

Your `issue.ts` already reads the canonical tables. **Keep doing that.** The
projection exists so that Tabish's queries work, not to replace the enrolment.

### 2.2 `0107_gate_lookups.sql` — three narrow read functions

Row level security on `people`, `cards`, `credentials` and `issuer_keys` lists
the administrative roles. `guard` and `librarian` are on none of them, which is
correct: a guard has no business reading 150 student records. But a guard does
need the name on the card in front of them.

Three `SECURITY DEFINER` functions, each scoped to the caller's university:

| function | returns | needs |
|---|---|---|
| `resolve_credential_holder(jti)` | the person and credential state behind one credential | a `jti` you already hold |
| `resolve_person_by_code(code)` | the person behind one student number | a number you already hold |
| `published_issuer_keys()` | the same rows your JWKS route serves | nothing |

None can be used to enumerate anybody. `published_issuer_keys()` exists because
a public key is public by definition and a guard's console has to resolve a
`kid` offline.

### 2.3 `0100`–`0105` — the campus event system

Already applied. The one thing that affects you: **`campus_events` has no
insert policy.** Writes go through `record_campus_event(...)`, which is
`SECURITY DEFINER`, takes the actor and the university from the session, and
seals the hash chain. A direct insert from a client session is refused.

---

## 3. The contract between us, restated

Unchanged from the handoff, and now actually implemented on both sides:

```
Saif      QR decode, signature check, issuer check, expiry, revocation
              ↓
          a verification result
              ↓
Mammu     record_campus_event(...)
```

My side consumes exactly this shape (`src/lib/verification/contract.ts`):

```ts
{
  verified: boolean
  personId: string | null        // people.id, a uuid
  credentialId: string | null    // credentials.id, a uuid
  status: 'VALID' | 'REVOKED' | 'EXPIRED' | 'UNKNOWN'
  verificationResult: 'VALID' | 'INVALID' | 'REVOKED' | 'EXPIRED' | 'UNVERIFIABLE'
  verifiedAt: string             // ISO 8601
  reason: string                 // shown to the operator, so plain English
  provider: string               // recorded in the event metadata
  signatureChecked: boolean      // false whenever no signature was checked
}
```

Two rules that matter more than they look:

**`UNVERIFIABLE` records nothing.** It means the check could not be made — keys
unreachable, service down. Writing a rejection would blame a student for a
failure on our side. `INVALID` means the check was made and failed.

**`signatureChecked: false` is carried into the event metadata.** A scan decided
without cryptography is stored saying so, for ever. Nothing in the demo claims a
signature was checked when it was not.

---

## 4. Revocation now has its working write path

The handoff listed this as missing. It is done, on my side, writing to your
tables in the shape your `revoke.ts` already defines:

1. `credential_status` is upserted with the new status, reason and actor.
2. A row is appended to `credential_events` (`revoked` / `suspended` /
   `reinstated`).
3. A `CARD_BLOCKED` campus event is recorded, so the block appears on the
   student's activity trail alongside their gate scans.

The screen is `/admin/cards/<credentialId>`. Blocking there takes effect at the
next scan in **both** applications, because both read `credential_status`.

This is verified end to end: a card issued from the dashboard reads VALID at
the console, and the same card reads REVOKED once blocked, with the signature
still perfect. That distinction is the whole point of the demo, so please keep
your verifier reporting `REVOKED` as its own state rather than folding it into
`INVALID_SIGNATURE`.

---

## 5. What I copied from you, and why it must not drift

`lib/core/credential`, `lib/core/crypto`, `lib/core/qr` and `lib/issuance` are
ported into `src/lib/{credential,crypto,qr,issuance}` on my side, essentially
unchanged. A card issued by either application has to be indistinguishable from
one issued by the other: same claim order, same expiry rule, same hash, same
size budget.

Two deliberate differences, both additive:

- **`nameParts()` in `issue.ts`.** Rows created by different applications fill
  different name columns. Some have `given_name`/`family_name`, some only
  `full_name`. The port falls back to splitting `full_name` so issuance does not
  fail on a row your seed did not create.
- **`cards.status` is `issued`, not `printed`.** The dashboard's "Active Cards"
  figure counts what verifies, and a card that has been signed and handed over
  is issued. Change yours to match if you want the two counts to agree.

**If you change the credential profile, the codec, or the QR budget, tell me and
I will mirror it the same day.** If they drift, cards from one application stop
verifying in the other, and nothing in either build will warn you. There are
now tests on my side pinning claim order, the size budget and the
sign-then-verify loop (`src/lib/__tests__/credential.test.ts`,
`signing.test.ts`); please keep yours too.

---

## 6. One thing to check on your own accounts

`app_users.id` has to **be** the login id, not merely point at it.

Your policies match `app_users.id = auth.uid()`. My migrations added an
`auth_user_id` column and match on that. Both conventions are live in the same
database, so both columns must carry the same value. A row where they differ
produces an account that signs in successfully and can then read nothing at
all — no student, no card, no credential.

Every seeded account is already correct. The dashboard's "Add a staff account"
form was creating rows with a generated id and has been fixed to set both.
Worth checking anything your own scripts create.

---

## Quick reference

```
Apply the SQL             RUN_3_paste_this.sql, in the Supabase SQL editor
Public keys               GET /.well-known/jwks.json   (both apps serve it)
Issue a card              /admin/students → open a student → Issue card
Block a card              /admin/cards/<credentialId>
The trail                 /admin/students/<personId>
Rotate a key              npm run key:generate
```
