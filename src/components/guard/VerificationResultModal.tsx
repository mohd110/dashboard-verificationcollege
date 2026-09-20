'use client';

import React, { useState } from 'react';
import { Icon } from './Icon';
import type { UnifiedVerificationResponse } from '@/lib/guard/contract';
import { C, S, R, T, TOUCH, card, nested, stamp, primaryButton, dangerButton } from './tokens';

/**
 * The credential detail screen — what a guard actually acts on.
 *
 * Two things drive the design, both from DESIGN.md:
 *
 *   The verdict must be readable at arm's length in direct sun. So the status
 *   is a solid full-width band in a hyper-saturated functional colour, not a
 *   tinted card with a small icon. A guard should know the answer before they
 *   have finished raising the phone.
 *
 *   A failure must tell the guard WHAT TO DO. "Verification failed" alone
 *   leaves someone standing at a gate with a queue behind them. The failure
 *   state therefore carries an explicit numbered protocol.
 *
 * The four outcomes are deliberately distinct, because they mean different
 * things operationally: EXPIRED sends a student to the registry office,
 * ALTERED sends them to security.
 */

interface VerificationResultModalProps {
  result: UnifiedVerificationResponse;
  guardName?: string;
  guardShield?: string;
  locationName?: string;
  onDone: () => void;
  onLogEvent?: () => void;
}

type Verdict = {
  tone: 'verified' | 'alert' | 'warn';
  band: string;
  headline: string;
  subhead: string;
  detail: string;
  icon: string;
  /** What the guard should physically do next. */
  protocol?: string[];
};

function verdictFor(result: UnifiedVerificationResponse): Verdict {
  const map: Record<string, Verdict> = {
    VALID: {
      tone: 'verified',
      band: 'Entry granted · Valid pass',
      headline: 'Identity Verified',
      subhead: 'Student identity is authentic and authorised for campus entry',
      detail: '',
      icon: 'verified',
    },
    EXPIRED: {
      tone: 'warn',
      band: 'Entry withheld · Credential expired',
      headline: 'Credential Expired',
      subhead: 'This card is genuine but past its validity date',
      detail: 'The signature checks out, so the card is not a forgery — it has simply lapsed.',
      icon: 'schedule',
      protocol: [
        'Direct the student to the Registry Office for reissue.',
        'Check a physical laminated Pantnagar ID or national ID card.',
        'Record a manual gate register entry if entry is permitted.',
      ],
    },
    REVOKED: {
      tone: 'alert',
      band: 'Access disallowed · Credential cancelled',
      headline: 'Card Cancelled',
      subhead: 'This credential has been withdrawn by the university',
      detail: 'Reported lost, stolen, or the holder is no longer enrolled.',
      icon: 'block',
      protocol: [
        'Do not admit on this credential.',
        'Verify identity against a physical ID card.',
        'Refer the student to the Security Supervisor / Proctor Desk.',
      ],
    },
    SUSPENDED: {
      tone: 'warn',
      band: 'Entry withheld · Credential suspended',
      headline: 'Card Suspended',
      subhead: 'This credential is temporarily on hold',
      detail: '',
      icon: 'pause_circle',
      protocol: [
        'Do not admit until the hold is cleared.',
        'Refer the student to the Proctor Desk.',
      ],
    },
    INVALID_SIGNATURE: {
      tone: 'alert',
      band: 'Access disallowed · Gate clearance blocked',
      headline: 'Credential Altered',
      subhead: 'The details do not match the university signature',
      detail:
        'This card has been modified after issue, or was not produced by the university. Treat as a suspected forgery.',
      icon: 'gpp_bad',
      protocol: [
        'Do not admit. Retain the card if the holder co-operates.',
        'Escalate to the Security Supervisor immediately.',
        'Record the incident with time and gate lane.',
      ],
    },
    UNKNOWN_ISSUER: {
      tone: 'alert',
      band: 'Access disallowed · Unrecognised issuer',
      headline: 'Not a Pantnagar Card',
      subhead: 'This credential was not signed by this university',
      detail: 'The signing key on this card is not one GBPUAT publishes.',
      icon: 'help',
      protocol: [
        'Do not admit on this credential.',
        'Check a physical laminated ID or national ID card.',
        'Refer to the Proctor Desk if unresolved.',
      ],
    },
    KEY_REVOKED: {
      tone: 'alert',
      band: 'Access disallowed · Issuing key withdrawn',
      headline: 'Issuing Key Withdrawn',
      subhead: 'Every card signed by this key is void',
      detail: 'Contact the Security Command — a mass reissue may be in progress.',
      icon: 'key_off',
      protocol: [
        'Do not admit on this credential.',
        'Contact Security Command before processing further cards.',
      ],
    },
    MALFORMED: {
      tone: 'alert',
      band: 'Unreadable · Not a university credential',
      headline: 'Unreadable Code',
      subhead: 'This QR code is not a GBPUAT student credential',
      detail: '',
      icon: 'error',
      protocol: [
        'Ask the student to reopen the official Smart ID app.',
        'Check a physical laminated ID card.',
      ],
    },
  };

  return (
    map[result.state] ?? {
      tone: 'alert',
      band: 'Access disallowed · Verification failed',
      headline: 'Verification Failed',
      subhead: result.reason ?? 'This credential could not be verified',
      detail: '',
      icon: 'error',
      protocol: ['Check a physical ID card.', 'Refer to the Proctor Desk.'],
    }
  );
}

