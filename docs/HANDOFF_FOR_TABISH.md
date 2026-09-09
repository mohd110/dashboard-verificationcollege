# Handoff to Tabish — library, transactions and notifications

From Mammu. Written 10 September 2026, after adding card issuance to the
campus dashboard (`gbpuat-smart-identity`).

Two of these will change behaviour in your app. Section 1 fixes your student
lookup, which currently finds nobody. Section 2 is the event write path, which
works today by accident and will stop working the moment you move off the
service role.

---

## 1. Your student lookup was searching two empty columns

`actions/library/students.ts` does this:

```ts
.from('people')
.select('id, student_id, full_name, email, department, status')
.or(`full_name.ilike.%${query}%,student_id.ilike.%${query}%`)
```

Those columns exist. **`student_id` and `department` were NULL for all 150
students.** So the search matched on name only, `student_id` rendered as empty,
and `verifyStudentById(person.student_id)` was being handed `null`.

The real values live in `enrolments.student_number` and `departments.name`.
Rather than make you rewrite working queries, migration `0106` fills your two
columns from those and keeps them filled:

- a one-off backfill for every existing student, overwriting nothing that
  already had a value;
- a trigger on `people` that fills them on insert;
- a trigger on `enrolments` that updates them when a student number or
  department changes.

**You need to change nothing.** Once `RUN_3_paste_this.sql` has been applied,
your existing lookup starts returning rows and `student_id` starts having a
value. Please confirm your search works after it runs, because until it does,
nothing on your side can find a student.

One thing to keep in mind: those two columns are a **projection**. The canonical
values are the enrolment and the department. Never write to
`people.student_id` directly — the trigger will win.

---

## 2. Your campus event writes work today by accident

`lib/campus-events/adapter.ts` inserts into `campus_events` directly, with the
service role, computing a `prev_hash` of `'GENESIS'` and its own SHA-256.

Two things are true about that:

**It has not corrupted anything.** Migration `0101` put a `BEFORE INSERT`
trigger on the table that overwrites `seq`, `prev_hash` and `event_hash` on
every row, whoever inserts it. Your rows are chained correctly. Your computed
hash is simply discarded.

**It will stop working the moment you use a real session.** Migration `0105`
enabled row level security on `campus_events` with **no insert policy**. The
service role bypasses that; a librarian's session does not.

### Use `record_campus_event` instead

```ts
// lib/supabase/server.ts — the SESSION client, not createServiceClient()
const supabase = await createClient();

const { data, error } = await supabase.rpc('record_campus_event', {
  p_event_type: 'BOOK_ISSUED',      // required
  p_result: 'SUCCESS',              // required
  p_person_id: personId,            // people.id
  p_location_id: locationId,        // campus_locations.id
  p_entity_type: 'book',
  p_entity_id: bookId,
  p_metadata: { book_code: 'CS-001', due_date: dueDate },
  p_occurred_at: new Date().toISOString(),
  p_system_actor: false,
}).single();
```

It returns the sealed row, including `seq`, `event_hash` and `prev_hash`.

**It must be called with the librarian's own session, not the service role.**
The function reads the actor and the university from `auth.uid()`. Called with
the service role, `auth.uid()` is null and it raises
`no staff account is signed in`. That is deliberate: it is what stops any
client writing activity into another university or under somebody else's name.

Delete the hash computation from your adapter. There is one definition of a
correct hash and it lives in the database.

### What your role is allowed to record

`librarian` may record:

```
IDENTITY_VERIFIED   IDENTITY_REJECTED   LIBRARY_ENTRY
BOOK_ISSUED         BOOK_RETURNED       NOTIFICATION_SENT
```

Anything else raises `role librarian may not record X events`.

### `p_system_actor`

Set it `true` only for a turnstile opening or a mailer sending — activity with
no human behind it. The event is then attributed to the system, and the session
that drove the machine is kept in the metadata as `system_operator_id`, so the
trail stays complete. Only `LIBRARY_ENTRY` and `NOTIFICATION_SENT` accept it;
anything else is rejected.

`BOOK_ISSUED` and `BOOK_RETURNED` are **not** system events. Neha issued the
book, and the trail should say so.

---

## 3. `book_transactions.actor_id` points at the wrong table

The foreign key is:

```
book_transactions.actor_id -> people.id
```

But the librarian who issues a book is an `app_users` row, and
`campus_events.actor_id` points at `app_users`. So the same person is recorded
by two different identifiers depending on which table you are reading, and
joining a transaction to the event it produced needs a lookup neither table
offers.

There happen to be rows for Neha in both tables, so nothing fails today. It is
still a trap for anybody who later tries to answer "which librarian issued this
book" across the two tables.

Your table, your call. If you want it changed, repoint the FK at `app_users`
in a new migration and I will keep the event side matching. If you would rather
leave it, put a comment on the column saying it means "the staff member as a
person, not as a login", so the next reader is not caught.

---

## 4. Use the real credential, not the student number

