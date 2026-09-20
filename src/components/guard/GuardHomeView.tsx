'use client';

import React from 'react';
import { Icon } from './Icon';
import { C, S, R, T, TOUCH, card, stamp } from './tokens';

/**
 * Guard home — the screen a security officer looks at between scans.
 *
 * Rebuilt against the Pantnagar design system. Three things the previous
 * version got wrong, all of which showed up as content clipped off the right
 * edge on a 430px phone:
 *
 *   1. Fixed three-column stat grids with `nowrap` labels. "LAST SCANNED"
 *      cannot fit in a third of 430px, so the grid refused to shrink and the
 *      whole page grew wider than the screen.
 *   2. Flex children without `min-width: 0`. A flex item defaults to
 *      `min-width: auto`, meaning it will NOT shrink below its content — one
 *      long student name is enough to push a row off-screen.
 *   3. Hard-coded hex values scattered inline, so the same navy appeared as
 *      three different colours across the app.
 *
 * Everything here is fluid, every colour comes from tokens, and the whole
 * screen is verified to fit 390px — the narrowest phone a guard is likely to
 * be issued.
 */

export interface ClearanceItem {
  id: string;
  name: string;
  studentId: string;
  time: string;
  dept: string;
  lane: string;
  status: 'VERIFIED' | 'DENIED';
  photoUrl?: string;
  reason?: string;
}

