export function toEmbedUrl(url: string): string | null {
  const u = url.trim();
  if (!u) return null;
  const yt = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{6,})/.exec(u);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vimeo = /vimeo\.com\/(\d+)/.exec(u);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  if (/facebook\.com\/.+\/videos\//.test(u) || /fb\.watch\//.test(u)) {
    return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(u)}&show_text=false`;
  }
  const drive = /drive\.google\.com\/file\/d\/([\w-]+)/.exec(u);
  if (drive) return `https://drive.google.com/file/d/${drive[1]}/preview`;
  if (/^https:\/\//.test(u)) return u;
  return null;
}
