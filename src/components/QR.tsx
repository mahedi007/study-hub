import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function QR({ text, size = 180, filename = 'qr.png' }: { text: string; size?: number; filename?: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    QRCode.toDataURL(text, { width: size * 2, margin: 1, errorCorrectionLevel: 'M' }).then(setSrc).catch(() => setSrc(''));
  }, [text, size]);
  if (!src) return <div style={{ width: size, height: size }} className="animate-pulse rounded bg-stone-100" />;
  return (
    <div className="flex flex-col items-center gap-2">
      <img src={src} width={size} height={size} alt="QR code" className="rounded-lg border border-stone-200 bg-white p-1" />
      <a href={src} download={filename} className="text-xs font-medium text-indigo-600 hover:underline">
        Download QR (PNG)
      </a>
    </div>
  );
}
