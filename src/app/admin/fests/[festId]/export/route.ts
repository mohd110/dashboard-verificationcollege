import { NextResponse } from 'next/server';

import { getAttendance, getFest } from '@/lib/fests';
import { getStaffSession, isAdmin } from '@/lib/session';

/**
 * The regularisation list, as a spreadsheet.
 *
 * This is what actually leaves the system: a department attendance office
 * takes this file and marks those students present for the days listed. So it
 * holds approved rows only — a pending or rejected day must never reach
 * somebody who will act on it — and it says, for each row, why the student is
 * on it, so a volunteer added by hand is distinguishable from a gate scan.
 */

/** Quotes a field, and defuses a leading = + - @ so a spreadsheet will not run it. */
function cell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

const BASIS = { scanned: 'Gate scan', on_duty: 'On duty', manual: 'Manual entry' } as const;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ festId: string }> },
) {
  const session = await getStaffSession();
  if (!session || session.status !== 'active' || !isAdmin(session)) {
    return NextResponse.json({ error: 'Not permitted.' }, { status: 403 });
  }

  const { festId } = await params;
  const fest = await getFest(festId).catch(() => null);
  if (!fest) return NextResponse.json({ error: 'No such fest.' }, { status: 404 });

  const { rows } = await getAttendance(fest);
  const approved = rows.filter((row) => row.status === 'approved');

  const lines = [
    ['Date', 'Student number', 'Name', 'Department', 'Basis', 'First seen at gate', 'Note'],
    ...approved.map((row) => [
      row.day,
      row.studentNumber,
      row.fullName,
      row.department,
      BASIS[row.basis],
      row.firstSeen
        ? new Date(row.firstSeen).toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Kolkata',
          })
        : '',
      row.note,
    ]),
  ].map((line) => line.map(cell).join(','));

  const slug = fest.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  // A byte-order mark, so Excel reads the file as UTF-8 and names with
  // diacritics survive the round trip.
  return new NextResponse(`﻿${lines.join('\r\n')}\r\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${slug || 'fest'}-regularisation.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
