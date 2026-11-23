import { useState } from 'react';
import { ArrowDown, ArrowUp, ImagePlus, Plus, Trash2, X } from 'lucide-react';
import type { Block, Collection, PublicPageData } from '../../../shared/types';
import { KIND_LABELS } from '../../../shared/design';
import { Button, Field, Input, Select, Textarea, Toggle } from '../../components/ui';
import { AssetLibrary, ImagePicker, assetSrc } from '../../components/ImagePicker';
import { KindIcon } from '../../components/KindIcon';

function move<T>(arr: T[], i: number, d: number): T[] {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const copy = [...arr];
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy;
}

function HeadingField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field label="Heading">
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Leave empty to hide" />
    </Field>
  );
}

export function BlockEditor({
  block,
  onChange,
  data,
  allCollections,
}: {
  block: Block;
  onChange: (b: Block, coalesce?: string) => void;
  data: PublicPageData;
  allCollections: Collection[];
}) {
  const [gallery, setGallery] = useState(false);
  // `upd` merges a partial patch; text inputs pass a coalesce key so typing creates one undo step.
  const upd = (patch: Partial<Block>, key?: string) => onChange({ ...block, ...patch } as Block, key ? `${block.id}.${key}` : undefined);
  const b = block;

  switch (b.type) {
    case 'hero':
      return (
        <div className="space-y-3">
          <Field label="Small label above the title" hint="e.g. অডিও · অনুশীলন · নোট — leave empty to hide">
            <Input value={b.kicker ?? ''} onChange={(e) => upd({ kicker: e.target.value }, 'kicker')} />
          </Field>
          <Field label="Title" hint="Press Enter for a new line">
            <Textarea rows={2} value={b.title} onChange={(e) => upd({ title: e.target.value }, 'title')} className="serif text-lg font-bold" />
          </Field>
          <Field label="Underlined word" hint="The gold hand-drawn underline goes under this word">
            <Input value={b.highlight ?? ''} onChange={(e) => upd({ highlight: e.target.value }, 'highlight')} />
          </Field>
          <Field label="Intro text"><Textarea rows={2} value={b.subtitle} onChange={(e) => upd({ subtitle: e.target.value }, 'subtitle')} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Style">
              <Select value={b.style} onChange={(e) => upd({ style: e.target.value as any })}>
                <option value="editorial">Big headline (classic)</option>
                <option value="banner">Banner image</option>
                <option value="split">Split (text + image)</option>
                <option value="minimal">Minimal</option>
              </Select>
            </Field>
            <Field label="Alignment">
              <Select value={b.align} onChange={(e) => upd({ align: e.target.value as any })}>
                <option value="center">Center</option>
                <option value="left">Left</option>
              </Select>
            </Field>
          </div>
          {b.style !== 'editorial' && b.style !== 'minimal' && <ImagePicker label={b.style === 'split' ? 'Side image' : 'Banner image'} value={b.bannerAsset} onChange={(v) => upd({ bannerAsset: v })} />}
          <div className="flex items-end gap-3">
            <ImagePicker label="Photo" value={b.avatarAsset} onChange={(v) => upd({ avatarAsset: v })} compact />
            <p className="pb-1 text-xs text-stone-500">{b.style === 'editorial' ? 'Optional photo above the headline.' : 'Empty = your profile photo.'}</p>
          </div>
          {b.style === 'banner' && (
            <Field label={`Dark overlay: ${b.overlay}%`}>
              <input type="range" min={0} max={80} value={b.overlay} onChange={(e) => upd({ overlay: Number(e.target.value) }, 'overlay')} className="w-full accent-indigo-600" />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Button text"><Input value={b.ctaLabel} onChange={(e) => upd({ ctaLabel: e.target.value }, 'cta')} placeholder="Optional" /></Field>
            <Field label="Button link"><Input value={b.ctaHref} onChange={(e) => upd({ ctaHref: e.target.value }, 'href')} placeholder="https://…" /></Field>
          </div>
        </div>
      );

    case 'text':
      return (
        <div className="space-y-3">
          <HeadingField value={b.heading} onChange={(v) => upd({ heading: v }, 'heading')} />
          <Field label="Text (Markdown)" hint="**bold**, *italic*, # heading, - list, [link](https://…), ![image](url)">
            <Textarea rows={8} value={b.body} onChange={(e) => upd({ body: e.target.value }, 'body')} className="font-mono text-[13px]" />
          </Field>
        </div>
      );

    case 'announcements':
      return (
        <div className="space-y-3">
          <HeadingField value={b.heading} onChange={(v) => upd({ heading: v }, 'heading')} />
          <Field label="How many to show"><Input type="number" min={1} max={20} value={b.limit} onChange={(e) => upd({ limit: Number(e.target.value) || 5 })} /></Field>
          <p className="text-xs text-stone-500">Write notices on the <a href="/admin/announcements" className="text-indigo-600 underline">Notices</a> page. Pinned notices show first.</p>
        </div>
      );

    case 'collections': {
      const published = allCollections.filter((c) => c.status === 'published');
      return (
        <div className="space-y-3">
          <HeadingField value={b.heading} onChange={(v) => upd({ heading: v }, 'heading')} />
          <Field label="Style">
            <Select value={b.style} onChange={(e) => upd({ style: e.target.value as any })}>
              <option value="cards">Cards with cover</option>
              <option value="list">Compact list</option>
            </Select>
          </Field>
          <div>
            <span className="label">Which collections</span>
            <Toggle checked={!b.ids.length} onChange={(all) => upd({ ids: all ? [] : published.map((c) => c.id) })} label="All published collections" />
            {b.ids.length > 0 && (
              <ul className="mt-2 space-y-1 rounded-lg border border-stone-200 p-2">
                {published.map((c) => (
                  <li key={c.id}>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={b.ids.includes(c.id)} onChange={(e) => upd({ ids: e.target.checked ? [...b.ids, c.id] : b.ids.filter((x) => x !== c.id) })} />
                      {c.title}
                    </label>
                  </li>
                ))}
                {!published.length && <li className="text-xs text-stone-500">No published collections yet.</li>}
              </ul>
            )}
          </div>
        </div>
      );
    }

    case 'materials': {
      const subjects = [...new Set(data.materials.map((m) => m.subject).filter(Boolean))];
      const classes = [...new Set(data.materials.map((m) => m.class_level).filter(Boolean))];
      const tags = [...new Set(data.materials.flatMap((m) => m.tags))];
      return (
        <div className="space-y-3">
          <HeadingField value={b.heading} onChange={(v) => upd({ heading: v }, 'heading')} />
          <p className="text-xs text-stone-500">Show everything, or only one subject / class — add this block several times to make sections like “Class 5” and “Class 6”.</p>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Subject">
              <Select value={b.subject} onChange={(e) => upd({ subject: e.target.value })}>
                <option value="">All subjects</option>
                {subjects.map((s) => <option key={s}>{s}</option>)}
              </Select>
            </Field>
            <Field label="Class">
              <Select value={b.classLevel} onChange={(e) => upd({ classLevel: e.target.value })}>
                <option value="">All classes</option>
                {classes.map((s) => <option key={s}>{s}</option>)}
              </Select>
            </Field>
            <Field label="Type">
              <Select value={b.kind} onChange={(e) => upd({ kind: e.target.value })}>
                <option value="">All types</option>
                {Object.entries(KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v.en}</option>)}
              </Select>
            </Field>
            <Field label="Tag">
              <Select value={b.tag} onChange={(e) => upd({ tag: e.target.value })}>
                <option value="">Any tag</option>
                {tags.map((s) => <option key={s}>{s}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Max items (0 = all)"><Input type="number" min={0} value={b.limit} onChange={(e) => upd({ limit: Number(e.target.value) || 0 })} /></Field>
          <div className="flex flex-col gap-2">
            <Toggle checked={b.showSearch} onChange={(v) => upd({ showSearch: v })} label="Search box" />
            <Toggle checked={b.showFilters} onChange={(v) => upd({ showFilters: v })} label="Filter chips (subject, class, type)" />
          </div>
        </div>
      );
    }

    case 'featured': {
      const byId = new Map(data.materials.map((m) => [m.id, m]));
      const available = data.materials.filter((m) => !b.ids.includes(m.id));
      return (
        <div className="space-y-3">
          <HeadingField value={b.heading} onChange={(v) => upd({ heading: v }, 'heading')} />
          <ul className="space-y-1">
            {b.ids.map((id, i) => {
              const m = byId.get(id);
              return (
                <li key={id} className="flex items-center gap-2 rounded-lg border border-stone-200 px-2 py-1.5 text-sm">
                  {m ? <KindIcon kind={m.kind} colored className="h-4 w-4" /> : null}
                  <span className="flex-1 truncate">{m?.title ?? '(not published)'}</span>
                  <button onClick={() => upd({ ids: move(b.ids, i, -1) })} className="p-0.5 text-stone-400 hover:text-stone-700" aria-label="Move up"><ArrowUp className="h-3.5 w-3.5" /></button>
                  <button onClick={() => upd({ ids: move(b.ids, i, 1) })} className="p-0.5 text-stone-400 hover:text-stone-700" aria-label="Move down"><ArrowDown className="h-3.5 w-3.5" /></button>
                  <button onClick={() => upd({ ids: b.ids.filter((x) => x !== id) })} className="p-0.5 text-stone-400 hover:text-red-600" aria-label="Remove"><X className="h-3.5 w-3.5" /></button>
                </li>
              );
            })}
          </ul>
          <Select value="" onChange={(e) => e.target.value && upd({ ids: [...b.ids, e.target.value] })}>
            <option value="">+ Add a published material…</option>
            {available.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
          </Select>
        </div>
      );
    }

    case 'video':
      return (
        <div className="space-y-3">
          <HeadingField value={b.heading} onChange={(v) => upd({ heading: v }, 'heading')} />
          <Field label="Video link" hint="YouTube, Vimeo, Facebook or Google Drive"><Input value={b.url} onChange={(e) => upd({ url: e.target.value }, 'url')} placeholder="https://youtu.be/…" /></Field>
        </div>
      );

    case 'links':
      return (
        <div className="space-y-3">
          <HeadingField value={b.heading} onChange={(v) => upd({ heading: v }, 'heading')} />
          {b.links.map((l, i) => (
            <div key={i} className="space-y-1.5 rounded-lg border border-stone-200 p-2">
              <div className="flex gap-1.5">
                <Input value={l.label} placeholder="Button text" onChange={(e) => upd({ links: b.links.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) }, `l${i}`)} />
                <button onClick={() => upd({ links: move(b.links, i, -1) })} className="p-1 text-stone-400" aria-label="Move up"><ArrowUp className="h-4 w-4" /></button>
                <button onClick={() => upd({ links: b.links.filter((_, k) => k !== i) })} className="p-1 text-stone-400 hover:text-red-600" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
              </div>
              <Input value={l.url} placeholder="https://…" onChange={(e) => upd({ links: b.links.map((x, k) => (k === i ? { ...x, url: e.target.value } : x)) }, `u${i}`)} />
            </div>
          ))}
          <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => upd({ links: [...b.links, { label: '', url: 'https://' }] })}>Add button</Button>
        </div>
      );

    case 'contact':
      return (
        <div className="space-y-3">
          <HeadingField value={b.heading} onChange={(v) => upd({ heading: v }, 'heading')} />
          {(
            [
              ['phone', 'Phone', '+8801…'],
              ['whatsapp', 'WhatsApp number', '+8801…'],
              ['email', 'Email', 'you@example.com'],
              ['facebook', 'Facebook page link', 'https://facebook.com/…'],
              ['youtube', 'YouTube channel link', 'https://youtube.com/@…'],
              ['address', 'Address / coaching centre', ''],
            ] as const
          ).map(([k, label, ph]) => (
            <Field key={k} label={label}><Input value={(b as any)[k]} placeholder={ph} onChange={(e) => upd({ [k]: e.target.value } as any, k)} /></Field>
          ))}
        </div>
      );

    case 'faq':
      return (
        <div className="space-y-3">
          <HeadingField value={b.heading} onChange={(v) => upd({ heading: v }, 'heading')} />
          {b.items.map((it, i) => (
            <div key={i} className="space-y-1.5 rounded-lg border border-stone-200 p-2">
              <div className="flex gap-1.5">
                <Input value={it.q} placeholder="Question" onChange={(e) => upd({ items: b.items.map((x, k) => (k === i ? { ...x, q: e.target.value } : x)) }, `q${i}`)} />
                <button onClick={() => upd({ items: b.items.filter((_, k) => k !== i) })} className="p-1 text-stone-400 hover:text-red-600" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
              </div>
              <Textarea rows={2} value={it.a} placeholder="Answer" onChange={(e) => upd({ items: b.items.map((x, k) => (k === i ? { ...x, a: e.target.value } : x)) }, `a${i}`)} />
            </div>
          ))}
          <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => upd({ items: [...b.items, { q: '', a: '' }] })}>Add question</Button>
        </div>
      );

    case 'gallery':
      return (
        <div className="space-y-3">
          <HeadingField value={b.heading} onChange={(v) => upd({ heading: v }, 'heading')} />
          <div className="grid grid-cols-3 gap-2">
            {b.assets.map((id, i) => (
              <div key={id} className="group relative aspect-square overflow-hidden rounded-lg">
                <img src={assetSrc(id)} alt="" className="h-full w-full object-cover" />
                <div className="absolute inset-0 hidden items-center justify-center gap-1 bg-black/40 group-hover:flex">
                  <button onClick={() => upd({ assets: move(b.assets, i, -1) })} className="rounded bg-white p-1" aria-label="Move left"><ArrowUp className="h-3 w-3 -rotate-90" /></button>
                  <button onClick={() => upd({ assets: b.assets.filter((x) => x !== id) })} className="rounded bg-white p-1 text-red-600" aria-label="Remove"><X className="h-3 w-3" /></button>
                </div>
              </div>
            ))}
            <button onClick={() => setGallery(true)} className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-stone-300 text-xs text-stone-500 hover:border-indigo-400">
              <ImagePlus className="h-5 w-5" /> Add
            </button>
          </div>
          <AssetLibrary open={gallery} onClose={() => setGallery(false)} multiple onPickMany={(ids) => upd({ assets: [...b.assets, ...ids.filter((x) => !b.assets.includes(x))] })} />
        </div>
      );

    case 'stats':
      return (
        <div className="space-y-3">
          <HeadingField value={b.heading} onChange={(v) => upd({ heading: v }, 'heading')} />
          <p className="text-xs text-stone-500">Shows your number of published materials, collections and total views.</p>
        </div>
      );

    case 'divider':
      return (
        <Field label="Style">
          <Select value={b.style} onChange={(e) => upd({ style: e.target.value as any })}>
            <option value="line">Line</option>
            <option value="dots">Dots</option>
            <option value="space">Empty space</option>
          </Select>
        </Field>
      );
  }
}