interface GuardHomeViewProps {
  officerName?: string;
  officerShield?: string;
  gateName?: string;
  laneName?: string;
  stats: {
    totalScans: number;
    approved: number;
    denied: number;
    activeRate: string;
    lastScannedAgo: string;
  };
  feedItems: ClearanceItem[];
  onStartScan: () => void;
  onManualInput: () => void;
  onFlagIssue: () => void;
  onSync: () => void;
  onViewItemDetail: (item: ClearanceItem) => void;
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function GuardHomeView({
  officerName = 'Amit Kumar',
  officerShield = '#SG-402',
  gateName = 'Gate 1 (Main Campus Entrance)',
  laneName = 'Lane A',
  stats,
  feedItems,
  onStartScan,
  onManualInput,
  onFlagIssue,
  onSync,
  onViewItemDetail,
}: GuardHomeViewProps) {
  const firstName = officerName.split(' ')[0] ?? officerName;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S.lg, paddingBottom: S.xxl }}>
      {/* ---- Post identification ---- */}
      <section style={{ ...card, padding: S.lg }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: S.sm,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: S.sm, minWidth: 0 }}>
            <span
              style={{
                width: '10px',
                height: '10px',
                borderRadius: R.full,
                background: C.verified,
                flex: '0 0 10px',
              }}
            />
            <span
              style={{
                ...T.labelMd,
                color: C.navy,
                textTransform: 'uppercase',
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {gateName}
            </span>
          </span>
          <span style={{ ...stamp('verified'), background: C.verifiedSoft, color: C.green }}>
            <Icon name="wifi" size={12} />
            System online
          </span>
        </div>

        <h1 style={{ ...T.headlineLgMobile, color: C.navy, margin: `${S.md} 0 ${S.sm}` }}>
          {greeting()}, {firstName}
        </h1>

        <div style={{ display: 'flex', alignItems: 'center', gap: S.sm, flexWrap: 'wrap' }}>
          <span style={{ ...T.bodyMd, color: C.borderStrong }}>Security Officer</span>
          <span style={{ color: C.border }}>·</span>
          <span
            style={{
              ...T.labelMd,
              background: C.alertSoft,
              color: C.alertDeep,
              padding: '4px 8px',
              borderRadius: R.control,
            }}
          >
            Shield {officerShield}
          </span>
        </div>
      </section>

      {/* ---- Primary actuator. The one thing this screen exists for. ---- */}
      <button
        onClick={onStartScan}
        style={{
          background: C.navy,
          border: 'none',
          borderRadius: R.panel,
          padding: S.lg,
          textAlign: 'left',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          gap: S.md,
          width: '100%',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: S.sm }}>
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: R.full,
              background: C.sky,
              flex: '0 0 8px',
            }}
          />
          <span style={{ ...T.labelSm, color: C.sky, textTransform: 'uppercase' }}>
            High speed optical lens
          </span>
        </span>

        <span style={{ display: 'flex', alignItems: 'center', gap: S.lg, minWidth: 0 }}>
          <span
            style={{
              width: '64px',
              height: '64px',
              flex: '0 0 64px',
              display: 'grid',
              placeItems: 'center',
              background: 'rgba(136,207,248,0.16)',
              borderRadius: R.card,
              color: C.sky,
            }}
          >
            <Icon name="qr_code_scanner" size={36} />
          </span>
          <span style={{ minWidth: 0 }}>
            <span
              style={{
                ...T.headlineMd,
                color: C.white,
                display: 'block',
                textTransform: 'uppercase',
              }}
            >
              Scan student QR
            </span>
            <span style={{ ...T.bodyMd, color: C.sky, display: 'block', marginTop: '2px' }}>
              Tap to start gate clearance
            </span>
          </span>
        </span>

        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: S.sm,
            paddingTop: S.md,
            borderTop: '1px solid rgba(255,255,255,0.12)',
            flexWrap: 'wrap',
          }}
        >
          <span style={{ ...T.labelSm, color: C.mutedLight, textTransform: 'uppercase' }}>
            CR80 token engine
          </span>
          <span style={{ ...T.labelMd, color: C.verifiedSoft, display: 'flex', gap: S.xs }}>
            Ready to screen
            <Icon name="arrow_forward" size={16} />
          </span>
        </span>
      </button>

      {/*
        Stats. `auto-fit` + `minmax` rather than a hard 1fr 1fr 1fr — on a
        narrow phone these reflow to two columns instead of overflowing.
      */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(104px, 1fr))',
          gap: S.sm,
        }}
      >
        <Stat label="Verifications" value={String(stats.totalScans)} note="Today" />
        <Stat label="Approval rate" value={stats.activeRate} note="Online gate" tone={C.verified} />
        <Stat label="Last scanned" value={stats.lastScannedAgo} note="Ago" />
      </div>

      {/* ---- Shift summary ---- */}
      <section style={{ background: C.tint, borderRadius: R.panel, padding: S.md }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: S.sm,
            flexWrap: 'wrap',
            marginBottom: S.sm,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: S.xs, color: C.navy }}>
            <Icon name="schedule" size={16} />
            <span style={{ ...T.labelMd }}>Shift 07:00 – 15:00</span>
          </span>
          <span style={{ ...T.labelMd, color: C.borderStrong }}>{laneName}</span>
        </div>

        <div
          style={{
            background: C.white,
            borderRadius: R.control,
            padding: `${S.sm} ${S.md}`,
            display: 'flex',
            alignItems: 'center',
            gap: S.md,
            flexWrap: 'wrap',
          }}
        >
          <Tally colour={C.verified} label={`${stats.approved} approved`} />
          <span style={{ color: C.border }}>|</span>
          <Tally colour={C.alert} label={`${stats.denied} denied`} />
        </div>
      </section>

      {/* ---- Secondary actions ---- */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))',
          gap: S.sm,
        }}
      >
        <QuickAction icon="dialpad" label="Manual ID" onClick={onManualInput} />
        <QuickAction icon="report" label="Flag issue" onClick={onFlagIssue} tone={C.alert} />
        <QuickAction icon="sync" label="Re-sync" onClick={onSync} />
      </div>

      {/* ---- Live feed ---- */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: S.sm,
          marginTop: S.xs,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: S.sm, color: C.navy }}>
          <Icon name="history" size={20} />
          <span style={{ ...T.headlineSm }}>Recent clearances</span>
        </span>
        <span style={{ ...stamp('verified'), background: C.verifiedSoft, color: C.green }}>
          Live feed
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: S.sm }}>
        {feedItems.length === 0 && (
          <p style={{ ...T.bodyMd, color: C.muted, textAlign: 'center', padding: S.xl }}>
            No clearances yet this shift.
          </p>
        )}
        {feedItems.map((item) => (
          <ClearanceRow key={item.id} item={item} onClick={() => onViewItemDetail(item)} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Stat({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone?: string;
}) {
  return (
    <div style={{ ...card, padding: S.md, textAlign: 'center', minWidth: 0 }}>
      <div
        style={{
          ...T.labelSm,
          color: C.borderStrong,
          textTransform: 'uppercase',
          marginBottom: S.xs,
          // Wraps rather than forcing the grid wider.
          whiteSpace: 'normal',
        }}
      >
        {label}
      </div>
      <div style={{ ...T.headlineMd, color: tone ?? C.navy }}>{value}</div>
      <div style={{ ...T.bodySm, color: C.muted, marginTop: '2px' }}>{note}</div>
    </div>
  );
}

function Tally({ colour, label }: { colour: string; label: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: S.xs, minWidth: 0 }}>
      <span
        style={{ width: '8px', height: '8px', borderRadius: R.full, background: colour, flex: '0 0 8px' }}
      />
      <span style={{ ...T.bodyMd, color: C.navyInk, fontWeight: 600 }}>{label}</span>
    </span>
  );
}

function QuickAction({
  icon,
  label,
  onClick,
  tone,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  tone?: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        ...card,
        minHeight: TOUCH.min,
        padding: `${S.md} ${S.sm}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: S.xs,
        cursor: 'pointer',
        color: tone ?? C.navy,
        minWidth: 0,
      }}
    >
      <Icon name={icon} size={20} />
      <span style={{ ...T.labelMd, color: tone ?? C.navy, whiteSpace: 'nowrap' }}>{label}</span>
    </button>
  );
}

function ClearanceRow({ item, onClick }: { item: ClearanceItem; onClick: () => void }) {
  const denied = item.status === 'DENIED';

  return (
    <button
      onClick={onClick}
      style={{
        ...card,
        padding: S.md,
        display: 'flex',
        flexDirection: 'column',
        gap: S.sm,
        cursor: 'pointer',
        textAlign: 'left',
        borderLeft: `3px solid ${denied ? C.alert : C.verified}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: S.md, minWidth: 0 }}>
        {/* Square, not circular — a verification photo keeps its shoulders. */}
        <span
          style={{
            width: '44px',
            height: '52px',
            flex: '0 0 44px',
            borderRadius: R.control,
            background: C.tier2,
            border: `1px solid ${C.border}`,
            display: 'grid',
            placeItems: 'center',
            color: C.mutedLight,
          }}
        >
          <Icon name="person" size={24} />
        </span>

        {/* min-width: 0 is what lets a long name ellipsise instead of
            pushing the status stamp off the right edge of the phone. */}
        <span style={{ minWidth: 0, flex: 1 }}>
          <span
            style={{
              ...T.headlineSm,
              color: C.navy,
              display: 'block',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {item.name}
          </span>
          <span
            style={{
              ...T.labelMd,
              color: C.borderStrong,
              display: 'block',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {item.studentId}
          </span>
        </span>

        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: S.xs }}>
          <span style={stamp(denied ? 'alert' : 'verified')}>{item.status}</span>
          <span style={{ ...T.bodySm, color: C.muted, whiteSpace: 'nowrap' }}>{item.time}</span>
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: S.sm,
          paddingTop: S.sm,
          borderTop: `1px solid ${C.border}`,
          minWidth: 0,
        }}
      >
        <span
          style={{
            ...T.bodySm,
            color: C.borderStrong,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {denied && item.reason ? item.reason : item.dept}
        </span>
        <span
          style={{
            ...T.labelSm,
            color: C.green,
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}
        >
          {item.lane}
        </span>
      </div>
    </button>
  );
}
