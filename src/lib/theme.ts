import type { CSSProperties } from 'react';
import type { Theme } from '../../shared/types';

function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0.5;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

export const readableOn = (hex: string) => (luminance(hex) > 0.45 ? '#111111' : '#ffffff');
export const isDark = (hex: string) => luminance(hex) < 0.2;

export function themeStyle(t: Theme): CSSProperties {
  return {
    '--tp-primary': t.primary,
    '--tp-accent': t.accent,
    '--tp-bg': t.bg,
    '--tp-surface': t.surface,
    '--tp-text': t.text,
    '--tp-muted': t.muted,
    '--tp-radius': `${t.radius}px`,
    '--tp-font': `'${t.font}'`,
    '--tp-heading': `'${t.headingFont}'`,
    '--tp-on-primary': readableOn(t.primary),
    '--tp-border': `color-mix(in srgb, ${t.text} 16%, transparent)`,
    '--tp-ink': isDark(t.bg) ? `color-mix(in srgb, ${t.text} 55%, ${t.bg})` : t.text,
    '--tp-accent-soft': `color-mix(in srgb, ${t.accent} 38%, ${t.surface})`,
    // Headings use the primary colour on light themes (deep green on the classic theme), text colour on dark ones.
    '--tp-heading-color': !isDark(t.bg) && luminance(t.primary) < 0.12 ? t.primary : t.text,
  } as CSSProperties;
}