const TONE_COLOR = { verified: C.verified, alert: C.alert, warn: C.warn } as const;
const TONE_SOFT = { verified: C.verifiedSoft, alert: C.alertSoft, warn: C.warnSoft } as const;

export function VerificationResultModal({
  result,
  guardName = 'Amit Kumar',
  guardShield = '#SG-402',
  locationName = 'Gate 1 (Main Entrance)',
  onDone,
  onLogEvent,
}: VerificationResultModalProps) {
  const [flagged, setFlagged] = useState(false);
  const [eventLogged, setEventLogged] = useState(false);

  const verdict = verdictFor(result);
  const accent = TONE_COLOR[verdict.tone];
  const accentSoft = TONE_SOFT[verdict.tone];
  const claims = result.claims;

  const studentName =
    result.name ||
    `${result.givenName ?? ''} ${result.familyName ?? ''}`.trim() ||
    claims?.nm ||
    '—';
  const studentId = result.studentNumber || claims?.sn || '—';
  const department = result.departmentCode || claims?.dp || '—';

  const time = new Date(result.verifiedAt ?? Date.now()).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        background: C.canvas,
        color: C.navyInk,
        overflowY: 'auto',
        fontFamily: "'Inter', system-ui, sans-serif",
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {/* ---- Title bar ---- */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 2,
          background: C.white,
          borderBottom: `1px solid ${C.border}`,
          padding: `${S.md} ${S.lg}`,
          display: 'flex',
          alignItems: 'center',
          gap: S.md,
        }}
      >
        <button
          onClick={onDone}
          aria-label="Back"
          style={{
            width: TOUCH.min,
            height: TOUCH.min,
            marginLeft: '-8px',
            display: 'grid',
            placeItems: 'center',
            background: 'transparent',
            border: 'none',
            color: C.navy,
            cursor: 'pointer',
          }}
        >
          <Icon name="arrow_back" size={26} />
        </button>
        <h1 style={{ ...T.headlineMd, color: C.navy, margin: 0, flex: 1 }}>Credential Detail</h1>
        <span style={{ ...stamp('neutral'), background: C.verifiedSoft, color: C.green }}>
          {locationName.split('(')[0]!.trim()}
        </span>
      </header>

      {/* ---- Verdict band. Solid, full width, unmistakable. ---- */}
      <div
        style={{
          background: accent,
          color: C.white,
          padding: `${S.lg} ${S.lg}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: S.md,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: S.sm, minWidth: 0 }}>
          <Icon name={verdict.icon} size={24} />
          <span style={{ ...T.labelLg, textTransform: 'uppercase' }}>{verdict.band}</span>
        </span>
        <span
          style={{
            ...T.labelMd,
            background: 'rgba(0,0,0,0.22)',
            padding: '4px 10px',
            borderRadius: R.control,
            whiteSpace: 'nowrap',
          }}
        >
          {time}
        </span>
      </div>

      <div style={{ padding: S.lg, display: 'flex', flexDirection: 'column', gap: S.lg }}>
        {/* ---- Headline ---- */}
        <section style={{ textAlign: 'center', paddingTop: S.sm }}>
          <div
            style={{
              width: '88px',
              height: '88px',
              margin: '0 auto',
              display: 'grid',
              placeItems: 'center',
              background: accentSoft,
              borderRadius: R.panel,
            }}
          >
            <div
              style={{
                width: '64px',
                height: '64px',
                display: 'grid',
                placeItems: 'center',
                background: accent,
                borderRadius: R.card,
                color: C.white,
              }}
            >
              <Icon name={verdict.icon} size={38} />
            </div>
          </div>
          <h2
            style={{
              ...T.headlineLg,
              color: verdict.tone === 'verified' ? C.navy : accent,
              margin: `${S.lg} 0 ${S.sm}`,
            }}
          >
            {verdict.headline}
          </h2>
          <p style={{ ...T.bodyLg, color: C.borderStrong, margin: 0, maxWidth: '42ch', marginInline: 'auto' }}>
            {verdict.subhead}
          </p>
          {verdict.detail && (
            <p style={{ ...T.bodyMd, color: C.muted, margin: `${S.sm} auto 0`, maxWidth: '44ch' }}>
              {verdict.detail}
            </p>
          )}
        </section>

        {/* ---- Credential card. CR80 proportions, crest band, square photo. ---- */}
        <section style={{ ...card, overflow: 'hidden' }}>
          <div
            style={{
              background: C.navyPrimary,
              color: C.white,
              padding: `${S.md} ${S.lg}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: S.sm,
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: S.sm }}>
              <Icon name="school" size={20} />
              <span style={{ ...T.labelMd, textTransform: 'uppercase' }}>GBPUAT Digital ID</span>
            </span>
            <span style={stamp(verdict.tone === 'verified' ? 'verified' : 'alert')}>
              {verdict.tone === 'verified' ? 'Active Student' : result.state.replace(/_/g, ' ')}
            </span>
          </div>

          <div style={{ padding: S.lg, display: 'flex', gap: S.lg }}>
            {/*
              3:4 portrait with a solid containment ring. Never a circle —
              a verification photo must keep shoulder-width and posture.
            */}
            <div
              style={{
                width: '96px',
                height: '128px',
                flex: '0 0 96px',
                background: C.tier2,
                border: `2px solid ${C.navy}`,
                borderRadius: R.control,
                display: 'grid',
                placeItems: 'center',
                color: C.mutedLight,
              }}
            >
              <Icon name="person" size={48} />
            </div>

            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ ...T.headlineMd, color: C.navy, wordBreak: 'break-word' }}>
                {studentName}
              </div>
              <div style={{ ...T.dataMono, color: C.borderStrong, marginTop: S.xs }}>
                {studentId}
              </div>

              <div style={{ ...nested, padding: `${S.sm} ${S.md}`, marginTop: S.md }}>
                <div style={fieldLabelStyle}>Faculty / Dept</div>
                <div style={{ ...T.bodyLg, color: C.navyInk, fontWeight: 600 }}>{department}</div>
              </div>
            </div>
          </div>
        </section>

        {/* ---- What to do next. Only on a failure. ---- */}
        {verdict.protocol && (
          <section style={card}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: S.sm,
                padding: `${S.md} ${S.lg}`,
                borderBottom: `1px solid ${C.border}`,
                color: verdict.tone === 'alert' ? C.alert : C.warn,
              }}
            >
              <Icon name="shield" size={20} />
              <span style={{ ...T.labelLg, textTransform: 'uppercase' }}>
                Security Guard Protocol
              </span>
            </div>
            <ol style={{ margin: 0, padding: S.md, listStyle: 'none', display: 'grid', gap: S.sm }}>
              {verdict.protocol.map((step, index) => (
                <li
                  key={step}
                  style={{
                    display: 'flex',
                    gap: S.md,
                    alignItems: 'flex-start',
                    background: index === verdict.protocol!.length - 1 ? accentSoft : C.tint,
                    padding: S.md,
                    borderRadius: R.control,
                  }}
                >
                  <span
                    style={{
                      ...T.labelSm,
                      flex: '0 0 24px',
                      width: '24px',
                      height: '24px',
                      display: 'grid',
                      placeItems: 'center',
                      borderRadius: R.full,
                      background: index === verdict.protocol!.length - 1 ? accent : C.navy,
                      color: C.white,
                    }}
                  >
                    {index + 1}
                  </span>
                  <span style={{ ...T.bodyMd, color: C.navyInk, fontWeight: 500 }}>{step}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* ---- Audit trail ---- */}
        <section style={card}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: S.sm,
              padding: `${S.md} ${S.lg}`,
              borderBottom: `1px solid ${C.border}`,
              color: C.navy,
            }}
          >
            <Icon name="receipt_long" size={20} />
            <span style={{ ...T.labelLg, textTransform: 'uppercase' }}>Verification Audit Trail</span>
          </div>
          <dl style={{ margin: 0, padding: S.md, display: 'grid', gap: '2px' }}>
            <AuditRow icon="schedule" label="Verified at" value={`Today, ${time}`} />
            <AuditRow icon="location_on" label="Location" value={locationName} />
            <AuditRow icon="badge" label="Verified by" value={`${guardName} (${guardShield})`} />
            <AuditRow
              icon="shield"
              label="Access status"
              value={verdict.tone === 'verified' ? 'Permitted / Authorised' : 'Denied'}
              tone={accent}
              background={accentSoft}
            />
            <AuditRow
              icon="verified_user"
              label="Signature"
              value={
                result.state === 'INVALID_SIGNATURE' || result.state === 'MALFORMED'
                  ? 'Failed'
                  : 'Cryptographically valid'
              }
              tone={
                result.state === 'INVALID_SIGNATURE' || result.state === 'MALFORMED'
                  ? C.alert
                  : C.verified
              }
            />
          </dl>
        </section>

        {/* ---- Actions ---- */}
        <div style={{ display: 'grid', gap: S.md, paddingBottom: S.xxl }}>
          <button onClick={onDone} style={primaryButton()}>
            <Icon name="qr_code_scanner" size={22} />
            Done · Next scan
          </button>

          {onLogEvent && (
            <button
              onClick={() => {
                setEventLogged(true);
                onLogEvent();
              }}
              disabled={eventLogged}
              style={{
                ...dangerButton,
                color: eventLogged ? C.verified : C.navy,
                borderColor: eventLogged ? C.verified : C.border,
              }}
            >
              <Icon name={eventLogged ? 'check_circle' : 'post_add'} size={20} />
              {eventLogged ? 'Event recorded' : 'Record gate event'}
            </button>
          )}

          <button
            onClick={() => {
              setFlagged(true);
              setTimeout(() => setFlagged(false), 3000);
            }}
            style={{ ...dangerButton, color: flagged ? C.warn : C.alert }}
          >
            <Icon name={flagged ? 'check' : 'flag'} size={20} />
            {flagged ? 'Flagged to Proctor' : 'Report / flag issue to Proctor'}
          </button>
        </div>

        <p
          style={{
            ...T.labelSm,
            color: C.mutedLight,
            textAlign: 'center',
            textTransform: 'uppercase',
            paddingBottom: S.xl,
          }}
        >
          GBPUAT Campus Security Command
        </p>
      </div>
    </div>
  );
}

const fieldLabelStyle: React.CSSProperties = {
  ...T.labelSm,
  color: C.borderStrong,
  textTransform: 'uppercase',
  marginBottom: '2px',
};

function AuditRow({
  icon,
  label,
  value,
  tone,
  background,
}: {
  icon: string;
  label: string;
  value: string;
  tone?: string;
  background?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: S.md,
        padding: `${S.md} ${S.md}`,
        background: background ?? C.tier2,
        borderRadius: R.control,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: S.sm, color: C.borderStrong }}>
        <Icon name={icon} size={18} />
        <span style={{ ...T.bodyMd, color: C.borderStrong }}>{label}</span>
      </span>
      <span
        style={{
          ...T.labelLg,
          color: tone ?? C.navyInk,
          textAlign: 'right',
          textTransform: tone ? 'uppercase' : 'none',
        }}
      >
        {value}
      </span>
    </div>
  );
}