`lib/verification/adapter.ts` looks a student up by `student_id` and returns
`credentialId: 'mock-credential-...'`. That was the right call while nothing
else existed. Signed credentials now exist and are issued from the dashboard.

A card's QR code contains a compact JWS and nothing else — no URL, no prefix,
no envelope. Verification is arithmetic against a published key, so it works
with no network at all.

The whole check is:

```ts
import { verifyCredential, StaticKeyResolver } from '<saif's lib/core/crypto/verify>';

const jwks = await fetch('/.well-known/jwks.json').then((r) => r.json());
const result = await verifyCredential(scannedText, {
  resolver: new StaticKeyResolver(keysFromJwks),
  expectedIssuer: 'nort',
  lookupStatus,          // reads credential_status, so a blocked card fails
});
```

Then resolve the person. A librarian holds no read on `credentials`, so use the
function added for exactly this:

```sql
select * from resolve_credential_holder('<jti from the verified claims>');
```

It returns `person_id`, `credential_id`, `full_name`, `student_id`,
`department`, `person_status`, `credential_state`, `reason_code`, `expires_at`,
scoped to the caller's university.

Two states you must keep distinct, because the demo turns on them:

- `EXPIRED` — the signature is genuine, the card is out of date. Registry
  office.
- `REVOKED` — the signature is genuine, the university has blocked the card.
  Refuse the issue.

Neither is `INVALID_SIGNATURE`. A tampered card is a security matter; an expired
one is paperwork.

For the demo, a student number typed by hand is still acceptable as a fallback
— my console does the same — as long as the result says plainly that no
signature was checked, and the event records `signature_checked: false`. Never
show a green tick for an unsigned lookup.

---

## 5. Notifications

`notifications` is yours and is already in the database with `PENDING`, `SENT`
and `FAILED`. Two things from the handoff that are worth restating because they
are easy to get wrong under time pressure:

**Never mark a failed email `SENT`.** If Resend returns an error, the row is
`FAILED` with the provider's message in `error`.

**Only record `NOTIFICATION_SENT` after a genuine send.** The event says an
email reached a student. If the mailer failed, no event. An audit trail that
records intentions rather than outcomes is worse than none, because it reads as
if it were the truth.

`NOTIFICATION_SENT` is the one book-flow event that takes
`p_system_actor: true`, because a mailer has no human behind it.

---

## 6. What the dashboard now does, so you can rely on it

- **Issuing a card** signs an Ed25519 credential, writes `cards`,
  `credentials`, `credential_status` and `credential_events`, and records a
  `CARD_ISSUED` campus event. `/admin/students/<id>` → Issue card.
- **Blocking a card** upserts `credential_status`, appends to
  `credential_events`, and records `CARD_BLOCKED`. `/admin/cards/<id>`.
- **The student profile** shows the whole chronological trail — gate scans,
  library entries, book issues, notifications, card events — read straight from
  `campus_events`, nothing hardcoded. Your `BOOK_ISSUED` and
  `NOTIFICATION_SENT` events appear there the moment you write them.
- **`/admin/integrity`** re-hashes every event and reports `UNBROKEN` or the
  first position that fails. It says `Blockchain Anchor: NOT YET ANCHORED`,
  and no transaction identifier is invented.
- **`/.well-known/jwks.json`** serves the published signing keys, including
  rotated ones, each carrying its status.

---

## 7. The signing key rotated

The dashboard needed a private key to issue cards, and Saif's lives only in his
`.env.local`, so a new one was generated.

| kid | status |
|---|---|
| `nf-2026-01` | rotated |
| `nort-2026-09-szj6` | active |

Nothing was revoked. **Cards signed by either key still verify**, because a
rotated key stays published and your verifier must refuse only `revoked` and
`compromised`. If you cache the JWKS, make sure the cache is not longer than
your demo — five minutes is what both apps use.

---

## 8. On the interface

The dashboard's shell is modelled on your library app: the fixed dark blue
sidebar, the light canvas, the card and stat-tile treatment, lucide icons. The
three applications should look like one system when they are demonstrated back
to back, and yours was the right starting point.

Two things worth copying back if you have time:

- **A `loading.tsx` for every route.** Next prefetches that boundary for each
  sidebar link, so a tab change paints the shape of the next screen immediately
  instead of leaving the old one up while a query runs. It is the single
  cheapest thing you can do for how the app feels.
- **A Suspense boundary around the slow half of a page.** The book list and the
  transaction list do not need to wait for each other.

---

## Quick reference

```
Apply the SQL          RUN_3_paste_this.sql, in the Supabase SQL editor
Write an event         supabase.rpc('record_campus_event', {...})   session client
Identify a scan        supabase.rpc('resolve_credential_holder', { p_jti })
Look up by number      supabase.rpc('resolve_person_by_code', { p_code })
Public keys            GET /.well-known/jwks.json
Your events            BOOK_ISSUED  BOOK_RETURNED  NOTIFICATION_SENT  LIBRARY_ENTRY
```
