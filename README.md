# Smart Identity — campus events, roles and admin dashboard

Mammu's half of the University Smart Identity project.

This repository owns the campus operations layer: **who did what, to which
student, where, when, and what was the result**. It does not own credentials,
QR codes, cryptography, books or email. Those belong to Saif and Tabish.

It runs against the **team's existing Supabase database**, which already holds
the identity and library schemas. Nothing here creates a second copy of
anything, and nothing here drops or renames a column somebody else owns.

---

## What this adds to the shared database

`campus_events` and `campus_locations` were already there, but `campus_events`
had no chain position, nothing filling its hash columns, no write function and
no row level security. The migrations in `supabase/migrations/` supply exactly
that and nothing more:

```
0100_campus_roles.sql              adds guard and librarian to app_role
0101_campus_event_chain.sql        seq, hash function, sealing trigger, append-only trigger
0102_campus_session_helpers.sql    current_university_id, current_user_role, postings
0103_record_campus_event.sql       the single write path, with role permissions
0104_campus_event_integrity.sql    chain and per-record verification
0105_campus_row_level_security.sql policies for the two tables this side owns
0106_shared_person_columns.sql     fills people.student_id and people.department
0107_gate_lookups.sql              narrow reads a guard is allowed to make
0108_current_staff_session.sql     the whole session in one round trip
supabase/tests/campus_events_test.sql   run once to prove it works

`RUN_2_paste_this.sql` bundles 0101 to 0104 and `RUN_3_paste_this.sql` bundles
0106 to 0108, for pasting straight into the Supabase SQL editor. Run 3 is safe
to run more than once.
```

Read the header of 0105 before applying it. It closes anonymous read access to
`campus_events` and stops direct client inserts, which is the point, but any
code writing to that table from a client session has to move to
`record_campus_event()` first.

### Where the schema differs from the handoff

The handoff sketches table shapes that the live database does not use. The code
follows the database, not the sketch:

| Handoff | Live database |
|---|---|
| `people.person_code` | `people.student_id` |
| `people.department_id` | `people.department`, a text name |
| `app_users.full_name` | `app_users.display_name` |
| `universities.name` | `universities.legal_name` |
| enum `campus_event_type` | `campus_events.event_type` is text |

`app_users` carries **both** `id` and `auth_user_id`, and both must hold the
login id. Policies inherited from the identity subsystem match `id` against
`auth.uid()`; the helpers added here match `auth_user_id`. A row where the two
differ signs in successfully and can then read nothing at all.

A posting is a role grant with a location: `user_roles.location_id`, added by
0102. The pre-existing `scope_type` and `scope_id` are left alone, because
widening somebody else's CHECK constraint by guesswork risks dropping a value
this side cannot see.

### The student number and department

`people.student_id` and `people.department` existed and were NULL for all 150
students, while the real values sat in `enrolments.student_number` and
`departments.name`. Both the library app and this one search the empty columns,
so both found nothing.

Migration 0106 makes those two columns a **maintained projection**: a backfill
that overwrites nothing, plus triggers on `people` and `enrolments` that keep
them current. The enrolment stays canonical. Nothing should write to
`people.student_id` directly.

The reads in `src/lib/students.ts` take the projected column when it has a value
and fall back to the joined enrolment when it does not, so the dashboard is
correct both before that migration is applied and after.

---

## Running it

Requires Node 24.

```bash
npm install
cp .env.example .env.local     # then fill it in
npm run dev
```

Apply the migrations in order, run `supabase/tests/campus_events_test.sql`,
then give the demo staff a way to sign in:

```bash
npm run seed:staff
npm run key:generate           # only if no signing key is set yet
```

That links logins onto the staff rows that already exist rather than creating
duplicates, and only ever adds role grants:

| Email | Role | Posted to |
|---|---|---|
| admin@demo.gbpuat.test | University Admin | — |
| amit@demo.gbpuat.test | Guard | Main Gate |
| neha@demo.gbpuat.test | Librarian | Central Library |

### Checks

```bash
npm test         # unit tests, including the migrations
npm run lint
npm run typecheck
npm run build
```

