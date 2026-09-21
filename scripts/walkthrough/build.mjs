/**
 * Builds the platform walkthrough PDF.
 *
 *   node --env-file=.env.local scripts/walkthrough/build.mjs [out.pdf]
 *
 * Renders an HTML document with vector flowcharts, then prints it to PDF with
 * headless Chrome, which keeps every link clickable. render.py adds the
 * bookmark sidebar and page numbers afterwards.
 *
 * The demo password and a real demo student card are read from the live
 * environment at build time and printed into the PDF — that is what makes the
 * document usable in a demo. It also means the PDF is private: this script is
 * safe to commit, its output is not.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createClient } from '@supabase/supabase-js';
import QRCode from 'qrcode';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(process.argv[2] ?? join(process.env.USERPROFILE ?? '.', 'Desktop', 'GBPUAT-Smart-Campus-Walkthrough.pdf'));
const BASE = (process.env.WALKTHROUGH_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const PASSWORD = process.env.DEMO_STAFF_PASSWORD ?? '(set DEMO_STAFF_PASSWORD)';

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/* ── Live figures ─────────────────────────────────────────────────────── */

async function count(table, filter = (q) => q) {
  const { count: n } = await filter(db.from(table).select('*', { count: 'exact', head: true }));
  return n ?? 0;
}

const figures = {
  students: await count('people', (q) => q.eq('role', 'student')),
  books: await count('books'),
  events: await count('campus_events'),
  credentials: await count('credentials'),
  fests: await count('campus_fests'),
};

async function cardFor(studentId, { mustVerify }) {
  const { data: person } = await db
    .from('people')
    .select('id, full_name, student_id, department, date_of_birth')
    .eq('student_id', studentId)
    .single();
  const { data: creds } = await db
    .from('credentials')
    .select('jti, compact_jws, issued_at, expires_at, credential_status ( status )')
    .eq('person_id', person.id)
    .order('issued_at', { ascending: false });
  const pick = (creds ?? []).find((c) => {
    const s = Array.isArray(c.credential_status) ? c.credential_status[0] : c.credential_status;
    return s?.status === 'active';
  });
  return { person, cred: pick ?? creds?.[0], mustVerify };
}

const demoStudent = await cardFor('NU20260060', { mustVerify: true });
// The one credential in the database whose signature does not match its
// contents: altered after signing. A ready-made forged card for the demo.
const { data: forged } = await db
  .from('credentials')
  .select('jti, compact_jws, people ( full_name, student_id )')
  .eq('jti', 'PDwxk8C9HhmWEcAHaVIDYQ')
  .maybeSingle();

// Error correction L for the long credentials: a 413-character JWS at level M
// packs so many modules into a card-sized code that a phone held at arm's
// length struggles with it. On a screen or clean paper, fewer, larger modules
// scan far more reliably than extra redundancy does. Pure black for contrast.
const qr = async (text, level = 'M') =>
  QRCode.toString(text, { type: 'svg', errorCorrectionLevel: level, margin: 4, color: { dark: '#000000', light: '#ffffff' } });

const studentQr = demoStudent.cred ? await qr(demoStudent.cred.compact_jws, 'L') : '';
const forgedQr = forged ? await qr(forged.compact_jws, 'L') : '';
const loginQr = await qr(`${BASE}/login`);
const passQr = await qr(`${BASE}/me/sign-in`);

const dob = demoStudent.person.date_of_birth
  ? new Date(`${demoStudent.person.date_of_birth}T00:00:00Z`).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC',
    })
  : '—';

/* ── SVG diagram kit ──────────────────────────────────────────────────── */

