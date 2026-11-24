// Types shared by the API and the React app.

export type Role = 'admin' | 'teacher';
export type Status = 'draft' | 'unlisted' | 'published';
export type MaterialKind =
  | 'pdf'
  | 'doc'
  | 'slides'
  | 'sheet'
  | 'audio'
  | 'video'
  | 'image'
  | 'html'
  | 'embed'
  | 'note'
  | 'file';

export interface User {
  id: string;
  email: string;
  name: string;
  handle: string | null;
  role: Role;
  status: 'active' | 'disabled' | 'pending';
  quota_bytes: number;
  has_password?: boolean;
  google_linked?: boolean;
  bio: string;
  avatar_asset: string | null;
  created_at: number;
  last_login_at: number | null;
  used_bytes?: number;
  material_count?: number;
}

export interface Material {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  kind: MaterialKind;
  slug: string;
  icon: string;
  audio_file: string | null;
  file_name: string | null;
  entry_path: string | null;
  mime: string | null;
  size_bytes: number;
  file_count: number;
  embed_url: string | null;
  body_md: string | null;
  subject: string;
  class_level: string;
  tags: string[];
  cover_asset: string | null;
  status: Status;
  allow_download: boolean;
  view_count: number;
  ready: boolean;
  created_at: number;
  updated_at: number;
  owner_name?: string;
  owner_email?: string;
  owner_handle?: string | null;
}

export interface Collection {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  cover_asset: string | null;
  status: Status;
  view_count: number;
  created_at: number;
  updated_at: number;
  item_count?: number;
}

export interface CollectionItem {
  material_id: string;
  section: string;
  position: number;
  material?: Material;
}

export interface ShareLink {
  id: string;
  slug: string;
  owner_id: string;
  target_type: 'material' | 'collection' | 'page';
  target_id: string;
  label: string;
  has_passcode: boolean;
  expires_at: number | null;
  active: boolean;
  allow_download: boolean | null;
  view_count: number;
  created_at: number;
  target_title?: string;
}

export interface Announcement {
  id: string;
  owner_id: string;
  title: string;
  body_md: string;
  pinned: boolean;
  expires_at: number | null;
  created_at: number;
}

export interface Asset {
  id: string;
  owner_id: string;
  mime: string;
  size_bytes: number;
  name: string;
  created_at: number;
  url: string;
}

/** Everything a viewer needs to open a material. */
export interface MaterialAccess {
  fileUrl?: string;
  downloadUrl?: string;
  bundleUrl?: string;
  audioUrl?: string;
  embedUrl?: string;
  bodyMd?: string;
}

export interface SiteSettings {
  siteName: string;
  tagline: string;
  logoAsset: string | null;
  defaultLanguage: 'bn' | 'en';
  homeMode: 'directory' | 'teacher';
  homeTeacherHandle: string;
  bannerText: string;
  maxFileMb: number;
  defaultQuotaMb: number;
  footerText: string;
  brandName: string;
  registration: 'closed' | 'approval' | 'open';
}

export interface Capabilities {
  presign: boolean;
  contentOrigin: boolean;
  google: boolean;
  maxProxyUploadBytes: number;
}

// ---------- Page designer ----------

export interface Theme {
  preset: string;
  primary: string;
  accent: string;
  bg: string;
  surface: string;
  text: string;
  muted: string;
  font: string;
  headingFont: string;
  radius: number;
  cardStyle: 'brutal' | 'flat' | 'shadow' | 'outline';
  pattern: 'dots' | 'grid' | 'none';
  buttonStyle: 'solid' | 'outline' | 'pill';
}

export interface PageLayout {
  width: 'narrow' | 'normal' | 'wide';
  materialsView: 'grid' | 'list' | 'compact';
  headerStyle: 'brand' | 'none' | 'bar' | 'floating';
}

interface BlockBase {
  id: string;
  visible: boolean;
}

export type Block =
  | (BlockBase & {
      type: 'hero';
      kicker: string;
      title: string;
      highlight: string;
      subtitle: string;
      style: 'editorial' | 'banner' | 'split' | 'minimal';
      align: 'left' | 'center';
      bannerAsset: string | null;
      avatarAsset: string | null;
      ctaLabel: string;
      ctaHref: string;
      overlay: number;
    })
  | (BlockBase & { type: 'text'; heading: string; body: string })
  | (BlockBase & { type: 'announcements'; heading: string; limit: number })
  | (BlockBase & { type: 'collections'; heading: string; ids: string[]; style: 'cards' | 'list' })
  | (BlockBase & {
      type: 'materials';
      heading: string;
      subject: string;
      classLevel: string;
      kind: string;
      tag: string;
      limit: number;
      showSearch: boolean;
      showFilters: boolean;
    })
  | (BlockBase & { type: 'featured'; heading: string; ids: string[] })
  | (BlockBase & { type: 'video'; heading: string; url: string })
  | (BlockBase & { type: 'links'; heading: string; links: { label: string; url: string }[] })
  | (BlockBase & {
      type: 'contact';
      heading: string;
      email: string;
      phone: string;
      whatsapp: string;
      facebook: string;
      youtube: string;
      address: string;
    })
  | (BlockBase & { type: 'faq'; heading: string; items: { q: string; a: string }[] })
  | (BlockBase & { type: 'gallery'; heading: string; assets: string[] })
  | (BlockBase & { type: 'stats'; heading: string })
  | (BlockBase & { type: 'teachers'; heading: string })
  | (BlockBase & { type: 'divider'; style: 'line' | 'space' | 'dots' });

export type BlockType = Block['type'];

export interface PageDesign {
  version: number;
  theme: Theme;
  layout: PageLayout;
  seo: { title: string; description: string };
  language: 'bn' | 'en';
  blocks: Block[];
}

export interface PublicTeacher {
  id: string;
  name: string;
  handle: string;
  bio: string;
  avatar_url: string | null;
}

export interface SiteTeacher extends PublicTeacher {
  material_count: number;
}

export interface SiteInfo {
  siteName: string;
  brandName: string;
  logoUrl: string | null;
}

/** Everything the single home page needs: all teachers' published content. */
export interface PublicPageData {
  site: SiteInfo;
  teachers: SiteTeacher[];
  collections: (Collection & { owner_name?: string; owner_handle?: string | null })[];
  materials: Material[];
  announcements: (Announcement & { owner_name?: string })[];
  stats: { materials: number; collections: number; views: number; teachers: number };
}
