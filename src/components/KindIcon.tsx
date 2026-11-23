import { FileText, FileType2, Presentation, Sheet, Music, Video, Image, Code2, PlaySquare, StickyNote, File } from 'lucide-react';
import type { MaterialKind } from '../../shared/types';

const ICONS: Record<MaterialKind, typeof File> = {
  pdf: FileText,
  doc: FileType2,
  slides: Presentation,
  sheet: Sheet,
  audio: Music,
  video: Video,
  image: Image,
  html: Code2,
  embed: PlaySquare,
  note: StickyNote,
  file: File,
};

export const KIND_COLORS: Record<MaterialKind, string> = {
  pdf: '#dc2626',
  doc: '#2563eb',
  slides: '#ea580c',
  sheet: '#16a34a',
  audio: '#9333ea',
  video: '#db2777',
  image: '#0891b2',
  html: '#4f46e5',
  embed: '#e11d48',
  note: '#ca8a04',
  file: '#57534e',
};

export function KindIcon({ kind, className = 'h-5 w-5', colored }: { kind: MaterialKind; className?: string; colored?: boolean }) {
  const Icon = ICONS[kind] ?? File;
  return <Icon className={className} style={colored ? { color: KIND_COLORS[kind] } : undefined} />;
}