`src/lib/__tests__/migrations.test.ts` runs 0106, 0107 and 0108 against a real
Postgres, in process, using PGlite. It exists because 0106 first shipped with
an `UPDATE ... FROM person_projection(p.id)`, which Postgres rejects outright:
the target of an UPDATE cannot be referenced by a function in its FROM clause.
Reading the SQL did not catch that and executing it did. Any migration this
repository owns should be added to that file before it is pasted anywhere.

---

## Handoffs to the other two repositories

Both are in `docs/`, and both contain changes the other developer has to make:

- [`HANDOFF_FOR_SAIF.md`](docs/HANDOFF_FOR_SAIF.md) — the key rotation, the
  one-line fix it needs in his issuer, and two bugs in his verification
  service that would write a credential id into a person column.
- [`HANDOFF_FOR_TABISH.md`](docs/HANDOFF_FOR_TABISH.md) — why his student
  lookup found nobody, and how to move his event writes onto
  `record_campus_event` before row level security stops them.

---

## The two seams

### Credential verification, owned by Saif

`src/lib/verification/contract.ts` holds the agreed shape of a result. Nothing
outside that folder knows how verification works.

```ts
type VerificationResult = {
  verified: boolean;
  personId: string | null;      // people.id
  credentialId: string | null;
  status: 'VALID' | 'REVOKED' | 'EXPIRED' | 'UNKNOWN';
  verificationResult: 'VALID' | 'INVALID' | 'REVOKED' | 'EXPIRED' | 'UNVERIFIABLE';
  verifiedAt: string;
  reason: string;               // shown to the operator, so plain English
  provider: string;             // recorded in the event
  signatureChecked: boolean;    // false means no cryptography happened
};
```

`src/lib/verification/verify.ts` chooses how to read a scan:

- **A compact JWS**, which is what a card's QR code contains. The signature is
  checked against the published issuer keys, the issuer and expiry are checked,
  and `credential_status` is read live so a blocked card fails. The
  cryptography is Saif's, ported unchanged into `src/lib/crypto`.
- **A student number typed by hand**, which only proves the number is on the
  register. It checks no signature, the console shows a standing warning, and
  every event it produces stores `signature_checked: false`. Set
  `ALLOW_PRINTED_NUMBER_SCAN=false` to require a signature.

A key set that cannot be read comes back `UNVERIFIABLE`, which records nothing.
That is our failure, not the student's.

### Issuing a card

`/admin/students/<id>` signs an Ed25519 credential, writes `cards`,
`credentials`, `credential_status` and `credential_events`, and records a
`CARD_ISSUED` campus event. The printable CR80 card is at
`/admin/cards/<credentialId>`, where it can also be blocked or reinstated.

The credential profile, codec, QR budget and issuance steps are a port of the
verification dashboard's own, kept identical on purpose: a card issued by
either application has to be indistinguishable from one issued by the other.
`src/lib/__tests__/credential.test.ts` and `signing.test.ts` pin claim order,
the size budget and the sign-then-verify loop.

The signing key comes from `DEMO_SIGNING_KEY_KID` and
`DEMO_SIGNING_KEY_PRIVATE_JWK`. `npm run key:generate` creates one, marks the
previously active key `rotated` rather than `revoked` so existing cards keep
verifying, and prints the private half once.

### Books and notifications, owned by Tabish

Import `recordCampusEvent` from `src/lib/events.ts`. Do not create another
activity table, and do not insert into `campus_events` directly.

```ts
await recordCampusEvent({
  eventType: 'BOOK_ISSUED',
  result: 'SUCCESS',
  personId: student.id,
  locationId: library.id,
  entityType: 'book',
  entityId: book.id,
  metadata: { title: book.title, due_date: dueDate },
});
```

For the email that follows, pass `systemActor: true`. Only `LIBRARY_ENTRY` and
`NOTIFICATION_SENT` accept it, and the database rejects it for anything else:

```ts
await recordCampusEvent({
  eventType: 'NOTIFICATION_SENT',
  result: 'SENT',            // only once the provider confirms delivery
  personId: student.id,
  metadata: { channel: 'email' },
  systemActor: true,
});
```

