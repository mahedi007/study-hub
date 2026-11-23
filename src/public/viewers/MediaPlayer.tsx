import { useEffect, useRef, useState } from 'react';
import { Music, RotateCcw, RotateCw } from 'lucide-react';

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];

/** Native audio/video with playback speed, ±10 s skip and resume-where-you-left-off. */
export default function MediaPlayer({ url, kind, id, title, poster }: { url: string; kind: 'audio' | 'video'; id: string; title: string; poster?: string }) {
  const ref = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const [speed, setSpeed] = useState(1);
  const key = `studyhub.pos.${id}`;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const saved = Number(localStorage.getItem(key) ?? 0);
    const onMeta = () => {
      if (saved > 5 && saved < el.duration - 5) el.currentTime = saved;
    };
    let last = 0;
    const onTime = () => {
      if (Math.abs(el.currentTime - last) > 3) {
        last = el.currentTime;
        try {
          localStorage.setItem(key, String(Math.floor(el.currentTime)));
        } catch {
          /* ignore */
        }
      }
    };
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('timeupdate', onTime);
    return () => {
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('timeupdate', onTime);
    };
  }, [key, url]);

  useEffect(() => {
    if (ref.current) ref.current.playbackRate = speed;
  }, [speed]);

  const skip = (s: number) => ref.current && (ref.current.currentTime = Math.max(0, ref.current.currentTime + s));

  const controls = (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
      <button onClick={() => skip(-10)} className="tp-chip" aria-label="Back 10 seconds">
        <RotateCcw className="h-4 w-4" /> 10s
      </button>
      <button onClick={() => skip(10)} className="tp-chip" aria-label="Forward 10 seconds">
        10s <RotateCw className="h-4 w-4" />
      </button>
      <span className="ml-auto flex items-center gap-1">
        {SPEEDS.map((s) => (
          <button key={s} className="tp-chip" data-active={s === speed} onClick={() => setSpeed(s)}>
            {s}×
          </button>
        ))}
      </span>
    </div>
  );

  if (kind === 'audio') {
    return (
      <div className="tp-card p-5 sm:p-8">
        <div className="mb-5 flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl" style={{ background: 'color-mix(in srgb, var(--tp-primary) 15%, transparent)', color: 'var(--tp-primary)' }}>
            <Music className="h-8 w-8" />
          </div>
          <div className="tp-h text-lg font-semibold">{title}</div>
        </div>
        <audio ref={ref} src={url} controls preload="metadata" className="w-full" />
        {controls}
      </div>
    );
  }
  return (
    <div>
      <video ref={ref} src={url} controls playsInline preload="metadata" poster={poster} className="tp-card aspect-video w-full bg-black" />
      {controls}
    </div>
  );
}
