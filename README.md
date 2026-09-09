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
supabase/tests/campus_events_test.sql   run once to prove it works
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
| `app_users.full_name`, `app_users.id = auth.uid()` | `app_users.display_name`, `app_users.auth_user_id` |
| `user_roles.location_id` | `user_roles.scope_type` = `location`, `scope_id` |
| `universities.name` | `universities.legal_name` |
| enum `campus_event_type` | `campus_events.event_type` is text |

A posting is therefore a role grant scoped to a location. The vocabulary for
event types and results is enforced by `record_campus_event()` rather than by a
CHECK constraint, because a constraint would reject rows the library subsystem
may already be writing.

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
npm test         # unit tests
npm run lint
npm run typecheck
npm run build
```

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
