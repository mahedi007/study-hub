import type { Block, BlockType, PageDesign, Theme, MaterialKind } from './types';

export const FONTS: { name: string; label: string; bangla: boolean }[] = [
  { name: 'Hind Siliguri', label: 'Hind Siliguri (বাংলা)', bangla: true },
  { name: 'Noto Sans Bengali', label: 'Noto Sans Bengali (বাংলা)', bangla: true },
  { name: 'Baloo Da 2', label: 'Baloo Da 2 (বাংলা, playful)', bangla: true },
  { name: 'Tiro Bangla', label: 'Tiro Bangla (বাংলা, serif)', bangla: true },
  { name: 'Noto Serif Bengali', label: 'Noto Serif Bengali (বাংলা, serif)', bangla: true },
  { name: 'Anek Bangla', label: 'Anek Bangla (বাংলা, modern)', bangla: true },
  { name: 'Galada', label: 'Galada (বাংলা, display)', bangla: true },
  { name: 'Inter', label: 'Inter', bangla: false },
  { name: 'Poppins', label: 'Poppins', bangla: false },
  { name: 'Lora', label: 'Lora (serif)', bangla: false },
  { name: 'Nunito', label: 'Nunito (rounded)', bangla: false },
];

export const THEME_PRESETS: Record<string, Omit<Theme, 'preset'> & { label: string }> = {
  munjiba: {
    label: 'Munjiba (classic)',
    primary: '#14342c',
    accent: '#e9a928',
    bg: '#f4eee1',
    surface: '#fbf8f0',
    text: '#1d2a26',
    muted: '#5d6a64',
    font: 'Hind Siliguri',
    headingFont: 'Noto Serif Bengali',
    radius: 20,
    cardStyle: 'brutal',
    buttonStyle: 'pill',
    pattern: 'dots',
  },
  paper: {
    label: 'Paper',
    primary: '#8a4b1f',
    accent: '#d08a2c',
    bg: '#f4eee1',
    surface: '#fffaf0',
    text: '#2b2118',
    muted: '#7a6a58',
    font: 'Hind Siliguri',
    headingFont: 'Tiro Bangla',
    radius: 14,
    cardStyle: 'outline',
    buttonStyle: 'solid',
    pattern: 'none',
  },
  ocean: {
    label: 'Ocean',
    primary: '#0b6ea8',
    accent: '#16a3a3',
    bg: '#eef6fb',
    surface: '#ffffff',
    text: '#0f2433',
    muted: '#5a7385',
    font: 'Hind Siliguri',
    headingFont: 'Anek Bangla',
    radius: 16,
    cardStyle: 'shadow',
    buttonStyle: 'pill',
    pattern: 'none',
  },
  forest: {
    label: 'Forest',
    primary: '#2f6b3a',
    accent: '#a3b844',
    bg: '#f1f5ee',
    surface: '#ffffff',
    text: '#1b2a1d',
    muted: '#5f7262',
    font: 'Noto Sans Bengali',
    headingFont: 'Noto Serif Bengali',
    radius: 12,
    cardStyle: 'outline',
    buttonStyle: 'solid',
    pattern: 'none',
  },
  chalkboard: {
    label: 'Chalkboard',
    primary: '#f6d860',
    accent: '#7fd1b9',
    bg: '#1f2d27',
    surface: '#283a32',
    text: '#eef3ee',
    muted: '#a9bcb1',
    font: 'Hind Siliguri',
    headingFont: 'Baloo Da 2',
    radius: 10,
    cardStyle: 'flat',
    buttonStyle: 'outline',
    pattern: 'none',
  },
  midnight: {
    label: 'Midnight',
    primary: '#8b8cff',
    accent: '#ff8fb1',
    bg: '#11131c',
    surface: '#1b1e2b',
    text: '#eceef7',
    muted: '#9a9fb8',
    font: 'Inter',
    headingFont: 'Anek Bangla',
    radius: 18,
    cardStyle: 'flat',
    buttonStyle: 'pill',
    pattern: 'none',
  },
  rose: {
    label: 'Rose',
    primary: '#b0335c',
    accent: '#f29e4c',
    bg: '#fdf1f3',
    surface: '#ffffff',
    text: '#33141e',
    muted: '#86606b',
    font: 'Baloo Da 2',
    headingFont: 'Galada',
    radius: 20,
    cardStyle: 'shadow',
    buttonStyle: 'pill',
    pattern: 'none',
  },
  mango: {
    label: 'Mango',
    primary: '#d9480f',
    accent: '#f59f00',
    bg: '#fff8e6',
    surface: '#ffffff',
    text: '#2d1a05',
    muted: '#8a6a3f',
    font: 'Hind Siliguri',
    headingFont: 'Baloo Da 2',
    radius: 16,
    cardStyle: 'shadow',
    buttonStyle: 'solid',
    pattern: 'none',
  },
  slate: {
    label: 'Slate',
    primary: '#1f2937',
    accent: '#2563eb',
    bg: '#f8fafc',
    surface: '#ffffff',
    text: '#0f172a',
    muted: '#64748b',
    font: 'Inter',
    headingFont: 'Inter',
    radius: 8,
    cardStyle: 'outline',
    buttonStyle: 'solid',
    pattern: 'none',
  },
};

