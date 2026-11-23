import { Shuffle } from 'lucide-react';
import type { PageDesign, Theme } from '../../../shared/types';
import { FONTS, THEME_PRESETS, presetTheme } from '../../../shared/design';
import { Button, ColorInput, Field, Select, cx } from '../../components/ui';
import { ensureFonts } from '../../lib/fonts';
import { useEffect } from 'react';

function hsl(h: number, s: number, l: number) {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l / 100 - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function randomTheme(current: Theme): Theme {
  const h = Math.floor(Math.random() * 360);
  const dark = Math.random() < 0.25;
  const fonts = FONTS.filter((f) => f.bangla);
  const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
  return {
    ...current,
    preset: 'custom',
    primary: hsl(h, 65, dark ? 68 : 38),
    accent: hsl((h + 40 + Math.random() * 120) % 360, 75, dark ? 70 : 52),
    bg: dark ? hsl(h, 22, 10) : hsl(h, 45, 96),
    surface: dark ? hsl(h, 20, 15) : '#ffffff',
    text: dark ? hsl(h, 15, 92) : hsl(h, 30, 12),
    muted: dark ? hsl(h, 10, 65) : hsl(h, 12, 42),
    font: pick(fonts).name,
    headingFont: pick(fonts).name,
    radius: pick([6, 10, 14, 18, 22]),
    cardStyle: pick(['brutal', 'flat', 'shadow', 'outline'] as const),
    buttonStyle: pick(['solid', 'outline', 'pill'] as const),
    pattern: pick(['dots', 'grid', 'none'] as const),
  };
}

export function ThemePanel({ design, onChange }: { design: PageDesign; onChange: (d: PageDesign, coalesce?: string) => void }) {
  const t = design.theme;
  const setTheme = (patch: Partial<Theme>, key?: string) => onChange({ ...design, theme: { ...t, ...patch, preset: patch.preset ?? 'custom' } }, key);
  const setLayout = (patch: Partial<PageDesign['layout']>) => onChange({ ...design, layout: { ...design.layout, ...patch } });

  useEffect(() => ensureFonts(FONTS.map((f) => f.name)), []);

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Theme presets</h3>
          <Button size="sm" variant="ghost" icon={<Shuffle className="h-3.5 w-3.5" />} onClick={() => onChange({ ...design, theme: randomTheme(t) })}>
            Surprise me
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(THEME_PRESETS).map(([key, p]) => (
            <button
              key={key}
              type="button"
              onClick={() => onChange({ ...design, theme: presetTheme(key) })}
              className={cx('overflow-hidden rounded-xl border-2 text-left transition', t.preset === key ? 'border-indigo-500' : 'border-stone-200 hover:border-stone-300')}
            >
              <div className="flex h-12 items-end gap-1 p-2" style={{ background: p.bg, backgroundImage: p.pattern === 'dots' ? `radial-gradient(${p.primary}22 1px, transparent 1.2px)` : undefined, backgroundSize: '8px 8px' }}>
                <span className="h-6 w-6 rounded-full" style={{ background: p.primary }} />
                <span className="h-4 w-4 rounded-full" style={{ background: p.accent }} />
                <span className="ml-auto h-6 w-10 rounded" style={{ background: p.surface, border: `1px solid ${p.text}22` }} />
              </div>
              <div className="px-2 py-1 text-xs font-medium" style={{ fontFamily: p.headingFont }}>
                {p.label}
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Colors</h3>
        <ColorInput label="Primary (buttons, links)" value={t.primary} onChange={(v) => setTheme({ primary: v }, 'c.primary')} />
        <ColorInput label="Accent (badges, highlights)" value={t.accent} onChange={(v) => setTheme({ accent: v }, 'c.accent')} />
        <ColorInput label="Background" value={t.bg} onChange={(v) => setTheme({ bg: v }, 'c.bg')} />
        <ColorInput label="Cards" value={t.surface} onChange={(v) => setTheme({ surface: v }, 'c.surface')} />
        <ColorInput label="Text" value={t.text} onChange={(v) => setTheme({ text: v }, 'c.text')} />
        <ColorInput label="Muted text" value={t.muted} onChange={(v) => setTheme({ muted: v }, 'c.muted')} />
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Typography</h3>
        <Field label="Body font">
          <Select value={t.font} onChange={(e) => setTheme({ font: e.target.value })} style={{ fontFamily: t.font }}>
            {FONTS.map((f) => <option key={f.name} value={f.name} style={{ fontFamily: f.name }}>{f.label}</option>)}
          </Select>
        </Field>
        <Field label="Heading font">
          <Select value={t.headingFont} onChange={(e) => setTheme({ headingFont: e.target.value })} style={{ fontFamily: t.headingFont }}>
            {FONTS.map((f) => <option key={f.name} value={f.name} style={{ fontFamily: f.name }}>{f.label}</option>)}
          </Select>
        </Field>
        <div className="rounded-lg border border-stone-200 p-3" style={{ background: t.bg, color: t.text }}>
          <div style={{ fontFamily: t.headingFont }} className="text-lg font-bold">বাংলা শিরোনাম · Heading</div>
          <div style={{ fontFamily: t.font }} className="text-sm">আমার সোনার বাংলা — The quick brown fox.</div>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Shape & style</h3>
        <Field label={`Corner roundness: ${t.radius}px`}>
          <input type="range" min={0} max={28} value={t.radius} onChange={(e) => setTheme({ radius: Number(e.target.value) }, 'radius')} className="w-full accent-indigo-600" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Cards">
            <Select value={t.cardStyle} onChange={(e) => setTheme({ cardStyle: e.target.value as Theme['cardStyle'] })}>
              <option value="brutal">Ink outline + hard shadow</option>
              <option value="outline">Outlined</option>
              <option value="shadow">Shadow</option>
              <option value="flat">Flat</option>
            </Select>
          </Field>
          <Field label="Buttons">
            <Select value={t.buttonStyle} onChange={(e) => setTheme({ buttonStyle: e.target.value as Theme['buttonStyle'] })}>
              <option value="solid">Solid</option>
              <option value="pill">Pill</option>
              <option value="outline">Outline</option>
            </Select>
          </Field>
        </div>
        <Field label="Background texture">
          <Select value={t.pattern ?? 'none'} onChange={(e) => setTheme({ pattern: e.target.value as Theme['pattern'] })}>
            <option value="dots">Dotted paper</option>
            <option value="grid">Grid paper</option>
            <option value="none">Plain</option>
          </Select>
        </Field>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Layout</h3>
        <Field label="Page width">
          <Select value={design.layout.width} onChange={(e) => setLayout({ width: e.target.value as any })}>
            <option value="narrow">Narrow (reading)</option>
            <option value="normal">Normal</option>
            <option value="wide">Wide</option>
          </Select>
        </Field>
        <Field label="Materials display">
          <Select value={design.layout.materialsView} onChange={(e) => setLayout({ materialsView: e.target.value as any })}>
            <option value="grid">Grid of cards</option>
            <option value="list">List with thumbnails</option>
            <option value="compact">Compact list</option>
          </Select>
        </Field>
        <Field label="Top bar">
          <Select value={design.layout.headerStyle} onChange={(e) => setLayout({ headerStyle: e.target.value as any })}>
            <option value="brand">Simple (● name · site label)</option>
            <option value="bar">Full-width bar</option>
            <option value="floating">Floating card</option>
            <option value="none">Hidden</option>
          </Select>
        </Field>
      </section>
    </div>
  );
}
