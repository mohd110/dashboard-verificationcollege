/**
 * Pantnagar Smart ID — design tokens.
 *
 * Single source of truth, taken from
 * stitch_pantnagar_smart_identity_verifier/pantnagar_smart_id_system/DESIGN.md.
 *
 * Every colour, size and radius in the guard app comes from here. Before this
 * existed the same navy appeared as #0E294B, #001e42 and #13335f across three
 * files, which is how a UI drifts off-brand one component at a time.
 *
 * Two rules from the design brief that drive most of what follows:
 *
 *   NO SHADOWS on functional surfaces. Guards use this outdoors on a 10,000
 *   acre campus in direct sun, where soft shadows wash out into muddy grey.
 *   Hierarchy comes from high-contrast borders and tonal stepping instead.
 *
 *   NO CIRCULAR AVATARS for identity photos. A verification portrait must
 *   preserve shoulder-width and posture, exactly as a passport photo does.
 *   Circles crop away the evidence a guard is checking.
 */

export const C = {
  // Institutional navy — administrative sovereignty
  navy: '#0E294B',
  navyPrimary: '#13335F',
  navyInk: '#0D1B2A',

  // University crest sky blue — reticles, informational badges only
  sky: '#88CFF8',
  skyDeep: '#60B5E5',

  // Wheat gold from the seal — used sparingly, for accents
  wheat: '#C89D42',

  // Agricultural field green — active status, valid permissions
  green: '#1E6B38',

  // Functional validation signals. Hyper-saturated on purpose.
  verified: '#16A34A',
  verifiedSoft: '#DCFCE7',
  alert: '#DC2626',
  alertSoft: '#FEE2E2',
  alertDeep: '#8B2317',
  warn: '#D97706',
  warnSoft: '#FEF3C7',

  // Surfaces — high reflectance, glare-minimising
  canvas: '#F5F8FA',
  white: '#FFFFFF',
  tier2: '#F1F5F9',
  tint: '#EEF4FF',

  // Structure
  border: '#CBD5E1',
  borderStrong: '#475569',
  muted: '#64748B',
  mutedLight: '#94A3B8',
} as const;

/** 8pt grid. Guards may be wearing gloves; nothing is cramped. */
export const S = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
  xxl: '32px',
} as const;

/**
 * Soft structural geometry. 4px on controls, 8px on credential cards —
 * mirroring a physical CR80 smart card. Never pill-shaped for status tags:
 * they must read as inspection stamps, not consumer chips.
 */
export const R = {
  control: '4px',
  card: '8px',
  panel: '12px',
  full: '9999px',
} as const;

export const FONT = {
  /** Tall x-height, tabular numerals — for roll numbers read at 1 metre. */
  body: "'Inter', system-ui, sans-serif",
  /** Uppercase labels, status stamps, identity metadata headers. */
  label: "'IBM Plex Sans', system-ui, sans-serif",
} as const;

/** Type scale from DESIGN.md. */
export const T = {
  headlineLg: { fontSize: '30px', fontWeight: 700, lineHeight: '36px', letterSpacing: '-0.02em' },
  headlineLgMobile: { fontSize: '24px', fontWeight: 700, lineHeight: '30px', letterSpacing: '-0.015em' },
  headlineMd: { fontSize: '20px', fontWeight: 700, lineHeight: '26px', letterSpacing: '-0.01em' },
  headlineSm: { fontSize: '17px', fontWeight: 600, lineHeight: '22px' },
  bodyLg: { fontSize: '16px', fontWeight: 500, lineHeight: '24px' },
  bodyMd: { fontSize: '14px', fontWeight: 400, lineHeight: '20px' },
  bodySm: { fontSize: '12px', fontWeight: 400, lineHeight: '16px' },
  labelLg: {
    fontFamily: FONT.label, fontSize: '14px', fontWeight: 600,
    lineHeight: '18px', letterSpacing: '0.03em',
  },
  labelMd: {
    fontFamily: FONT.label, fontSize: '12px', fontWeight: 600,
    lineHeight: '16px', letterSpacing: '0.05em',
  },
  labelSm: {
    fontFamily: FONT.label, fontSize: '10px', fontWeight: 700,
    lineHeight: '12px', letterSpacing: '0.08em',
  },
  dataMono: {
    fontFamily: FONT.label, fontSize: '15px', fontWeight: 600,
    lineHeight: '20px', letterSpacing: '0.06em',
  },
} as const;

/** Minimum 48px, ideally 56px — single-tap execution at a gate, with gloves. */
export const TOUCH = { min: '48px', primary: '56px' } as const;

// ---------------------------------------------------------------------------
// Shared surface recipes
// ---------------------------------------------------------------------------

/** Tier 1 surface: white, framed by a structural border. Never a shadow. */
export const card: React.CSSProperties = {
  background: C.white,
  border: `1px solid ${C.border}`,
  borderRadius: R.panel,
};

/** Tier 2: nested inside a card, to isolate photos and data matrices. */
export const nested: React.CSSProperties = {
  background: C.tier2,
  borderRadius: R.control,
};

/**
 * An uppercase status stamp. Squared off, because a rounded pill reads as a
 * consumer badge rather than a technical inspection mark.
 */
export function stamp(tone: 'verified' | 'alert' | 'warn' | 'neutral'): React.CSSProperties {
  const palette = {
    verified: { background: C.verified, color: C.white },
    alert: { background: C.alert, color: C.white },
    warn: { background: C.warn, color: C.white },
    neutral: { background: C.tier2, color: C.borderStrong },
  }[tone];

  return {
    ...T.labelSm,
    ...palette,
    display: 'inline-flex',
    alignItems: 'center',
    gap: S.xs,
    padding: '5px 10px',
    borderRadius: R.control,
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
  };
}

/** Primary gate actuator. 56px, solid navy, zero blur. */
export function primaryButton(disabled = false): React.CSSProperties {
  return {
    ...T.labelLg,
    width: '100%',
    minHeight: TOUCH.primary,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: S.sm,
    background: disabled ? C.mutedLight : C.navy,
    color: C.white,
    border: 'none',
    borderRadius: R.control,
    textTransform: 'uppercase',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  };
}

/** Secondary: 2px outline, transparent fill, navy text. */
export const secondaryButton: React.CSSProperties = {
  ...T.labelLg,
  width: '100%',
  minHeight: TOUCH.min,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: S.sm,
  background: 'transparent',
  color: C.navy,
  border: `2px solid ${C.navy}`,
  borderRadius: R.control,
  cursor: 'pointer',
};

/** Destructive: solid crimson. */
export const dangerButton: React.CSSProperties = {
  ...T.labelLg,
  width: '100%',
  minHeight: TOUCH.min,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: S.sm,
  background: C.white,
  color: C.alert,
  border: `1px solid ${C.border}`,
  borderRadius: R.control,
  cursor: 'pointer',
};

/** A label/value row, as used on credential data sheets. */
export const fieldLabel: React.CSSProperties = {
  ...T.labelSm,
  color: C.borderStrong,
  textTransform: 'uppercase',
};

export const fieldValue: React.CSSProperties = {
  ...T.bodyLg,
  color: C.navyInk,
  fontWeight: 600,
};
