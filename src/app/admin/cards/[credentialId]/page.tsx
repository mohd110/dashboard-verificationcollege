import Link from 'next/link';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { ArrowLeft } from 'lucide-react';

import { ActionForm } from '@/components/action-form';
import {
  Card,
  Fact,
  Hash,
  LifecycleBadge,
  Notice,
  PageHeading,
  inputClass,
} from '@/components/ui';
import type { CompactCredential } from '@/lib/credential/profile';
import { REASON_LABELS, REVOCATION_REASONS } from '@/lib/issuance/revoke';
import { formatDateTime } from '@/lib/format';
import { planQr } from '@/lib/qr/payload';
import { requireAdminSession } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import type { CredentialState } from '@/lib/types';

import { setCardStatus } from '../actions';
import { PrintButton } from './print-button';

export const metadata = { title: 'Card · GBPUAT Smart Identity' };

type CredentialRow = {
  id: string;
  jti: string;
  claims: CompactCredential;
  compact_jws: string | null;
  credential_hash: string | null;
  issued_at: string | null;
  expires_at: string | null;
  status_list_index: number | null;
  people: { id: string; full_name: string | null; student_id: string | null } | null;
  issuer_keys: { kid: string; alg: string; status: string } | null;
  credential_status:
    | { status: CredentialState; reason_code: string | null; changed_at: string }
    | Array<{ status: CredentialState; reason_code: string | null; changed_at: string }>
    | null;
};

