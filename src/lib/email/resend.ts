import 'server-only';

import { formatDate, formatDateTime } from '@/lib/library/format';

/**
 * Book notifications.
 *
 * Resend is loaded only when a key is configured, so the dependency is not on
 * the path of a demo that has no mail provider. With no key the send reports
 * an honest failure and the notification row is marked FAILED with the reason
 * on it. It is not marked SENT: the activity trail says an email reached a
 * student, and a trail that records intentions as outcomes is worse than none.
 *
 * Set RESEND_API_KEY and FROM_EMAIL to turn real delivery on. Nothing else
 * changes.
 *
 * DEMO_NOTIFICATION_EMAIL redirects every message to one inbox. The demo
 * register is fabricated and every student on it has an @northfield.example
 * address, which resolves nowhere, so without a redirect a correctly working
 * mailer would still deliver nothing. The notification row keeps the address
 * the message was *addressed* to, and the email itself says where it was
 * actually sent, so the redirect is visible rather than a quiet substitution.
 */

export interface BookIssuedEmailData {
  recipientName: string;
  recipientEmail: string;
  bookTitle: string;
  bookCode: string;
  issuedAt: string;
  dueDate: string;
  libraryName: string;
  librarianName: string;
}

export async function sendBookIssuedEmail(data: BookIssuedEmailData): Promise<{ success: boolean; error?: string }> {
  // onboarding@resend.dev is Resend's shared sender and needs no verified
  // domain, which is what makes a demo possible without owning one.
  const fromEmail = process.env.FROM_EMAIL ?? 'onboarding@resend.dev';

  const sink = process.env.DEMO_NOTIFICATION_EMAIL?.trim();
  const deliverTo = sink || data.recipientEmail;

  if (!deliverTo) {
    return { success: false, error: 'No recipient address for this student.' };
  }

  const issueDate = formatDateTime(data.issuedAt);
  const dueDate = formatDate(data.dueDate);

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Book Issued — University Smart Identity</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:#1e3a5f;padding:28px 36px;">
              <p style="margin:0;color:#94b4d4;font-size:12px;letter-spacing:1px;text-transform:uppercase;">University Smart Identity</p>
              <h1 style="margin:4px 0 0;color:#ffffff;font-size:22px;font-weight:600;">Library Management System</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px;">
              ${
                sink && sink !== data.recipientEmail
                  ? `<table width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;border-left:4px solid #2563a8;border-radius:4px;margin-bottom:24px;">
                <tr><td style="padding:12px 16px;color:#1e3a5f;font-size:12px;line-height:1.5;">
                  <strong>Demo delivery.</strong> This notification was addressed to
                  ${data.recipientEmail || 'a student with no address on file'} and redirected to this inbox.
                </td></tr>
              </table>`
                  : ''
              }
              <p style="margin:0 0 24px;color:#374151;font-size:16px;">Hello <strong>${data.recipientName}</strong>,</p>
              <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">A book has been successfully issued to your university library account.</p>
              
              <!-- Book Card -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 4px;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Book Issued</p>
                    <p style="margin:0 0 16px;color:#1e293b;font-size:18px;font-weight:600;">${data.bookTitle}</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:6px 0;color:#64748b;font-size:13px;width:140px;">Book Code</td>
                        <td style="padding:6px 0;color:#1e293b;font-size:13px;font-weight:500;">${data.bookCode}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#64748b;font-size:13px;">Issued On</td>
                        <td style="padding:6px 0;color:#1e293b;font-size:13px;font-weight:500;">${issueDate}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#64748b;font-size:13px;">Due Date</td>
                        <td style="padding:6px 0;color:#dc2626;font-size:13px;font-weight:600;">${dueDate}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#64748b;font-size:13px;">Location</td>
                        <td style="padding:6px 0;color:#1e293b;font-size:13px;font-weight:500;">${data.libraryName}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#64748b;font-size:13px;">Issued By</td>
                        <td style="padding:6px 0;color:#1e293b;font-size:13px;font-weight:500;">${data.librarianName}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Warning -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef3c7;border-left:4px solid #f59e0b;border-radius:4px;margin-bottom:24px;">
                <tr>
                  <td style="padding:14px 16px;color:#78350f;font-size:13px;line-height:1.5;">
                    <strong>Important:</strong> Please return the book by the due date to avoid late fees. If you did not perform this transaction, contact the library immediately.
                  </td>
                </tr>
              </table>

              <p style="margin:0;color:#64748b;font-size:13px;line-height:1.6;">This is an automated notification from the University Smart Identity Library Management System.</p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 36px;text-align:center;">
              <p style="margin:0;color:#94a3b8;font-size:12px;">© 2026 University Smart Identity · Library Management System</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  if (!process.env.RESEND_API_KEY) {
    return {
      success: false,
      error: 'Email is not configured on this deployment (RESEND_API_KEY is not set).',
    };
  }

  // Called over HTTP rather than through the SDK. It is one POST, and a demo
  // that has no mail provider should not have to carry the package to build.
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `University Library <${fromEmail}>`,
        to: deliverTo,
        subject: `Book Issued — ${data.bookTitle} | University Smart Identity`,
        html,
      }),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      return { success: false, error: body?.message ?? `Resend returned ${response.status}.` };
    }

    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Email send failed';
    return { success: false, error: msg };
  }
}
