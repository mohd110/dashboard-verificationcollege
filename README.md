# GBPUAT Smart Identity — campus events, roles and admin dashboard

Mammu's half of the University Smart Identity project, built for Govind Ballabh
Pant University of Agriculture & Technology.

This repository owns the campus operations layer: **who did what, to which
student, where, when, and what was the result**. It does not own credentials,
QR codes, cryptography, books or email. Those belong to Saif and Tabish, and
this codebase is built to receive them rather than to imitate them.

---

## What is here

| Area | State |
|---|---|
| Campus locations, tenant scoped, with row level security | Done |
| `campus_events`, the single activity log, hash chained and append only | Done |
| `guard` and `librarian` roles, postings, role-scoped write permissions | Done |
| Scan console for a guard or librarian, recording real events | Done |
| Admin dashboard, student profiles, activity trail, verification history | Done |
| Location and staff management, integrity verification | Done |
| Credential verification: signing, QR, revocation | **Saif's, not built here** |
| Books, transactions, email, notifications | **Tabish's, not built here** |
| Blockchain anchoring | Deliberately not built. See below. |

---

## Running it

Requires Node 24 and a Supabase project.

```bash
npm install
cp .env.example .env.local     # then fill it in
npm run dev
```

### Database

Saif applies the schema. The files are in `supabase/`, numbered in the order
they must run:

```
supabase/migrations/0001_core_prerequisites.sql      universities, departments, people, enrolments
supabase/migrations/0002_app_roles.sql               the app_role enum, plus guard and librarian
supabase/migrations/0003_app_users_and_sessions.sql  staff accounts and session helpers
supabase/migrations/0004_campus_locations.sql        gates, libraries, offices
supabase/migrations/0005_campus_events.sql           the activity log, hash chain and write function
supabase/migrations/0006_event_integrity.sql         chain verification functions
supabase/migrations/0007_row_level_security.sql      policies for every table
supabase/seed.sql                                    fabricated demo data
supabase/tests/campus_events_test.sql                run once to prove the above works
```

Two notes for whoever applies them:

- **0001 is a stand-in.** The handoff lists those four tables as already
  existing. Every statement is `if not exists`, so running it against a database
  that already has them changes nothing. If the live column names differ,
  reconcile them there before 0002 runs.
- **0002 is on its own for a reason.** PostgreSQL will not let a transaction use
  an enum value it added, and Supabase runs one transaction per file, so
  everything that reads `'guard'` has to live in a later file.

Then create the demo logins, which need rows in `auth.users` and so cannot come
from plain SQL:

```bash
npm run seed:staff
```

That creates three accounts, all signing in with `DEMO_STAFF_PASSWORD`:

| Email | Role | Posted to |
|---|---|---|
| admin@demo.gbpuat.test | University Admin | — |
| amit@demo.gbpuat.test | Guard | Gate 1 |
| neha@demo.gbpuat.test | Librarian | Central Library |

### Checks

```bash
npm test         # unit tests
npm run lint
npm run typecheck
npm run build
```

`supabase/tests/campus_events_test.sql` is the database half. It runs inside a
transaction it rolls back, and prints a PASS line per check.

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

`src/lib/verification/verify.ts` picks a provider from `VERIFICATION_PROVIDER`:

- `none`, the default, reports that verification is not connected. **Nothing is
  recorded.** A student is never marked rejected because our own service was
  unavailable.
- `demo-registry` matches the scanned code against the student register so the
  demo can be walked end to end. It checks no signature. It refuses to run in
  production, the console shows a standing warning while it is on, and every
  event it produces stores `signature_checked: false`.

To connect the real thing, add a case to `verifyCredential` and point the
environment variable at it. Nothing else changes.

### Books and notifications, owned by Tabish

Import `recordCampusEvent` from `src/lib/events.ts`. Do not create another
activity table, and do not write to `campus_events` directly.

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

## How the event log resists tampering

Every row stores the hash of the row before it. The hash is computed by a
`BEFORE INSERT` trigger, so an application cannot choose it, and an advisory
lock per university stops two writers claiming the same position.

Three separate things keep history intact:

1. No insert, update or delete policy exists on `campus_events`, and those
   privileges are revoked from `authenticated`.
2. A trigger raises on any update or delete, which also stops the table owner
   and any future `SECURITY DEFINER` function.
3. The only way in is `record_campus_event()`, which takes the actor and the
   university **from the session**, never from its arguments.

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
- **The dashboard omits tiles it cannot fill.** There is no Active Cards or
  Library Transactions figure until those subsystems exist, and no placeholder
  number stands in for one.

## Demo data

Everything in `supabase/seed.sql` is fabricated: one university, four
departments, eight students including Rahul Kumar (20260042), two gates and
Central Library. No real student record belongs in this repository.