const C = {
  navy: '#0f2440', brand: '#1e3a5f', blue: '#2563a8', sky: '#e8f0fb', line: '#c8d3e3',
  gold: '#b7862b', goldBg: '#fbf3e2', ink: '#14213d', muted: '#5b6b82',
  ok: '#15803d', okBg: '#e7f6ec', bad: '#b91c1c', badBg: '#fdecec', warn: '#b45309', warnBg: '#fef4e2',
  violet: '#6d28d9', violetBg: '#f1eafd', teal: '#0f766e', tealBg: '#e3f5f2',
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function lines(text, x, y, { size = 13, weight = 600, fill = C.ink, gap = 16, anchor = 'middle' } = {}) {
  return String(text)
    .split('\n')
    .map((t, i) => `<text x="${x}" y="${y + i * gap}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(t)}</text>`)
    .join('');
}

/** A rounded node. `href` makes the whole node a link to a chapter. */
function node(x, y, w, h, title, sub = '', { fill = '#fff', stroke = C.line, color = C.ink, href, icon = '', subColor = C.muted } = {}) {
  const titleLines = title.split('\n').length;
  const subLines = sub ? sub.split('\n').length : 0;
  const block = titleLines * 16 + subLines * 14 + (sub ? 4 : 0);
  const top = y + h / 2 - block / 2 + 12;
  const body =
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/>` +
    (icon ? `<text x="${x + 14}" y="${y + 24}" font-size="16">${icon}</text>` : '') +
    lines(title, x + w / 2, top, { size: 13.5, weight: 700, fill: color }) +
    (sub ? lines(sub, x + w / 2, top + titleLines * 16 + 2, { size: 11, weight: 500, fill: subColor, gap: 14 }) : '');
  return href ? `<a href="${href}">${body}</a>` : body;
}

function diamond(cx, cy, w, h, label, { fill = C.goldBg, stroke = C.gold } = {}) {
  const n = label.split('\n').length;
  return (
    `<polygon points="${cx},${cy - h / 2} ${cx + w / 2},${cy} ${cx},${cy + h / 2} ${cx - w / 2},${cy}" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/>` +
    lines(label, cx, cy - (n - 1) * 8 + 4, { size: 12, weight: 700, fill: '#6b4a10', gap: 15 })
  );
}

function arrow(points, { color = '#7a8aa3', label = '', lx, ly, dash = false, labelColor } = {}) {
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ');
  const tag = label
    ? `<rect x="${lx - label.length * 3.4 - 6}" y="${ly - 11}" width="${label.length * 6.8 + 12}" height="17" rx="8" fill="#fff" stroke="${C.line}"/>` +
      lines(label, lx, ly + 2, { size: 10.5, weight: 700, fill: labelColor ?? color })
    : '';
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.8" ${dash ? 'stroke-dasharray="5 4"' : ''} marker-end="url(#arrow)"/>` + tag;
}

function svg(w, h, body, title) {
  return `<svg class="diagram" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}" xmlns="http://www.w3.org/2000/svg" font-family="Segoe UI, Arial, sans-serif">
  <defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#7a8aa3"/></marker></defs>
  ${body}</svg>`;
}

/* ── The diagrams ─────────────────────────────────────────────────────── */

const mapDiagram = svg(1000, 560, [
  node(360, 16, 280, 64, 'One login screen', 'email + password for staff', { fill: C.sky, stroke: C.blue, color: C.navy, icon: '🔐', href: '#signin' }),
  arrow([[500, 80], [500, 112]]),
  diamond(500, 150, 250, 76, 'Who signed in?\n(role on the account)'),
  arrow([[375, 150], [110, 150], [110, 222]]),
  arrow([[420, 176], [300, 222]]),
  arrow([[500, 188], [500, 222]]),
  arrow([[580, 176], [700, 222]]),
  arrow([[625, 150], [890, 150], [890, 222]]),
  node(20, 226, 180, 96, 'Admin', 'Dashboard · Users\nFests · Integrity', { fill: '#eef2f8', stroke: C.brand, color: C.navy, icon: '🏛️', href: '#admin' }),
  node(215, 226, 175, 96, 'Librarian', 'Issue · Return\nBooks · Students', { fill: C.tealBg, stroke: C.teal, color: C.teal, icon: '📚', href: '#librarian' }),
  node(405, 226, 190, 96, 'Guard', 'Phone gate app\nScan · History', { fill: C.okBg, stroke: C.ok, color: C.ok, icon: '🛡️', href: '#guard' }),
  node(610, 226, 180, 96, 'Records Office', 'Registrar · Cards\nRevocation · Audit', { fill: C.goldBg, stroke: C.gold, color: '#7a5510', icon: '🗂️', href: '#records' }),
  node(805, 226, 180, 96, 'Student', 'Card + date of birth\nno password', { fill: C.violetBg, stroke: C.violet, color: C.violet, icon: '🎓', href: '#student' }),
  lines('separate door: /me', 895, 342, { size: 10.5, weight: 600, fill: C.violet }),
  ...[110, 302, 500, 700, 895].map((x) => arrow([[x, 322], [x, 412]], { dash: true })),
  `<rect x="20" y="414" width="960" height="130" rx="16" fill="${C.navy}"/>`,
  lines('ONE SHARED DATABASE', 500, 444, { size: 12, weight: 800, fill: '#9fb6d6' }),
  ...[
    ['people & enrolments', 60], ['cards & credentials', 245], ['books & loans', 430], ['fests & duties', 600], ['notifications', 775],
  ].map(([t, x]) => `<rect x="${x}" y="458" width="165" height="30" rx="15" fill="#1d3a61"/>` + lines(t, x + 82, 478, { size: 11.5, weight: 600, fill: '#e2ebf7' })),
  `<a href="#chain"><rect x="190" y="498" width="620" height="32" rx="16" fill="${C.gold}"/>` +
    lines('🔗  Hash-chained activity record — every scan, issue, block and loan, tamper-evident', 500, 519, { size: 12, weight: 700, fill: '#fff' }) + '</a>',
].join(''), 'Platform map');

const signinDiagram = svg(1000, 610, [
  node(385, 10, 230, 50, 'Someone opens the app', '', { fill: C.sky, stroke: C.blue, color: C.navy }),
  arrow([[500, 60], [500, 88]]),
  diamond(500, 122, 220, 64, 'Staff or student?'),
  arrow([[390, 122], [200, 122], [200, 168]], { label: 'staff', lx: 290, ly: 122 }),
  arrow([[610, 122], [800, 122], [800, 168]], { label: 'student', lx: 705, ly: 122, color: C.violet }),

  node(80, 172, 240, 60, '/login', 'email + password', { fill: '#fff', stroke: C.blue, color: C.navy, icon: '🔐' }),
  arrow([[200, 232], [200, 262]]),
  node(80, 266, 240, 56, 'Supabase checks password', 'then loads role in one call', {}),
  arrow([[200, 322], [200, 350]]),
  diamond(200, 386, 200, 64, 'Which role?'),
  ...[
    ['Admin', '/admin', 20, '#admin'], ['Librarian', '/library', 118, '#librarian'], ['Guard', '/guard', 216, '#guard'], ['Records\nOffice', '/records', 314, '#records'],
  ].map(([role, path, x, href]) => arrow([[200, 418], [x + 45, 470]]) + node(x, 474, 90, 84, role, path, { fill: '#eef2f8', stroke: C.brand, color: C.navy, href })),
  node(20, 568, 384, 34, 'Auditor → /records/activity  ·  anyone else → /console', '', { fill: '#fff' }),

  node(680, 172, 240, 60, '/me/sign-in', 'scan own card', { fill: C.violetBg, stroke: C.violet, color: C.violet, icon: '🎓' }),
  arrow([[800, 232], [800, 262]]),
  diamond(800, 296, 230, 64, 'A scanned card,\nnot a typed number?', { fill: C.violetBg, stroke: C.violet }),
  arrow([[915, 296], [960, 296], [960, 338]], { label: 'no', lx: 945, ly: 283, color: C.bad }),
  arrow([[800, 328], [800, 358]], { label: 'yes', lx: 830, ly: 343, color: C.ok }),
  diamond(800, 392, 230, 64, 'University signature\nvalid & not blocked?', { fill: C.violetBg, stroke: C.violet }),
  arrow([[915, 392], [898, 392]], { color: C.bad }),
  arrow([[800, 424], [800, 454]], { label: 'yes', lx: 830, ly: 439, color: C.ok }),
  diamond(800, 488, 230, 64, 'Date of birth\nmatches register?', { fill: C.violetBg, stroke: C.violet }),
  arrow([[915, 488], [898, 488]], { color: C.bad }),
  node(900, 336, 90, 170, 'Refused', 'politely,\nwith what\nto do\nnext', { fill: C.badBg, stroke: C.bad, color: C.bad }),
  arrow([[800, 520], [800, 548]], { label: 'yes', lx: 830, ly: 534, color: C.ok }),
  node(660, 552, 280, 50, '30-minute student pass', 'signed cookie, then /me', { fill: C.okBg, stroke: C.ok, color: C.ok, href: '#student' }),
].join(''), 'How signing in works');

const verifyDiagram = svg(1000, 330, [
  node(10, 128, 120, 74, 'Card\nscanned', 'camera or\nUSB reader', { fill: C.sky, stroke: C.blue, color: C.navy, icon: '📷' }),
  arrow([[130, 165], [158, 165]]),
  diamond(232, 165, 148, 96, 'Signed by\nuniversity\nkey?'),
  arrow([[306, 165], [334, 165]], { label: 'yes', lx: 320, ly: 152, color: C.ok }),
  diamond(408, 165, 148, 96, 'Issued by\nthis campus?'),
  arrow([[482, 165], [510, 165]], { label: 'yes', lx: 496, ly: 152, color: C.ok }),
  diamond(584, 165, 148, 96, 'Within\nvalidity\ndates?'),
  arrow([[658, 165], [686, 165]], { label: 'yes', lx: 672, ly: 152, color: C.ok }),
  diamond(760, 165, 148, 96, 'Not blocked\nright now?\n(live check)'),
  arrow([[834, 165], [862, 165]], { label: 'yes', lx: 848, ly: 152, color: C.ok }),
  node(864, 120, 126, 90, 'VALID', 'photo shown,\nguard confirms', { fill: C.okBg, stroke: C.ok, color: C.ok }),
  arrow([[232, 213], [232, 262]], { color: C.bad }),
  arrow([[408, 213], [408, 262]], { color: C.bad }),
  arrow([[584, 213], [584, 262]], { color: C.warn }),
  arrow([[760, 213], [760, 262]], { color: C.bad }),
  node(172, 264, 120, 50, 'FORGED', 'tampered bytes', { fill: C.badBg, stroke: C.bad, color: C.bad }),
  node(348, 264, 120, 50, 'WRONG ISSUER', 'other campus', { fill: C.badBg, stroke: C.bad, color: C.bad }),
  node(524, 264, 120, 50, 'EXPIRED', 'go to registry', { fill: C.warnBg, stroke: C.warn, color: C.warn }),
  node(700, 264, 120, 50, 'BLOCKED', 'lost / revoked', { fill: C.badBg, stroke: C.bad, color: C.bad }),
  `<a href="#chain"><rect x="150" y="14" width="700" height="46" rx="12" fill="${C.navy}"/>` +
    lines('Every outcome — pass or fail — is sealed onto the hash-chained record', 500, 34, { size: 13, weight: 700, fill: '#fff' }) +
    lines('who · what · where · when · result', 500, 52, { size: 11, weight: 500, fill: '#9fb6d6' }) + '</a>',
].join(''), 'How a card is checked');

const cardLifecycle = svg(1000, 250, [
  node(10, 88, 150, 70, 'Student record', 'registrar keeps\nit current', { fill: '#fff' }),
  arrow([[160, 123], [328, 123]], { label: 'Card Operator issues', lx: 244, ly: 108 }),
  node(330, 78, 170, 90, 'ACTIVE', 'signed with the\nuniversity key', { fill: C.okBg, stroke: C.ok, color: C.ok }),
  arrow([[500, 105], [658, 105]], { label: 'Revocation blocks', lx: 579, ly: 90, color: C.bad }),
  arrow([[658, 142], [500, 142]], { label: 'reinstated', lx: 579, ly: 158, color: C.ok }),
  node(660, 78, 170, 90, 'BLOCKED', 'refused at every\ngate on next scan', { fill: C.badBg, stroke: C.bad, color: C.bad }),
  arrow([[415, 168], [415, 206], [848, 206]], { label: 're-issued (damaged, updated)', lx: 630, ly: 206, color: C.blue }),
  node(850, 178, 140, 56, 'SUPERSEDED', 'old QR stops', { fill: C.sky, stroke: C.blue, color: C.navy }),
  arrow([[415, 78], [415, 42], [848, 42]], { label: 'validity date passes', lx: 630, ly: 42, color: C.warn }),
  node(850, 14, 140, 56, 'EXPIRED', 'genuine but lapsed', { fill: C.warnBg, stroke: C.warn, color: C.warn }),
].join(''), 'Card lifecycle');

const libraryDiagram = svg(1000, 200, [
  node(10, 60, 150, 80, 'Scan card', 'at the issue desk', { fill: C.tealBg, stroke: C.teal, color: C.teal, icon: '🪪' }),
  arrow([[160, 100], [190, 100]]),
  node(192, 60, 150, 80, 'Verified', 'same check as\nthe gate', { fill: C.okBg, stroke: C.ok, color: C.ok }),
  arrow([[342, 100], [372, 100]]),
  node(374, 60, 150, 80, 'Pick a book', 'search catalogue,\nsee copies left', { fill: '#fff', icon: '📖' }),
  arrow([[524, 100], [554, 100]]),
  node(556, 60, 170, 80, 'Issue', 'copies −1 · loan\nrecord · due date', { fill: C.tealBg, stroke: C.teal, color: C.teal }),
  arrow([[726, 100], [756, 100]]),
  node(758, 18, 232, 56, '🔗 BOOK_ISSUED on the record', '', { fill: C.navy, stroke: C.navy, color: '#fff', href: '#chain' }),
  node(758, 124, 232, 56, '✉ Email to the student', 'title + due date', { fill: C.goldBg, stroke: C.gold, color: '#7a5510' }),
  arrow([[741, 100], [741, 46], [756, 46]]),
  arrow([[741, 100], [741, 152], [756, 152]]),
].join(''), 'Issuing a book');

const festDiagram = svg(1000, 330, [
  node(10, 20, 170, 84, 'Admin creates\nthe fest', 'dates · venue\ncategory', { fill: '#eef2f8', stroke: C.brand, color: C.navy, icon: '🎪' }),
  arrow([[180, 62], [210, 62]]),
  node(212, 20, 170, 84, 'Its own gate', 'a campus location\njust for this fest', { fill: '#fff' }),
  arrow([[382, 62], [412, 62]]),
  node(414, 20, 170, 84, 'Coordinators', 'faculty · student\nvolunteer + phone', { fill: C.goldBg, stroke: C.gold, color: '#7a5510' }),
  arrow([[584, 62], [614, 62]]),
  node(616, 20, 170, 84, 'Guards rostered', 'post + shift\nno double-booking', { fill: C.okBg, stroke: C.ok, color: C.ok }),
  arrow([[786, 62], [816, 62]]),
  node(818, 20, 172, 84, 'Guard’s app\nswitches over', 'banner · call\ncoordinator', { fill: C.okBg, stroke: C.ok, color: C.ok, icon: '📱', href: '#guard' }),
  arrow([[904, 104], [904, 140], [800, 140], [800, 160]]),
  node(700, 162, 200, 76, 'Scans = attendance', 'sealed on the chain —\nnot a list anyone edits', { fill: C.navy, stroke: C.navy, color: '#fff', subColor: '#b9c8dd', href: '#chain' }),
  arrow([[700, 200], [640, 200]]),
  node(440, 162, 198, 76, 'Admin reviews by day', 'approve · reject\n“approve all pending”', { fill: '#eef2f8', stroke: C.brand, color: C.navy }),
  arrow([[440, 200], [380, 200]]),
  node(180, 162, 198, 76, 'On-duty volunteers', 'added by number —\na reason is mandatory', { fill: C.goldBg, stroke: C.gold, color: '#7a5510' }),
  arrow([[539, 238], [539, 262]]),
  arrow([[279, 238], [279, 262]]),
  node(180, 264, 250, 56, '⬇ CSV for department offices', 'approved rows only', { fill: C.tealBg, stroke: C.teal, color: C.teal }),
  node(450, 264, 240, 56, '🎓 Student sees status', 'Regularised / Awaiting', { fill: C.violetBg, stroke: C.violet, color: C.violet, href: '#student' }),
  arrow([[85, 104], [85, 160]], { dash: true, color: C.bad, label: 'any time', lx: 85, ly: 132 }),
  node(10, 162, 150, 76, 'Cancel', 'retires the gate —\nscans refused', { fill: C.badBg, stroke: C.bad, color: C.bad }),
].join(''), 'Fest lifecycle');

const rippleDiagram = svg(1000, 300, [
  node(360, 110, 280, 84, 'ONE ACTION', 'e.g. a guard scans a card,\nor a card is blocked', { fill: C.navy, stroke: C.navy, color: '#fff', subColor: '#b9c8dd', icon: '⚡' }),
  ...[
    [20, 12, 'Admin activity trail', 'appears instantly', '#admin'],
    [20, 118, 'Auditor & registrar', 'Records → Activity', '#records'],
    [20, 224, 'Integrity check', 'chain still UNBROKEN', '#chain'],
    [760, 12, 'Fest attendance', 'if at a fest gate', '#fests'],
    [760, 118, 'Student’s own pass', 'My activity · Events', '#student'],
    [760, 224, 'Every other gate', 'blocked card refused', '#guard'],
  ].map(([x, y, t, s, href]) => node(x, y, 220, 64, t, s, { fill: '#fff', stroke: C.blue, color: C.navy, href })),
  arrow([[360, 130], [240, 44]]), arrow([[360, 152], [240, 150]]), arrow([[360, 175], [240, 256]]),
  arrow([[640, 130], [760, 44]]), arrow([[640, 152], [760, 150]]), arrow([[640, 175], [760, 256]]),
].join(''), 'One action, many screens');

/* ── Content ──────────────────────────────────────────────────────────── */

const link = (path, label = path) => `<a class="ext" href="${BASE}${path}">${esc(label)}</a>`;
const back = `<a class="back" href="#map">↑ back to the map</a>`;

const creds = [
  ['🏛️', 'University Admin', 'admin@demo.gbpuat.test', '/admin', 'Whole university'],
  ['📚', 'Librarian', 'neha@demo.gbpuat.test', '/library', 'Central Library'],
  ['🛡️', 'Guard', 'amit@demo.gbpuat.test', '/guard', 'Main Gate (GATE-1)'],
  ['🗂️', 'Registrar', 'registrar@demo.gbpuat.test', '/records', '—'],
  ['🪪', 'Card Operator', 'cards@demo.gbpuat.test', '/records', '—'],
  ['🚫', 'Revocation Officer', 'revocation@demo.gbpuat.test', '/records/cards', '—'],
  ['🔍', 'Auditor', 'auditor@demo.gbpuat.test', '/records/activity', '—'],
];

const Y = '<span class="y">✓</span>';
const N = '<span class="n">—</span>';
const R = '<span class="r">read</span>';
const matrix = [
  ['Sign in', 'email + password', 'email + password', 'email + password', 'email + password', 'email + password', 'email + password', 'email + password', 'card + DOB'],
  ['Scan / verify a card', Y, Y, Y, N, N, N, N, 'own card'],
  ['Student register', Y, 'lookup', N, Y, R, N, R, 'own record'],
  ['Edit student records', Y, N, N, Y, N, N, N, N],
  ['Issue a card', Y, N, N, N, Y, N, N, N],
  ['Block / reinstate a card', Y, N, N, N, N, Y, N, N],
  ['Issue & return books', Y, Y, N, N, N, N, N, 'own loans'],
  ['Activity trail', Y, 'own', 'own', R, R, R, R, 'own'],
  ['Integrity check', Y, N, N, N, N, N, N, N],
  ['Create & run fests', Y, N, 'on duty', N, N, N, N, 'view'],
  ['Regularise attendance', Y, N, N, N, N, N, N, 'see status'],
  ['Users, roles, locations', Y, N, N, N, N, N, N, N],
];

const html = /* html */ `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>GBPUAT Smart Campus — Platform Walkthrough</title>
<style>
  @page { size: A4; margin: 15mm 14mm 17mm; }
  @page :first { margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html { font-family: 'Segoe UI', Arial, sans-serif; color: #14213d; font-size: 10.6pt; line-height: 1.5; }
  body { margin: 0; }
  a { color: #2563a8; text-decoration: none; }
  h1, h2, h3 { color: #0f2440; line-height: 1.2; margin: 0; }
  h2 { font-size: 22pt; letter-spacing: -0.02em; margin-bottom: 4pt; }
  h3 { font-size: 13pt; margin: 14pt 0 5pt; }
  p { margin: 0 0 7pt; }
  .page { break-before: page; }
  .kicker { font-size: 8.5pt; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; color: #b7862b; margin-bottom: 4pt; }
  .lede { font-size: 11.5pt; color: #3b4a63; margin-bottom: 12pt; max-width: 165mm; }
  .diagram { width: 100%; height: auto; display: block; margin: 8pt 0 10pt; }
  .back { float: right; font-size: 8.5pt; font-weight: 600; color: #5b6b82; border: 1px solid #c8d3e3; border-radius: 99px; padding: 1pt 8pt; margin-top: 4pt; }
  .ext { font-family: 'Cascadia Mono', Consolas, monospace; font-size: 9pt; background: #e8f0fb; border-radius: 4pt; padding: 0 4pt; }
  code, .mono { font-family: 'Cascadia Mono', Consolas, monospace; font-size: 9pt; }

  /* cover */
  .cover { height: 297mm; padding: 30mm 22mm 20mm; color: #fff; position: relative; overflow: hidden;
    background: radial-gradient(900px 500px at 85% 10%, #2a5288 0%, transparent 60%), linear-gradient(160deg, #0f2440 0%, #1e3a5f 60%, #16304f 100%); }
  .cover .kicker { color: #e7c878; }
  .cover h1 { color: #fff; font-size: 40pt; letter-spacing: -0.03em; line-height: 1.05; margin: 8pt 0 12pt; }
  .cover .sub { font-size: 14pt; color: #c9d7ea; max-width: 150mm; }
  .cover .rule { height: 3px; width: 70mm; background: #b7862b; margin: 18pt 0; }
  .cover .stats { display: flex; gap: 10mm; margin-top: 26mm; }
  .cover .stat b { display: block; font-size: 28pt; color: #fff; line-height: 1; }
  .cover .stat span { font-size: 8.5pt; letter-spacing: 0.1em; text-transform: uppercase; color: #9fb6d6; }
  .cover .roles { display: flex; flex-wrap: wrap; gap: 6pt; margin-top: 16mm; max-width: 165mm; }
  .cover .roles a { color: #fff; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.22); border-radius: 99px; padding: 4pt 10pt; font-size: 10pt; font-weight: 600; }
  .cover .foot { position: absolute; left: 22mm; right: 22mm; bottom: 18mm; display: flex; justify-content: space-between; align-items: flex-end; font-size: 9pt; color: #9fb6d6; }
  .cover .qrbox { background: #fff; border-radius: 8pt; padding: 5pt; width: 30mm; }
  .cover .qrbox svg { width: 100%; display: block; }

  /* contents */
  .toc { list-style: none; padding: 0; margin: 10pt 0 0; columns: 2; column-gap: 10mm; }
  .toc li { break-inside: avoid; margin-bottom: 7pt; }
  .toc a { display: flex; gap: 8pt; align-items: baseline; color: #14213d; padding: 7pt 9pt; border: 1px solid #dfe6f0; border-radius: 9pt; }
  .toc .num { font-weight: 800; color: #b7862b; width: 14pt; }
  .toc b { display: block; font-size: 11pt; }
  .toc small { color: #5b6b82; font-size: 8.8pt; }

  /* tables */
  table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 9.3pt; margin: 6pt 0 10pt; }
  th { background: #0f2440; color: #fff; text-align: left; padding: 6pt 7pt; font-weight: 700; font-size: 8.6pt; }
  th:first-child { border-top-left-radius: 7pt; } th:last-child { border-top-right-radius: 7pt; }
  td { padding: 5.5pt 7pt; border-bottom: 1px solid #e4eaf2; vertical-align: top; }
  tr:nth-child(even) td { background: #f7f9fc; }
  #signin .diagram { width: 88%; margin: 2pt auto 4pt; }
  #signin td { padding: 3.6pt 7pt; }
  #signin h3 { margin-top: 6pt; }
  .matrix td, .matrix th { text-align: center; font-size: 8.4pt; padding: 5pt 3pt; }
  .matrix td:first-child, .matrix th:first-child { text-align: left; font-weight: 600; padding-left: 7pt; }
  .y { color: #15803d; font-weight: 800; } .n { color: #b8c2d1; } .r { color: #2563a8; font-weight: 600; }

  /* role chapter header */
  .rolehead { display: flex; gap: 12pt; align-items: center; padding: 12pt 14pt; border-radius: 14pt; margin: 4pt 0 12pt; color: #fff; }
  .rolehead .icon { font-size: 30pt; line-height: 1; }
  .rolehead h2 { color: #fff; margin: 0; }
  .rolehead p { margin: 2pt 0 0; color: rgba(255,255,255,0.85); }
  .rolehead .login { margin-left: auto; text-align: right; font-size: 9pt; background: rgba(255,255,255,0.14); border-radius: 9pt; padding: 6pt 9pt; }
  .rolehead .login b { display: block; font-family: 'Cascadia Mono', Consolas, monospace; font-size: 9pt; }
  .navy { background: linear-gradient(135deg, #0f2440, #2563a8); }
  .teal { background: linear-gradient(135deg, #0f5e58, #14a193); }
  .green { background: linear-gradient(135deg, #14532d, #16a34a); }
  .gold { background: linear-gradient(135deg, #7a5510, #c89d42); }
  .violet { background: linear-gradient(135deg, #4c1d95, #7c3aed); }

  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 9pt; }
  .card { border: 1px solid #dfe6f0; border-radius: 11pt; padding: 9pt 11pt; break-inside: avoid; background: #fff; }
  .card h4 { margin: 0 0 3pt; font-size: 10.6pt; color: #0f2440; }
  .card p { margin: 0; font-size: 9.3pt; color: #3b4a63; }
  .card .path { float: right; }
  .can li, .cant li { margin-bottom: 3pt; }
  .can, .cant { padding-left: 14pt; margin: 4pt 0 8pt; }
  .cant { color: #5b6b82; }
  .callout { border-left: 4px solid #b7862b; background: #fbf3e2; padding: 8pt 11pt; border-radius: 0 9pt 9pt 0; margin: 8pt 0 10pt; font-size: 9.6pt; break-inside: avoid; }
  .callout.blue { border-color: #2563a8; background: #e8f0fb; }
  .callout.red { border-color: #b91c1c; background: #fdecec; }
  .callout.green { border-color: #15803d; background: #e7f6ec; }
  .callout b { color: #0f2440; }

  .steps { counter-reset: s; list-style: none; padding: 0; margin: 6pt 0; }
  .steps li { counter-increment: s; position: relative; padding: 6pt 8pt 6pt 32pt; border: 1px solid #e4eaf2; border-radius: 9pt; margin-bottom: 5pt; break-inside: avoid; font-size: 9.6pt; }
  .steps li::before { content: counter(s); position: absolute; left: 8pt; top: 6pt; width: 17pt; height: 17pt; border-radius: 99px; background: #0f2440; color: #fff; font-weight: 800; font-size: 9pt; text-align: center; line-height: 17pt; }
  .steps .who { font-size: 8pt; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: #b7862b; margin-right: 5pt; }

  .idcards { display: grid; grid-template-columns: 1fr 1fr; gap: 10mm; margin-top: 8pt; }
  .idcard { border-radius: 14pt; padding: 12pt; color: #fff; break-inside: avoid; }
  .idcard.good { background: linear-gradient(150deg, #1c2b4a, #101829); }
  .idcard.bad { background: linear-gradient(150deg, #5c1515, #2a0a0a); }
  .idcard .uni { font-size: 7.5pt; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: #e7c878; }
  .idcard .nm { font-size: 14pt; font-weight: 700; margin: 3pt 0 1pt; }
  .idcard .meta { font-size: 9pt; color: #c9d7ea; }
  .idcard .qr { background: #fff; border-radius: 9pt; padding: 6pt; margin: 8pt 0; }
  .idcard .qr svg { width: 100%; display: block; }
  .idcard .note { font-size: 8.6pt; color: #e2e8f0; }
  .pill { display: inline-block; font-size: 7.8pt; font-weight: 800; letter-spacing: 0.05em; padding: 1pt 7pt; border-radius: 99px; text-transform: uppercase; }
  .pill.ok { background: #16a34a; color: #fff; } .pill.bad { background: #ef4444; color: #fff; }
</style></head><body>

<!-- ═══ COVER ═══ -->
<section class="cover">
  <div class="kicker">Govind Ballabh Pant University of Agriculture &amp; Technology · Pantnagar</div>
  <h1>Smart Campus<br>Platform Walkthrough</h1>
  <div class="sub">Every login, every screen and every feature — how one university identity runs the gate, the library, the records office, campus fests and each student’s own pass.</div>
  <div class="rule"></div>
  <div class="roles">
    <a href="#admin">🏛️ Admin</a><a href="#librarian">📚 Librarian</a><a href="#guard">🛡️ Guard</a>
    <a href="#records">🗂️ Records Office</a><a href="#student">🎓 Student</a><a href="#fests">🎪 Fests &amp; Events</a>
  </div>
  <div class="stats">
    <div class="stat"><b>${figures.students}</b><span>students on register</span></div>
    <div class="stat"><b>${figures.credentials}</b><span>signed ID cards</span></div>
    <div class="stat"><b>${figures.books}</b><span>library titles</span></div>
    <div class="stat"><b>${figures.events}</b><span>chained events</span></div>
  </div>
  <div class="foot">
    <div>Demo environment · all student records are fabricated<br>Generated ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })} from the live system<br><b style="color:#fff">Tap any box, badge or link in this document — it’s clickable.</b></div>
    <div style="text-align:center"><div class="qrbox">${loginQr}</div><div style="margin-top:4pt">scan to open the app</div></div>
  </div>
</section>

<!-- ═══ CONTENTS ═══ -->
<section class="page" id="contents">
  <div class="kicker">Start here</div>
  <h2>Contents</h2>
  <p class="lede">Every entry below is a link. So is every box in every diagram — tap one to jump to the chapter it describes, and use “back to the map” to return.</p>
  <ol class="toc">
    <li><a href="#map"><span class="num">1</span><span><b>The platform at a glance</b><small>one identity, five doors, one record</small></span></a></li>
    <li><a href="#signin"><span class="num">2</span><span><b>Signing in &amp; credentials</b><small>who logs in how, and lands where</small></span></a></li>
    <li><a href="#verify"><span class="num">3</span><span><b>How a card is checked</b><small>the one engine every desk shares</small></span></a></li>
    <li><a href="#admin"><span class="num">4</span><span><b>🏛️ University Admin</b><small>dashboard, users, integrity</small></span></a></li>
    <li><a href="#librarian"><span class="num">5</span><span><b>📚 Librarian</b><small>issue, return, notifications</small></span></a></li>
    <li><a href="#guard"><span class="num">6</span><span><b>🛡️ Guard</b><small>the phone gate app</small></span></a></li>
    <li><a href="#records"><span class="num">7</span><span><b>🗂️ Records Office</b><small>registrar, cards, revocation, audit</small></span></a></li>
    <li><a href="#student"><span class="num">8</span><span><b>🎓 Student Pass</b><small>your card is your login</small></span></a></li>
    <li><a href="#fests"><span class="num">9</span><span><b>🎪 Fests &amp; Events</b><small>guards, coordinators, regularisation</small></span></a></li>
    <li><a href="#chain"><span class="num">10</span><span><b>⛓ The activity record</b><small>how one action reaches every screen</small></span></a></li>
    <li><a href="#matrix"><span class="num">11</span><span><b>Who can do what</b><small>the full permissions matrix</small></span></a></li>
    <li><a href="#demo"><span class="num">12</span><span><b>A 10-minute demo script</b><small>click-through, in order</small></span></a></li>
    <li><a href="#cards"><span class="num">13</span><span><b>Scannable demo cards</b><small>a real card — and a forged one</small></span></a></li>
    <li><a href="#notes"><span class="num">14</span><span><b>Straight answers</b><small>what is live, what needs setup</small></span></a></li>
  </ol>
</section>

<!-- ═══ 1 MAP ═══ -->
<section class="page" id="map">
  <div class="kicker">Chapter 1</div>
  <h2>The platform at a glance</h2>
  <p class="lede">Every student has one university-issued identity — a physical card whose QR code holds a credential the university has digitally signed. Five kinds of user work with that identity, each through their own screen, and everything they do lands in one shared database and one tamper-evident activity record.</p>
  ${mapDiagram}
  <div class="grid2">
    <div class="card"><h4>One identity, checked everywhere</h4><p>The gate, the library desk and the student’s own pass all verify a card with the same engine — same questions, same order, same answer.</p></div>
    <div class="card"><h4>Genuine is not the same as allowed</h4><p>A card can carry a real university signature and still be refused, because it was blocked a minute ago. Every check asks both questions.</p></div>
    <div class="card"><h4>Permissions live in the database</h4><p>Each role is enforced by row-level security inside Postgres — not just by hiding buttons. A screen that forgot to check would still be refused.</p></div>
    <div class="card"><h4>One action, every screen</h4><p>A guard’s scan appears on the admin trail, the auditor’s view, the fest roster and the student’s own history — with no integration between them.</p></div>
  </div>
</section>

<!-- ═══ 2 SIGN IN ═══ -->
<section class="page" id="signin">
  ${back}<div class="kicker">Chapter 2</div>
  <h2>Signing in &amp; credentials</h2>
  <p class="lede">Staff sign in with an email and password on ${link('/login')}; the account already knows its role, so there is no role picker. Students use a separate door, ${link('/me/sign-in')}, and have no password at all.</p>
  ${signinDiagram}
  <h3>Demo staff accounts</h3>
  <table>
    <tr><th></th><th>Role</th><th>Email</th><th>Lands on</th><th>Posted to</th></tr>
    ${creds.map(([i, r, e, p, at]) => `<tr><td style="font-size:13pt;width:22pt">${i}</td><td><b>${r}</b></td><td class="mono">${e}</td><td>${link(p)}</td><td>${at}</td></tr>`).join('')}
  </table>
  <div class="callout red"><b>Password for every staff account above:</b> <span class="mono" style="font-size:10.5pt">${esc(PASSWORD)}</span> — a live login: keep this document private and change it before sharing the system publicly. <b>Students</b> have no password: they scan their card and confirm their date of birth (<a href="#cards">demo card, Chapter 13</a>).</div>
</section>

<!-- ═══ 3 VERIFY ═══ -->
<section class="page" id="verify">
  ${back}<div class="kicker">Chapter 3</div>
  <h2>How a card is checked</h2>
  <p class="lede">Whether it is scanned at a gate, at the library desk or by the student themselves, a card goes through the same four questions, in the same order. The first three are pure mathematics against the university’s public key; the fourth is a live look-up, because a card cannot know it has been reported lost.</p>
  ${verifyDiagram}
  <div class="grid2">
    <div class="card"><h4>What the QR carries</h4><p>Student number, name, department, credential number, issue and expiry dates — and the university’s signature over all of it. Change one letter and the signature no longer matches.</p></div>
    <div class="card"><h4>What it deliberately leaves out</h4><p>No date of birth, phone, email or address. Personal details stay in the university system, which is why the date of birth works as the student’s second factor.</p></div>
    <div class="card"><h4>A typed number is weaker, and says so</h4><p>If a desk has no camera, staff can type the printed student number. It proves the number exists, not that the card is genuine — every event recorded that way is marked “no signature checked”.</p></div>
    <div class="card"><h4>Our failure is not the student’s</h4><p>If the keys or the register cannot be reached, the result is “could not check” and nothing is recorded — a network problem never becomes a rejection on a student’s history.</p></div>
  </div>
</section>

<!-- ═══ 4 ADMIN ═══ -->
<section class="page" id="admin">
  ${back}
  <div class="rolehead navy"><div class="icon">🏛️</div><div><h2>University Admin</h2><p>Runs the university’s system as a whole.</p></div><div class="login">sign in as<b>admin@demo.gbpuat.test</b>lands on /admin</div></div>
  <div class="grid2">
    <div class="card"><span class="path">${link('/admin')}</span><h4>Dashboard</h4><p>Today’s activity at a glance: scans, library events, cards issued, anything that failed.</p></div>
    <div class="card"><span class="path">${link('/admin/students')}</span><h4>Students</h4><p>The whole register; open anyone to see their cards and their complete campus history.</p></div>
    <div class="card"><span class="path">${link('/admin/cards')}</span><h4>Cards</h4><p>Issue a signed card (printable at bank-card size), block it, suspend it or reinstate it.</p></div>
    <div class="card"><span class="path">${link('/admin/verifications')}</span><h4>Verification history</h4><p>Every card check at every gate and desk, with the verdict and the reason.</p></div>
    <div class="card"><span class="path">${link('/admin/activity')}</span><h4>Activity trail</h4><p>Filter the full record by person, place, type, result or date; open any event to see its chain position.</p></div>
    <div class="card"><span class="path">${link('/admin/fests')}</span><h4>🎪 Fests &amp; events</h4><p>Create a fest, roster guards, list coordinators, regularise attendance. <a href="#fests">Full story →</a></p></div>
    <div class="card"><span class="path">${link('/admin/users')}</span><h4>Users &amp; roles</h4><p>Create staff logins, grant roles, post guards and librarians to a location, deactivate accounts.</p></div>
    <div class="card"><span class="path">${link('/admin/locations')}</span><h4>Locations</h4><p>Gates, libraries, hostels and labs. Never deleted — history points at them — only deactivated.</p></div>
    <div class="card"><span class="path">${link('/admin/integrity')}</span><h4>Integrity</h4><p>Re-computes every fingerprint in the chain and reports UNBROKEN, or exactly where it breaks.</p></div>
    <div class="card"><h4>What an admin cannot do</h4><p>Edit or delete a past event. The database refuses it for everyone — the record is append-only by design.</p></div>
  </div>
  <h3>A card’s whole life, as the admin sees it</h3>
  ${cardLifecycle}
</section>

<!-- ═══ 5 LIBRARIAN ═══ -->
<section class="page" id="librarian">
  ${back}
  <div class="rolehead teal"><div class="icon">📚</div><div><h2>Librarian</h2><p>Verifies students in the library, issues and returns books.</p></div><div class="login">sign in as<b>neha@demo.gbpuat.test</b>lands on /library</div></div>
  <p>Identifying a student is always a <b>scan</b>, never a pick from a list — choosing a name from a menu verifies nobody. Only after the card checks out does the desk offer to issue anything.</p>
  ${libraryDiagram}
  <div class="grid2">
    <div class="card"><span class="path">${link('/library')}</span><h4>Dashboard</h4><p>Books out, overdue, today’s transactions and the most recent activity.</p></div>
    <div class="card"><span class="path">${link('/library/verify')}</span><h4>Verify identity</h4><p>Scan by camera, USB reader or typed number — with an honest verdict either way.</p></div>
    <div class="card"><span class="path">${link('/library/issue')}</span><h4>Issue a book</h4><p>Three steps: scan, choose a copy, confirm the due date. Copies can never go below zero.</p></div>
    <div class="card"><span class="path">${link('/library/return')}</span><h4>Return a book</h4><p>Scan the card, see everything that student has out, return with one tap.</p></div>
    <div class="card"><span class="path">${link('/library/books')}</span><h4>Books</h4><p>Search the catalogue by title, author, ISBN or code; filter by availability.</p></div>
    <div class="card"><span class="path">${link('/library/students')}</span><h4>Students</h4><p>Each student’s loans, overdue items and borrowing history.</p></div>
    <div class="card"><span class="path">${link('/library/transactions')}</span><h4>Transactions</h4><p>Every issue and return, filterable by status and student.</p></div>
    <div class="card"><span class="path">${link('/library/notifications')}</span><h4>Notifications</h4><p>Each email the library sent — marked SENT only after real delivery, FAILED with the reason otherwise.</p></div>
  </div>
</section>

<!-- ═══ 6 GUARD ═══ -->
<section class="page" id="guard">
  ${back}
  <div class="rolehead green"><div class="icon">🛡️</div><div><h2>Guard</h2><p>Verifies student identity at the gate, from a phone.</p></div><div class="login">sign in as<b>amit@demo.gbpuat.test</b>lands on /guard</div></div>
  <p>The gate app is built to be worked one-handed on a phone: a big scan button, an unmistakable verdict and a feed of recent clearances. It opens the camera, reads the card, and shows the result in about a second.</p>
  <div class="grid2">
    <div class="card"><h4>🏠 Home</h4><p>Greeting, today’s counts (scanned, approved, denied) and the live clearance feed — read from the real record, not invented.</p></div>
    <div class="card"><h4>📷 Scan</h4><p>Full-screen camera with torch, or manual entry. A verifying overlay, then the verdict.</p></div>
    <div class="card"><h4>✅ Verdict screen</h4><p>Green VALID with the student’s details for photo comparison — or red FORGED, EXPIRED or BLOCKED with what to do next.</p></div>
    <div class="card"><h4>🕘 History</h4><p>Searchable list of this guard’s scans, filterable to verified or denied.</p></div>
    <div class="card"><h4>🪪 Profile</h4><p>The gate they are posted to (set by an admin) and their duty lane.</p></div>
    <div class="card"><h4>🎪 Event duty</h4><p>During a fest shift, a purple banner shows the fest and post, with one-tap <b>Call</b> buttons for each coordinator — and every scan counts as fest attendance.</p></div>
  </div>
  <div class="callout green"><b>Recorded, every time.</b> Each scan — accepted or refused — is sealed onto the activity record at the guard’s location. That is what makes it appear on the admin trail, the auditor’s view and the student’s own history. <a href="#chain">How →</a></div>
  <div class="callout"><b>Try it with this document:</b> sign in as the guard, tap scan, and point the phone at the cards in <a href="#cards">Chapter 13</a> — one passes, one is caught as forged.</div>
</section>

<!-- ═══ 7 RECORDS ═══ -->
<section class="page" id="records">
  ${back}
  <div class="rolehead gold"><div class="icon">🗂️</div><div><h2>Records Office</h2><p>One panel, four roles, each seeing only what its job needs.</p></div><div class="login">panel<b>/records</b>four logins</div></div>
  <p>The registrar, card operator, revocation officer and auditor work on the same register, so they share one panel. What each can see and do mirrors the row-level security in the database exactly — the split is deliberately uneven.</p>
  <table>
    <tr><th>Role</th><th>Email</th><th>What they do</th><th>What they can’t</th></tr>
    <tr><td><b>🗂️ Registrar</b></td><td class="mono">registrar@…</td><td>Owns the student register: search, open any record, see the student’s full campus history.</td><td>Read credentials — card work belongs to others.</td></tr>
    <tr><td><b>🪪 Card Operator</b></td><td class="mono">cards@…</td><td>Issues and re-issues cards from a student’s record; a new card is signed and on the chain at once.</td><td>Block a card.</td></tr>
    <tr><td><b>🚫 Revocation Officer</b></td><td class="mono">revocation@…</td><td>Blocks a lost or misused card — with a reason — and reinstates it when found. Refused at every gate on the next scan.</td><td>Open student records: blocking a lost card doesn’t require knowing whose it is.</td></tr>
    <tr><td><b>🔍 Auditor</b></td><td class="mono">auditor@…</td><td>Reads the whole activity trail and the card register.</td><td>Change anything — read only.</td></tr>
  </table>
  <div class="grid2">
    <div class="card"><span class="path">${link('/records')}</span><h4>Student Records</h4><p>The register, searchable by name or number.</p></div>
    <div class="card"><span class="path">${link('/records/cards')}</span><h4>Cards</h4><p>Every signed credential, with block / reinstate for the revocation officer.</p></div>
    <div class="card"><span class="path">${link('/records/activity')}</span><h4>Activity Trail</h4><p>The university’s record, newest first, with chain positions.</p></div>
    <div class="card"><h4>Student record page</h4><p>Identity, cards and credentials, and a day-by-day activity timeline.</p></div>
  </div>
</section>

<!-- ═══ 8 STUDENT ═══ -->
<section class="page" id="student">
  ${back}
  <div class="rolehead violet"><div class="icon">🎓</div><div><h2>Student Pass</h2><p>Your card is your login. No password to forget.</p></div><div class="login">open<b>/me/sign-in</b>card + date of birth</div></div>
  <div class="callout blue"><b>Why two factors, and why these two.</b> A QR code can be photographed — the university says so plainly. At a gate that’s fine, because a guard compares a face with a photo. Here nobody is watching, so the card (hard to forge) is paired with the date of birth (never printed in the QR). A photo of someone else’s card is not enough. A typed number is refused outright.</div>
  <div class="grid2">
    <div class="card"><span class="path">${link('/me')}</span><h4>🪪 My Pass</h4><p>The card, with its QR, and the verdict a gate would reach <i>right now</i>. If the card has been blocked the QR is struck through — so no one walks to a gate holding a code that will be refused.</p></div>
    <div class="card"><span class="path">${link('/me/library')}</span><h4>📚 Library</h4><p>Books on loan, due dates, overdue warnings, and everything returned before.</p></div>
    <div class="card"><span class="path">${link('/me/events')}</span><h4>🎪 Events</h4><p>Live and upcoming fests with coordinator contacts — and whether each fest day was regularised for class attendance.</p></div>
    <div class="card"><span class="path">${link('/me/activity')}</span><h4>🕘 Activity</h4><p>Every gate check, library visit and card event recorded against the student, with its chain position.</p></div>
  </div>
  <h3>Built for a phone at the gate</h3>
  <ul class="can">
    <li>Dark, large, and the most important fact — <b>will this card be accepted?</b> — is the biggest thing on the screen.</li>
    <li>The pass closes itself after 30 minutes, and shows the time left. Built for borrowed phones.</li>
    <li>Plain-English refusals that say what to do next, never a stack trace.</li>
  </ul>
</section>

<!-- ═══ 9 FESTS ═══ -->
<section class="page" id="fests">
  ${back}<div class="kicker">Chapter 9</div>
  <h2>🎪 Fests &amp; Events</h2>
  <p class="lede">An administrator can run a campus fest from start to finish. The design choice that matters: <b>attendance is never typed in</b>. Each fest gets its own gate on the activity record, guards on duty scan students there, and the roster is read straight out of the tamper-evident record.</p>
  ${festDiagram}
  <div class="grid2">
    <div class="card"><h4>Guards on duty</h4><p>Pick a guard, a post (“Gate B · Main entrance”) and a shift. Refuses non-guards, double-bookings, and shifts outside the fest (±3 h for setting up).</p></div>
    <div class="card"><h4>Coordinators</h4><p>Faculty, student, staff or volunteer, with phone and email. Shown to guards on duty and to students on their pass.</p></div>
    <div class="card"><h4>Regularisation, day by day</h4><p>Approve or reject each student for each day. “Approve all pending” never overturns an existing “no”.</p></div>
    <div class="card"><h4>On-duty volunteers</h4><p>The registration-desk volunteer was never scanned — they were doing the scanning. Add them by student number; a reason is required, by the database as well as the form.</p></div>
    <div class="card"><h4>Export</h4><p>Approved days as a CSV for department attendance offices — pending and rejected rows never leave the system.</p></div>
    <div class="card"><h4>Cancel</h4><p>Retires the fest’s gate, so the database refuses further scans there even from a guard still holding a shift.</p></div>
  </div>
</section>

<!-- ═══ 10 CHAIN ═══ -->
<section class="page" id="chain">
  ${back}<div class="kicker">Chapter 10</div>
  <h2>⛓ The activity record</h2>
  <p class="lede">Every important action becomes one event answering five questions — <b>who, what, where, when, result</b>. Each event carries a fingerprint that includes the fingerprint of the one before it, so the events form a chain. Quietly editing an old record changes its fingerprint and breaks every link after it.</p>
  ${rippleDiagram}
  <div class="grid2">
    <div class="card"><h4>Tamper-evident, not tamper-proof</h4><p>The chain can’t physically stop someone with database access from editing a row — it guarantees the edit is detected. The Integrity screen re-checks all ${figures.events} events on demand.</p></div>
    <div class="card"><h4>Append-only</h4><p>Updates and deletes on the record are refused by a database trigger, for everyone, whatever their role.</p></div>
    <div class="card"><h4>Sealed in the database</h4><p>The app computes no fingerprints. One function writes every event and one trigger seals it — the gate, the library and the records office can’t disagree about what a correct record is.</p></div>
    <div class="card"><h4>Events recorded</h4><p>Identity verified · identity rejected · library entry · book issued · book returned · notification sent · card issued · card blocked.</p></div>
  </div>
</section>

<!-- ═══ 11 MATRIX ═══ -->
<section class="page" id="matrix">
  ${back}<div class="kicker">Chapter 11</div>
  <h2>Who can do what</h2>
  <p class="lede">Enforced inside the database by row-level security. A screen hides what a role can’t use as a courtesy; the database is what actually refuses it.</p>
  <table class="matrix">
    <tr><th>Capability</th><th>🏛️ Admin</th><th>📚 Librarian</th><th>🛡️ Guard</th><th>🗂️ Registrar</th><th>🪪 Card op</th><th>🚫 Revocation</th><th>🔍 Auditor</th><th>🎓 Student</th></tr>
    ${matrix.map((row) => `<tr>${row.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}
  </table>
  <p style="font-size:9pt;color:#5b6b82">✓ full access · <span class="r">read</span> view only · <b>own</b> only what that person recorded or holds · — no access</p>
</section>

<!-- ═══ 12 DEMO ═══ -->
<section class="page" id="demo">
  ${back}<div class="kicker">Chapter 12</div>
  <h2>A 10-minute demo script</h2>
  <p class="lede">Run it in this order and every step visibly changes something on another screen. Keep two browser windows open side by side — one as the admin, one as whoever is acting.</p>
  <ol class="steps">
    <li><span class="who">Admin</span>Sign in, open ${link('/admin/integrity')} — the chain reads <b>UNBROKEN</b>. Note the event count.</li>
    <li><span class="who">Guard</span>On a phone, sign in as Amit. Scan the <a href="#cards">real demo card</a> → <b>VALID</b>.</li>
    <li><span class="who">Admin</span>Refresh ${link('/admin/activity')} — Amit’s scan is already at the top.</li>
    <li><span class="who">Guard</span>Scan the <a href="#cards">forged card</a> → <b>FORGED</b>. The refusal is on the record too.</li>
    <li><span class="who">Librarian</span>Sign in as Neha → Issue Book → scan the real card → pick a title → issue. Copies drop by one.</li>
    <li><span class="who">Student</span>Open ${link('/me/sign-in')}, scan the real card, enter the date of birth → the pass shows the new loan.</li>
    <li><span class="who">Card op</span>Sign in as cards@… → open a student → <b>Issue card</b>. A new signed credential appears at once.</li>
    <li><span class="who">Revocation</span>Sign in as revocation@… → Cards → <b>Block</b> the demo card as “lost”.</li>
    <li><span class="who">Guard</span>Scan the same card again → now <b>BLOCKED</b>. The student’s pass shows the QR struck through.</li>
    <li><span class="who">Revocation</span>Reinstate the card. The next scan passes again.</li>
    <li><span class="who">Admin</span>${link('/admin/fests')} → open <b>Kisan Mela 2026</b> → roster Amit on a shift that starts now → Amit’s app shows the event banner; his scans become attendance → approve → export the CSV.</li>
    <li><span class="who">Admin</span>Back to ${link('/admin/integrity')} — more events, and the chain still reads <b>UNBROKEN</b>.</li>
  </ol>
</section>

<!-- ═══ 13 CARDS ═══ -->
<section class="page" id="cards">
  ${back}<div class="kicker">Chapter 13</div>
  <h2>Scannable demo cards</h2>
  <p class="lede">These are real credentials from the live system, printed here so you can demo without a physical card. Point the guard app, the library desk or the student pass camera at them — on screen or on paper.</p>
  <div class="idcards">
    <div class="idcard good">
      <div class="uni">GBPUAT Pantnagar · Student ID</div>
      <div class="nm">${esc(demoStudent.person.full_name)} <span class="pill ok">genuine</span></div>
      <div class="meta">${esc(demoStudent.person.student_id)} · ${esc(demoStudent.person.department ?? '')}</div>
      <div class="qr">${studentQr}</div>
      <div class="note"><b>Student pass sign-in:</b> scan this, then date of birth <b style="color:#e7c878">${esc(dob)}</b>.<br>At the gate or library desk it reads <b>VALID</b>.</div>
    </div>
    <div class="idcard bad">
      <div class="uni">GBPUAT Pantnagar · Student ID</div>
      <div class="nm">${esc(forged?.people?.full_name ?? 'Forged card')} <span class="pill bad">forged</span></div>
      <div class="meta">${esc(forged?.people?.student_id ?? '')} · altered after signing</div>
      <div class="qr">${forgedQr}</div>
      <div class="note">The bytes on this card were changed after the university signed them, so the signature no longer matches. Every desk refuses it as <b>FORGED</b> — and records the attempt.</div>
    </div>
  </div>
  <div class="grid2" style="margin-top:9mm">
    <div class="card" style="display:flex;gap:9pt;align-items:center"><div style="width:26mm;flex:0 0 26mm">${loginQr}</div><div><h4>Staff sign-in</h4><p>${link('/login')}</p></div></div>
    <div class="card" style="display:flex;gap:9pt;align-items:center"><div style="width:26mm;flex:0 0 26mm">${passQr}</div><div><h4>Student pass</h4><p>${link('/me/sign-in')}</p></div></div>
  </div>
</section>

<!-- ═══ 14 NOTES ═══ -->
<section class="page" id="notes">
  ${back}<div class="kicker">Chapter 14</div>
  <h2>Straight answers</h2>
  <p class="lede">What is fully live, what needs a setting, and what was deliberately left for later.</p>
  <h3>Live and verified</h3>
  <ul class="can">
    <li>All seven staff logins and the student pass, each landing on its own screen.</li>
    <li>Card verification at the gate, the library desk and the student pass — signature, issuer, expiry and live block check.</li>
    <li>Issue and block cards; the gate refuses a blocked card on the very next scan.</li>
    <li>Library issue and return, with loans, due dates and overdue tracking.</li>
    <li>Fests: creation, guard rosters, coordinators, attendance from the chain, regularisation and CSV export.</li>
    <li>The hash-chained activity record and its integrity check.</li>
  </ul>
  <h3>Needs one setting</h3>
  <ul class="can">
    <li><b>Email delivery</b> — add a Resend API key. Until then each notification is recorded honestly as FAILED with the reason, never as sent. Demo mail is redirected to one inbox, since the demo students’ addresses are fabricated.</li>
    <li><b>Phone camera</b> — scanning needs HTTPS. It works on the deployed site; on a local network address, use manual entry.</li>
  </ul>
  <h3>Deliberately not in this release</h3>
  <ul class="cant">
    <li>NFC and Bluetooth cards — the verification engine is built to accept them later without changes.</li>
    <li>The optional blockchain anchor — the chain is complete without it, and the gate never waits for it.</li>
    <li>A native student mobile app — the web pass covers the demo.</li>
  </ul>
  <div class="callout blue" style="margin-top:12pt"><b>Build the identity platform once. Build campus services on top of it.</b><br>Everything in this document runs on one identity, one verification engine and one record.</div>
</section>

</body></html>`;

/* ── Render ───────────────────────────────────────────────────────────── */

// Intermediates carry the demo password too, so they go to the system temp
// directory and are removed afterwards — never next to the committed script.
const work = join(tmpdir(), `gbpuat-walkthrough-${process.pid}`);
mkdirSync(work, { recursive: true });
const htmlPath = join(work, 'walkthrough.html');
writeFileSync(htmlPath, html, 'utf8');

const rawPdf = join(work, 'walkthrough.raw.pdf');
const chrome = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p)) ?? 'chrome';

execFileSync(chrome, [
  '--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--generate-pdf-document-outline',
  '--run-all-compositor-stages-before-draw', '--virtual-time-budget=4000',
  `--print-to-pdf=${rawPdf}`, pathToFileURL(htmlPath).href,
], { stdio: 'inherit' });

mkdirSync(dirname(OUT), { recursive: true });
execFileSync('python', [join(here, 'finish.py'), rawPdf, OUT], { stdio: 'inherit' });
rmSync(work, { recursive: true, force: true });
console.log(`\nWrote ${OUT}`);