export function presetTheme(key: string): Theme {
  const p = THEME_PRESETS[key] ?? THEME_PRESETS.munjiba;
  const { label, ...rest } = p;
  return { preset: key in THEME_PRESETS ? key : 'munjiba', ...rest };
}

let counter = 0;
export function blockId(): string {
  counter += 1;
  return `b_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export const BLOCK_LABELS: Record<BlockType, { label: string; description: string }> = {
  hero: { label: 'Hero header', description: 'Big title, banner image and profile photo' },
  text: { label: 'Text / About', description: 'Formatted text with Markdown' },
  announcements: { label: 'Notice board', description: 'Your latest announcements' },
  collections: { label: 'Collections', description: 'Courses, chapters or playlists' },
  materials: { label: 'Materials library', description: 'Searchable list of your materials' },
  featured: { label: 'Featured materials', description: 'Hand-picked materials, shown large' },
  video: { label: 'Video', description: 'YouTube or Facebook video embed' },
  links: { label: 'Link buttons', description: 'Buttons to any URL' },
  contact: { label: 'Contact', description: 'Phone, WhatsApp, email, socials' },
  faq: { label: 'FAQ', description: 'Questions and answers' },
  gallery: { label: 'Photo gallery', description: 'Grid of images' },
  stats: { label: 'Stats', description: 'Number of materials, collections, views' },
  teachers: { label: 'Teachers (শিক্ষকবৃন্দ)', description: 'Teacher cards — click one to show only their materials' },
  divider: { label: 'Divider / spacer', description: 'Separate sections' },
};

export function newBlock(type: BlockType): Block {
  const id = blockId();
  const base = { id, visible: true };
  switch (type) {
    case 'hero':
      return {
        ...base,
        type,
        kicker: 'অডিও · অনুশীলন · নোট',
        title: 'পড়ার উপকরণ\nএক জায়গায়',
        highlight: 'জায়গায়',
        subtitle: 'যে ম্যাটেরিয়ালটা দরকার, বেছে নাও আর শুরু করো। নতুন নতুন অনুশীলন ও লেকচার নিয়মিত যোগ হচ্ছে।',
        style: 'editorial',
        align: 'left',
        bannerAsset: null,
        avatarAsset: null,
        ctaLabel: '',
        ctaHref: '',
        overlay: 40,
      };
    case 'text':
      return { ...base, type, heading: 'About', body: 'Write something about your class here. **Markdown** is supported.' };
    case 'announcements':
      return { ...base, type, heading: 'নোটিশ', limit: 5 };
    case 'collections':
      return { ...base, type, heading: 'কোর্স ও সংগ্রহ', ids: [], style: 'cards' };
    case 'materials':
      return { ...base, type, heading: '', subject: '', classLevel: '', kind: '', tag: '', limit: 0, showSearch: true, showFilters: true };
    case 'featured':
      return { ...base, type, heading: 'Featured', ids: [] };
    case 'video':
      return { ...base, type, heading: '', url: '' };
    case 'links':
      return { ...base, type, heading: 'Links', links: [{ label: 'Join our group', url: 'https://' }] };
    case 'contact':
      return { ...base, type, heading: 'যোগাযোগ', email: '', phone: '', whatsapp: '', facebook: '', youtube: '', address: '' };
    case 'faq':
      return { ...base, type, heading: 'FAQ', items: [{ q: 'How do I use these materials?', a: 'Open any material and read, listen or practice.' }] };
    case 'gallery':
      return { ...base, type, heading: 'Gallery', assets: [] };
    case 'stats':
      return { ...base, type, heading: '' };
    case 'teachers':
      return { ...base, type, heading: 'শিক্ষকবৃন্দ' };
    case 'divider':
      return { ...base, type, style: 'line' };
  }
}

export function defaultDesign(name = 'স্টাডি ম্যাটেরিয়ালস'): PageDesign {
  return {
    version: 2,
    theme: presetTheme('munjiba'),
    layout: { width: 'normal', materialsView: 'grid', headerStyle: 'brand' },
    seo: { title: `${name} — স্টাডি ম্যাটেরিয়ালস`, description: 'অডিও, অনুশীলন ও পড়ার উপকরণ — সব এক জায়গায়।' },
    language: 'bn',
    blocks: [newBlock('hero'), newBlock('announcements'), newBlock('teachers'), newBlock('collections'), newBlock('materials')],
  };
}

/** Make any stored JSON safe to render (fills missing fields after schema changes). */
export function normalizeDesign(raw: unknown, name?: string): PageDesign {
  const d = defaultDesign(name);
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<PageDesign>;
  let blocks = Array.isArray(r.blocks)
    ? r.blocks
        .filter((b): b is Block => !!b && typeof b === 'object' && typeof (b as Block).type === 'string' && (b as Block).type in BLOCK_LABELS)
        .map((b) => ({ ...newBlock(b.type), ...b }) as Block)
    : d.blocks;
  // Designs saved before the single home page get a teachers section above the materials list once.
  if ((r.version ?? 1) < 2 && !blocks.some((b) => b.type === 'teachers')) {
    const at = blocks.findIndex((b) => b.type === 'materials' || b.type === 'collections');
    blocks = [...blocks];
    blocks.splice(at < 0 ? blocks.length : at, 0, newBlock('teachers'));
  }
  return {
    version: 2,
    theme: { ...d.theme, ...(r.theme ?? {}) },
    layout: { ...d.layout, ...(r.layout ?? {}) },
    seo: { ...d.seo, ...(r.seo ?? {}) },
    language: r.language === 'en' ? 'en' : 'bn',
    blocks,
  };
}

// ---------- File type helpers ----------

const EXT_KIND: Record<string, MaterialKind> = {
  pdf: 'pdf',
  doc: 'doc', docx: 'doc', odt: 'doc', rtf: 'doc',
  ppt: 'slides', pptx: 'slides', odp: 'slides',
  xls: 'sheet', xlsx: 'sheet', csv: 'sheet', ods: 'sheet',
  mp3: 'audio', wav: 'audio', m4a: 'audio', ogg: 'audio', aac: 'audio', opus: 'audio', flac: 'audio',
  mp4: 'video', webm: 'video', mov: 'video', m4v: 'video', mkv: 'video',
  jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', webp: 'image', svg: 'image', avif: 'image',
  html: 'html', htm: 'html',
  md: 'note', txt: 'note',
};

export function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

export function kindFromFileName(name: string): MaterialKind {
  return EXT_KIND[extOf(name)] ?? 'file';
}

export const MIME_BY_EXT: Record<string, string> = {
  html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
  json: 'application/json', map: 'application/json', txt: 'text/plain; charset=utf-8', md: 'text/markdown; charset=utf-8',
  xml: 'application/xml', csv: 'text/csv; charset=utf-8',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf',
  mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg', aac: 'audio/aac', opus: 'audio/opus', flac: 'audio/flac',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/mp4', mkv: 'video/x-matroska',
  pdf: 'application/pdf',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  wasm: 'application/wasm', zip: 'application/zip',
};

export function mimeFor(name: string): string {
  return MIME_BY_EXT[extOf(name)] ?? 'application/octet-stream';
}

export const KIND_LABELS: Record<MaterialKind, { en: string; bn: string }> = {
  pdf: { en: 'PDF', bn: 'পিডিএফ' },
  doc: { en: 'Document', bn: 'ডকুমেন্ট' },
  slides: { en: 'Slides', bn: 'স্লাইড' },
  sheet: { en: 'Spreadsheet', bn: 'শিট' },
  audio: { en: 'Audio', bn: 'অডিও' },
  video: { en: 'Video', bn: 'ভিডিও' },
  image: { en: 'Image', bn: 'ছবি' },
  html: { en: 'Web page', bn: 'ওয়েবপেজ' },
  embed: { en: 'Embed', bn: 'এম্বেড' },
  note: { en: 'Note', bn: 'নোট' },
  file: { en: 'File', bn: 'ফাইল' },
};

export const DEFAULT_SETTINGS = {
  siteName: 'স্টাডি ম্যাটেরিয়ালস',
  tagline: 'অডিও, অনুশীলন ও পড়ার উপকরণ — সব এক জায়গায়',
  logoAsset: null,
  defaultLanguage: 'bn' as const,
  homeMode: 'teacher' as 'teacher' | 'directory',
  homeTeacherHandle: 'munjiba',
  bannerText: '',
  maxFileMb: 0, // 0 = no limit
  defaultQuotaMb: 0, // 0 = unlimited
  footerText: '',
  brandName: 'Munjiba',
  registration: 'approval' as 'closed' | 'approval' | 'open',
};

export const KIND_ICONS: Record<MaterialKind, string> = {
  pdf: '📄',
  doc: '📝',
  slides: '📊',
  sheet: '📈',
  audio: '🎧',
  video: '🎬',
  image: '🖼️',
  html: '🧩',
  embed: '▶️',
  note: '📒',
  file: '📁',
};

export const ICON_CHOICES = ['📘', '📗', '📙', '📕', '📄', '📝', '✏️', '📚', '🎧', '🎙️', '🎬', '🧩', '🧠', '🔤', '📖', '🗣️', '🌍', '🔬', '🧮', '🎨', '🎵', '⭐', '💡', '🏆'];

export const iconFor = (m: { icon?: string; kind: MaterialKind }) => m.icon || KIND_ICONS[m.kind] || '📘';

/** Materials added in the last 7 days get a "নতুন" (new) badge. */
export const isNew = (createdAt: number) => Date.now() - createdAt < 7 * 86400000;

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
export const bnNum = (v: number | string) => String(v).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);

/** URL-safe topic slug from a title (ASCII only; Bangla-only titles fall back to "material"). */
/** Accounts made with only a username carry a placeholder email; hide it in the UI. */
export const realEmail = (email: string | null | undefined) => (email && !email.endsWith('@no-email.local') ? email : '');

export function slugify(input: string): string {
  return (
    input
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 70)
      .replace(/-+$/g, '') || 'material'
  );
}

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/;
export const topicPath = (m: { slug: string }) => `/topic/${m.slug}`;
