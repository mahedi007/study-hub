import { useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, RotateCw } from 'lucide-react';
import type { Lang } from '../../lib/i18n';
import { bnNum } from '../../../shared/design';

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

function clock(sec: number, lang: Lang) {
  if (!Number.isFinite(sec)) sec = 0;
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60);
  const out = `${m}:${String(s).padStart(2, '0')}`;
  return lang === 'bn' ? bnNum(out) : out;
}

function about(sec: number, lang: Lang) {
  if (!sec || !Number.isFinite(sec)) return '';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return lang === 'bn' ? `প্রায় ${bnNum(m)} মিনিট ${bnNum(s)} সেকেন্ড` : `About ${m} min ${s} s`;
}

/**
 * The dark "lecture audio" player from the original site, plus: resume where you left off,
 * keyboard-friendly controls, and a floating mini player while you scroll through the material.
 */
export default function AudioPlayer({ url, id, title, lang, sticky = true }: { url: string; id: string; title: string; lang: Lang; sticky?: boolean }) {
  const audio = useRef<HTMLAudioElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [started, setStarted] = useState(false);
  const [offscreen, setOffscreen] = useState(false);
  const key = `studyhub.pos.${id}`;

  useEffect(() => {
    const el = audio.current!;
    const saved = Number(localStorage.getItem(key) ?? 0);
    const onMeta = () => {
      setDuration(el.duration);
      if (saved > 5 && saved < el.duration - 5) {
        el.currentTime = saved;
        setTime(saved);
      }
    };
    let last = 0;
    const onTime = () => {
      setTime(el.currentTime);
      if (Math.abs(el.currentTime - last) > 3) {
        last = el.currentTime;
        try {
          localStorage.setItem(key, String(Math.floor(el.currentTime)));
        } catch {
          /* ignore */
        }
      }
    };
    const onPlay = () => {
      setPlaying(true);
      setStarted(true);
    };
    const onPause = () => setPlaying(false);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onPause);
    return () => {
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onPause);
    };
  }, [key, url]);

  useEffect(() => {
    if (audio.current) audio.current.playbackRate = speed;
  }, [speed]);

  useEffect(() => {
    if (!sticky || !card.current) return;
    const io = new IntersectionObserver(([e]) => setOffscreen(!e.isIntersecting), { threshold: 0 });
    io.observe(card.current);
    return () => io.disconnect();
  }, [sticky]);

  const toggle = () => {
    const el = audio.current!;
    if (el.paused) el.play().catch(() => undefined);
    else el.pause();
  };
  const seek = (v: number) => {
    audio.current!.currentTime = v;
    setTime(v);
  };
  const skip = (s: number) => seek(Math.max(0, Math.min(duration || 0, time + s)));
  const pct = duration ? (time / duration) * 100 : 0;
  const range = (
    <input
      type="range"
      className="tp-range"
      min={0}
      max={duration || 0}
      step={0.1}
      value={time}
      onChange={(e) => seek(Number(e.target.value))}
      style={{ ['--pct' as any]: `${pct}%` }}
      aria-label="Seek"
    />
  );

  return (
    <>
      <audio ref={audio} src={url} preload="metadata" />
      <div ref={card} className="tp-player p-5 sm:p-6">
        <div className="relative z-10 flex items-center gap-4">
          <button className="tp-play" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? <Pause className="h-6 w-6" fill="currentColor" /> : <Play className="ml-0.5 h-6 w-6" fill="currentColor" />}
          </button>
          <div className="min-w-0">
            <div className="truncate font-bold">{title}</div>
            <div className="text-sm opacity-75">{about(duration, lang)}</div>
          </div>
        </div>
        <div className="relative z-10 mt-4 flex items-center gap-3 text-xs tabular-nums opacity-90">
          <span>{clock(time, lang)}</span>
          {range}
          <span>{clock(duration, lang)}</span>
        </div>
        <div className="relative z-10 mt-4 flex flex-wrap items-center gap-2">
          <button className="tp-pchip inline-flex items-center gap-1" onClick={() => skip(-10)}>
            <RotateCcw className="h-3.5 w-3.5" /> {lang === 'bn' ? '১০ সে.' : '10s'}
          </button>
          <button className="tp-pchip inline-flex items-center gap-1" onClick={() => skip(10)}>
            {lang === 'bn' ? '১০ সে.' : '10s'} <RotateCw className="h-3.5 w-3.5" />
          </button>
          {SPEEDS.map((s) => (
            <button key={s} className="tp-pchip" data-active={s === speed} onClick={() => setSpeed(s)}>
              {lang === 'bn' ? bnNum(s) : s}×
            </button>
          ))}
        </div>
      </div>

      {sticky && started && offscreen && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div className="tp-player flex w-full max-w-md items-center gap-3 rounded-full px-3 py-2" style={{ borderRadius: 999 }}>
            <button className="tp-play relative z-10 h-10 w-10" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
              {playing ? <Pause className="h-5 w-5" fill="currentColor" /> : <Play className="ml-0.5 h-5 w-5" fill="currentColor" />}
            </button>
            <span className="relative z-10 text-xs tabular-nums">{clock(time, lang)}</span>
            <div className="relative z-10 flex-1">{range}</div>
            <span className="relative z-10 rounded-full px-2 text-xs font-bold" style={{ background: 'var(--tp-accent)', color: 'var(--tp-primary)' }}>
              {lang === 'bn' ? bnNum(speed) : speed}×
            </span>
          </div>
        </div>
      )}
    </>
  );
}
