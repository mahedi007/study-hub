const loaded = new Set<string>(['Hind Siliguri', 'Inter']);

/** Load Google Fonts on demand for themed pages. */
export function ensureFonts(names: (string | undefined)[]) {
  const missing = [...new Set(names.filter((n): n is string => !!n && !loaded.has(n)))];
  if (!missing.length) return;
  missing.forEach((n) => loaded.add(n));
  const family = missing.map((n) => `family=${encodeURIComponent(n).replace(/%20/g, '+')}:wght@400;500;600;700`).join('&');
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?${family}&display=swap`;
  document.head.appendChild(link);
}