The call throws if the signed-in role may not record that event type, or if the
student or location belongs to another university.

---

## Why it is fast, and what made it slow

The database holds 150 students, 20 books and a handful of events. Nothing here
is slow because of how much data there is. It was slow because of how many
times each page talked to Supabase.

Measured against this project from a laptop in India:

| | |
|---|---|
| one trivial one-row query | 303 ms |
| the 150-student list with its nested joins | 463 ms |
| `auth.getUser()` | 381 ms |

A 150-row query costs barely more than a one-row query. The time is the round
trip, not the work. So the way to make a screen quick is to make fewer calls.

**The Vercel region is the largest single factor.** The Supabase database runs
in AWS `ap-north-east-1`, Tokyo. Vercel puts functions in `iad1`, Washington
DC, unless told otherwise, so every query crossed the Pacific and back.
`vercel.json` now pins `hnd1`, Tokyo, which puts the functions in the same AWS
region as the database. If the database is ever moved, move this with it:

| Supabase region | Vercel region |
|---|---|
| ap-northeast-1 Tokyo | `hnd1` |
| ap-south-1 Mumbai | `bom1` |
| us-east-1 Virginia | `iad1` |
| eu-west-1 Ireland | `dub1` |

**The middleware no longer calls the network.** It used to call
`auth.getUser()` on every request, including every prefetch Next fires for
every link in the sidebar. It now reads the session cookie's own expiry
locally and only reaches Supabase when the token is genuinely close to
expiring. The signature is not checked there and nothing rests on it: the
middleware decides a redirect, and row level security decides everything else.

**The session is one call instead of three.** `current_staff_session()`,
migration 0108, returns the staff row, the tenant, the role and the posting
together, resolved from `auth.uid()` inside the database. PostgREST has already
verified that token's signature, so a separate `getUser()` establishes nothing.

```
session, before   2 round trips   881 ms
session, after    1 round trip    258 ms
```

`src/lib/session.ts` keeps the old path as a fallback, used once and then
remembered, so a deployment running ahead of its database still signs people in
rather than locking everyone out.

**Every route has a `loading.tsx`,** which Next prefetches per sidebar link, so
a tab change paints the shape of the next screen immediately. Slow halves of
pages sit behind their own Suspense boundary, so the counters on the dashboard
do not wait for the activity list.

---

## How the event log resists tampering

Every row stores the hash of the row before it. The hash is computed by a
`BEFORE INSERT` trigger, so an application cannot choose it, and an advisory
lock per university stops two writers claiming the same position. Because the
trigger sits on the table rather than in application code, rows written by any
other subsystem are chained too.

Three separate things keep history intact:

1. No insert, update or delete policy exists on `campus_events`, and those
   privileges are revoked from `authenticated`.
2. A trigger raises on any update or delete, which also stops the table owner
   and any `SECURITY DEFINER` function.
3. The supported way in is `record_campus_event()`, which takes the actor and
   the university **from the session**, never from its arguments.

The Integrity page re-derives every hash on each load and reports `UNBROKEN`, or
names the first position that fails.

### On the blockchain line

There is no blockchain, so the event detail page says `NOT YET ANCHORED` and
shows no transaction identifier. The hash chain above is real and verifiable.
Claiming more than that is the one thing the handoff rules out. Anchoring a
Merkle root of these hashes is future work.

---

## Decisions worth knowing about

- **A machine is not a person.** A library turnstile and a mailer have no human
  actor, so those events are attributed to the system and the session that drove
  the machine is kept in `metadata.system_operator_id`. A book issued by Neha
  still shows Neha.
- **An unverifiable scan records nothing.** Recording a rejection would blame
  the student for a fault on our side.
- **Locations are never deleted**, only deactivated, because history points at
  them.
- **Guards see only their own scans.** Administrators see the whole campus.
- **Dates are assembled by hand** in `src/lib/format.ts`. Intl month
  abbreviations change between Node versions, and the trail, the printed formats
  and the emails all have to agree.
- **Cards and credentials are read, never written.** Issuing and revoking belong
  to the identity subsystem; the student profile only reports what it finds.
