import { useEffect, useRef, useState } from 'react';

export default function DocxViewer({ url, fallback }: { url: string; fallback: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [{ renderAsync }, res] = await Promise.all([import('docx-preview'), fetch(url)]);
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        if (cancelled || !host.current) return;
        host.current.innerHTML = '';
        await renderAsync(blob, host.current, undefined, { inWrapper: true, ignoreWidth: false, breakPages: true, experimental: true });
        if (!cancelled) setState('ok');
      } catch {
        if (!cancelled) {
          setState('error');
          fallback();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, fallback]);

  return (
    <div className="docx-host tp-card overflow-x-auto p-2" style={{ background: 'color-mix(in srgb, var(--tp-text) 7%, var(--tp-surface))' }}>
      {state === 'loading' && <div className="flex h-[50vh] items-center justify-center text-stone-500">Loading document…</div>}
      <div ref={host} />
    </div>
  );
}