export default async function CardPage({
  params,
}: {
  params: Promise<{ credentialId: string }>;
}) {
  const session = await requireAdminSession();
  const { credentialId } = await params;

  const supabase = await createClient();
  const { data } = await supabase
    .from('credentials')
    .select(
      `id, jti, claims, compact_jws, credential_hash, issued_at, expires_at, status_list_index,
       people ( id, full_name, student_id ),
       issuer_keys ( kid, alg, status ),
       credential_status ( status, reason_code, changed_at )`,
    )
    .eq('id', credentialId)
    .maybeSingle();

  const credential = data as unknown as CredentialRow | null;
  if (!credential?.compact_jws) notFound();

  const claims = credential.claims;
  const statusRow = Array.isArray(credential.credential_status)
    ? credential.credential_status[0]
    : credential.credential_status;
  const state = statusRow?.status ?? 'unknown';
  const blocked = state === 'revoked' || state === 'suspended';

  const plan = planQr(credential.compact_jws);

  // Rendered as SVG on the server, so it stays sharp at print resolution. A
  // raster image at these sizes is how unreadable cards get made.
  const qrPrint = await QRCode.toString(credential.compact_jws, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 420,
  });

  // Larger, with more redundancy, for scanning off a glossy backlit screen.
  // Level Q tolerates around 25% damage against M's 15%, which buys back what
  // glare costs.
  const qrScreen = await QRCode.toString(credential.compact_jws, {
    type: 'svg',
    errorCorrectionLevel: 'Q',
    margin: 3,
    width: 640,
  });

  const expiry = new Date(claims.exp * 1000);
  const expiryLabel = `${String(expiry.getUTCMonth() + 1).padStart(2, '0')} / ${expiry.getUTCFullYear()}`;

  return (
    <>
      <div className="no-print">
        <PageHeading
          title={claims.nm}
          description={`Card ${claims.sq} · ${claims.sn} · ${claims.dp}`}
          action={
            <>
              {credential.people ? (
                <Link
                  href={`/admin/students/${credential.people.id}`}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-mid hover:underline"
                >
                  <ArrowLeft size={14} />
                  Student profile
                </Link>
              ) : null}
              <PrintButton />
            </>
          }
        />
      </div>

      <div className="print-sheet mb-6 flex justify-center rounded-xl border border-line bg-surface py-8 shadow-card">
        {/* CR80, the size of a bank card. Printing at 100% gives the real thing. */}
        <div className="card-print flex overflow-hidden rounded-[3mm] bg-white text-ink shadow-raised">
          <div className="w-[4mm] shrink-0 bg-brand" />

          <div className="flex flex-1 items-center gap-[3mm] px-[4mm] py-[3.5mm]">
            <div className="flex h-[20mm] w-[16mm] shrink-0 items-center justify-center rounded-[1.5mm] bg-brand-light text-[8mm] font-bold text-brand">
              {claims.nm.charAt(0)}
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-[2mm] leading-tight font-bold tracking-wider text-brand uppercase">
                {session.universityName}
              </p>
              <p className="mt-[1mm] truncate text-[3.4mm] leading-tight font-bold">{claims.nm}</p>
              <p className="mt-[1mm] text-[2.2mm] leading-[1.5] text-muted">
                {claims.dp}
                <br />
                {claims.rl === 's' ? 'Student' : 'Staff'} · card {claims.sq}
                <br />
                Expires {expiryLabel}
              </p>
              <p className="mt-[1mm] font-mono text-[2.6mm] font-semibold tracking-wide">
                {claims.sn}
              </p>
            </div>

            <div
              className="h-[22mm] w-[22mm] shrink-0 [&>svg]:h-full [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: qrPrint }}
            />
          </div>
        </div>
      </div>

      <div className="no-print grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="space-y-6">
          <Card title="What is on this card" padded>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Fact label="Credential id">
                <Hash>{credential.jti}</Hash>
              </Fact>
              <Fact label="State">
                <LifecycleBadge state={state} />
                {statusRow?.reason_code ? (
                  <span className="mt-1 block text-xs text-muted">
                    {REASON_LABELS[statusRow.reason_code as keyof typeof REASON_LABELS] ??
                      statusRow.reason_code}
                    , {formatDateTime(statusRow.changed_at)}
                  </span>
                ) : null}
              </Fact>
              <Fact label="Signed by">
                <span className="font-mono text-xs">
                  {credential.issuer_keys?.kid} ({credential.issuer_keys?.alg})
                </span>
                <span className="mt-0.5 block text-xs text-muted">
                  Key status {credential.issuer_keys?.status}
                </span>
              </Fact>
              <Fact label="Status list index">
                <span className="font-mono text-xs">{credential.status_list_index ?? claims.st}</span>
              </Fact>
              <Fact label="Issued">
                {credential.issued_at ? formatDateTime(credential.issued_at) : '—'}
              </Fact>
              <Fact label="Expires">
                {credential.expires_at ? formatDateTime(credential.expires_at) : '—'}
              </Fact>
              <div className="sm:col-span-2">
                <Fact label="Credential hash">
                  <Hash>{credential.credential_hash}</Hash>
                </Fact>
              </div>
              <div className="sm:col-span-2">
                <Fact label="QR">
                  Version {plan.version}, {plan.length} characters, {plan.moduleMillimetres} mm per
                  module printed at 30 mm.
                </Fact>
              </div>
            </dl>
          </Card>

          <Card title="Raw credential" padded>
            <p className="text-sm text-muted">
              Change any character of this and re-encode it as a QR code. Verification will fail,
              because the signature covers these exact bytes.
            </p>
            <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-canvas p-3 font-mono text-[0.6875rem] leading-relaxed break-all whitespace-pre-wrap text-ink-soft">
              {credential.compact_jws}
            </pre>
          </Card>
        </div>

        <div className="space-y-6">
          <Card
            title="Scan this from a screen"
            description="Higher redundancy, for glare and pixel moire"
          >
            <div className="flex justify-center px-5 py-5">
              <div
                className="w-64 max-w-full [&>svg]:h-auto [&>svg]:w-full"
                dangerouslySetInnerHTML={{ __html: qrScreen }}
              />
            </div>
            <p className="border-t border-line-soft px-5 py-3 text-xs text-muted">
              Turn screen brightness up and hold the reader about 20 cm away. A printed card reads
              better than any screen.
            </p>
          </Card>

          <Card title={blocked ? 'Reinstate this card' : 'Block this card'} padded>
            <p className="mb-4 text-sm text-muted">
              {blocked
                ? 'The verifier reads this status on every scan, so reinstating takes effect at the next presentation.'
                : 'Blocking writes to credential_status, which the verifier checks on every scan. The card stops working at the gate immediately, here and in the verification app.'}
            </p>

            <ActionForm
              action={setCardStatus}
              submitLabel={blocked ? 'Reinstate card' : 'Block card'}
              pendingLabel="Saving…"
              variant={blocked ? 'primary' : 'danger'}
              className="space-y-4"
              hidden={{
                credentialId: credential.id,
                targetStatus: blocked ? 'active' : 'revoked',
              }}
            >
              <div>
                <label htmlFor="reasonCode" className="block text-sm font-medium text-ink-soft">
                  Reason
                </label>
                <select
                  id="reasonCode"
                  name="reasonCode"
                  defaultValue={blocked ? 'replaced' : 'lost'}
                  className={`mt-1.5 ${inputClass}`}
                >
                  {REVOCATION_REASONS.map((reason) => (
                    <option key={reason} value={reason}>
                      {REASON_LABELS[reason]}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-faint">
                  Recorded against the credential and on the student&rsquo;s activity trail.
                </p>
              </div>
            </ActionForm>
          </Card>

          <Notice tone="info" title="Try to break it">
            Scan this card at the verification console. It should read VALID. Block it above and
            scan again, and the same card is refused, because the signature is still perfect and the
            status is not.
          </Notice>
        </div>
      </div>
    </>
  );
}
