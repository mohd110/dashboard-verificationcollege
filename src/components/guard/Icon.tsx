'use client';

import React from 'react';

interface IconProps {
  name: string;
  size?: number | string;
  color?: string;
  style?: React.CSSProperties;
  className?: string;
}

/**
 * A Material Symbols glyph.
 *
 * The font is a LIGATURE font: the element contains the literal text
 * "verified", and the font substitutes a glyph for it. That has one nasty
 * failure mode — if the font does not load, the browser renders the word
 * itself. An icon meant to be 24px wide suddenly demands 70px, and a row of
 * six icons tears the layout open.
 *
 * That is not hypothetical: it happened here when a Content-Security-Policy
 * omitted fonts.gstatic.com. The page did not error; it just came apart.
 *
 * So the box is pinned to exactly `size` in both directions — a hard width and
 * height, not a minimum — and overflow is clipped. If the font ever fails
 * again the icon goes blank, which is a cosmetic problem rather than a
 * structural one.
 */
export function Icon({ name, size = 24, color, style, className }: IconProps) {
  const sizePx = typeof size === 'number' ? `${size}px` : size;

  return (
    <span
      className={`material-symbols-outlined ${className ?? ''}`}
      aria-hidden="true"
      style={{
        fontFamily: "'Material Symbols Outlined'",
        fontSize: sizePx,
        // Pinned, not minimum. A missing font must not be able to widen this.
        width: sizePx,
        height: sizePx,
        maxWidth: sizePx,
        maxHeight: sizePx,
        flex: `0 0 ${sizePx}`,
        color,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        lineHeight: 1,
        verticalAlign: 'middle',
        whiteSpace: 'nowrap',
        userSelect: 'none',
        // Keeps the glyph crisp on the high-DPI handhelds guards actually use.
        fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24",
        ...style,
      }}
    >
      {name}
    </span>
  );
}
