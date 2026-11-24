import { realEmail } from '../../shared/design';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Eye, EyeOff, Loader2 } from 'lucide-react';
import { api, ApiError } from '../lib/api';

type AuthConfig = { google: boolean; registration: 'closed' | 'approval' | 'open'; siteName: string; setupCode: boolean };

const ERRORS: Record<string, string> = {
  google_off: 'Google লগইন এখনো চালু করা হয়নি। ইমেইল ও পাসওয়ার্ড ব্যবহার করুন।',
  google_cancelled: 'Google লগইন বাতিল করা হয়েছে।',
  google_state: 'লগইন সেশন মেয়াদোত্তীর্ণ — আবার চেষ্টা করুন।',
  google_failed: 'Google থেকে লগইন যাচাই করা যায়নি — আবার চেষ্টা করুন।',
  google_unverified: 'এই Google অ্যাকাউন্টের ইমেইল যাচাই করা নেই।',
  disabled: 'এই অ্যাকাউন্টটি বন্ধ করা আছে।',
  pending: 'আপনার অ্যাকাউন্ট অনুমোদনের অপেক্ষায় আছে। অ্যাডমিন অনুমোদন দিলে লগইন করতে পারবেন।',
  not_invited: 'এই ইমেইলের কোনো অ্যাকাউন্ট নেই। অ্যাডমিনের কাছে ইনভাইট চান।',
};

export function AuthCard({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-10">
      <div className="flex w-full max-w-[420px] flex-col gap-4 rounded-[22px] border-[1.5px] border-ink bg-card p-7 shadow-hard-lg">
        <h1 className="serif flex items-center gap-2 text-2xl font-bold text-green">
          <i className="inline-block h-3 w-3 rounded-full bg-gold" />
          {title}
        </h1>
        {children}
        {footer}
        <a href="/" className="mt-1 flex items-center justify-center gap-1 text-[15px] font-semibold text-ink hover:text-green2">
          <ArrowLeft className="h-4 w-4" /> সাইটে ফিরে যাও
        </a>
      </div>
    </div>
  );
}

function FieldInput({ label, type = 'text', value, onChange, autoFocus, autoComplete, hint }: { label: string; type?: string; value: string; onChange: (v: string) => void; autoFocus?: boolean; autoComplete?: string; hint?: string }) {
  const [show, setShow] = useState(false);
  const isPw = type === 'password';
  return (
    <label className="block">
      <span className="mb-1.5 block text-[15px] font-semibold text-ink">{label}</span>
      <span className="relative block">
        <input
          type={isPw && show ? 'text' : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          className="w-full rounded-xl border-[1.5px] border-ink bg-white px-3.5 py-2.5 text-[16px] outline-none focus:border-green focus:ring-[3px] focus:ring-gold-soft"
        />
        {isPw && (
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500" aria-label={show ? 'Hide password' : 'Show password'}>
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </span>
      {hint && <span className="mt-1 block text-[13px] text-stone-500">{hint}</span>}
    </label>
  );
}

function PrimaryButton({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-full border-[1.5px] border-green bg-green px-5 py-2.5 text-[16px] font-semibold text-paper transition hover:bg-green2 disabled:opacity-60">
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

function GoogleButton({ next }: { next?: string }) {
  return (
    <a
      href={`/api/auth/google/start${next ? `?next=${encodeURIComponent(next)}` : ''}`}
      className="flex w-full items-center justify-center gap-3 rounded-full border-[1.5px] border-ink bg-white px-5 py-2.5 text-[15px] font-semibold text-ink shadow-hard-sm transition hover:-translate-x-px hover:-translate-y-px hover:shadow-hard"
    >
      <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
      </svg>
      Google দিয়ে চালিয়ে যাও
    </a>
  );
}

const Divider = () => (
  <div className="flex items-center gap-3 text-sm text-stone-500">
    <span className="h-px flex-1 bg-line" /> অথবা <span className="h-px flex-1 bg-line" />
  </div>
);

const Err = ({ children }: { children: ReactNode }) => <div className="rounded-xl bg-[#f8dcd6] px-3.5 py-2 text-[15px] font-medium text-[#b4372a]">{children}</div>;
const Ok = ({ children }: { children: ReactNode }) => <div className="rounded-xl border-[1.5px] border-ink bg-gold-soft px-3.5 py-2.5 text-[15px] leading-relaxed">{children}</div>;

export function LoginPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: cfg } = useQuery({ queryKey: ['auth-config'], queryFn: () => api<AuthConfig>('/api/auth/config') });
  const [mode, setMode] = useState<'login' | 'register'>(params.get('mode') === 'register' ? 'register' : 'login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [setupCode, setSetupCode] = useState('');
  const [needSetup, setNeedSetup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(ERRORS[params.get('error') ?? ''] ?? '');
  const [notice, setNotice] = useState('');
  const next = params.get('next') || '/admin';

  useEffect(() => {
    document.title = mode === 'login' ? 'লগইন' : 'নতুন অ্যাকাউন্ট';
  }, [mode]);

  const done = async () => {
    await qc.invalidateQueries({ queryKey: ['me'] });
    navigate(next.startsWith('/admin') ? next : '/admin', { replace: true });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'login') {
        await api('/api/auth/login', { method: 'POST', body: { email, password } });
        await done();
      } else {
        const res = await api<{ pending?: boolean; message?: string }>('/api/auth/register', { method: 'POST', body: { name, email, password, setupCode: setupCode || undefined } });
        if (res.pending) {
          setNotice(res.message ?? ERRORS.pending);
          setMode('login');
        } else await done();
      }
    } catch (err) {
      const e2 = err as ApiError;
      if (e2.data?.needSetupCode) setNeedSetup(true);
      setError(e2.message);
    } finally {
      setBusy(false);
    }
  };

  const canRegister = cfg && cfg.registration !== 'closed';
  return (
    <AuthCard
      title={mode === 'login' ? 'শিক্ষক লগইন' : 'নতুন শিক্ষক অ্যাকাউন্ট'}
      footer={
        <div className="text-center text-[15px] text-stone-600">
          {mode === 'login' ? (
            canRegister || !cfg ? (
              <>
                অ্যাকাউন্ট নেই?{' '}
                <button type="button" onClick={() => { setMode('register'); setError(''); }} className="font-bold text-green underline decoration-gold decoration-2 underline-offset-4">
                  নতুন অ্যাকাউন্ট খোলো
                </button>
              </>
            ) : (
              <span className="text-[13px]">নতুন অ্যাকাউন্টের জন্য অ্যাডমিনের কাছে ইনভাইট লিংক চাও।</span>
            )
          ) : (
            <>
              আগেই অ্যাকাউন্ট আছে?{' '}
              <button type="button" onClick={() => { setMode('login'); setError(''); }} className="font-bold text-green underline decoration-gold decoration-2 underline-offset-4">
                লগইন করো
              </button>
            </>
          )}
        </div>
      }
    >
      {notice && <Ok>{notice}</Ok>}
      {error && <Err>{error}</Err>}
      {cfg?.google && (
        <>
          <GoogleButton next={next} />
          <Divider />
        </>
      )}
      <form onSubmit={submit} className="flex flex-col gap-4">
        {mode === 'register' && <FieldInput label="তোমার নাম" value={name} onChange={setName} autoFocus autoComplete="name" />}
        {mode === 'login' ? (
          <FieldInput label="ইমেইল বা ইউজারনেম" type="text" value={email} onChange={setEmail} autoFocus autoComplete="username" />
        ) : (
          <FieldInput label="ইমেইল" type="email" value={email} onChange={setEmail} autoComplete="email" />
        )}
        <FieldInput
          label="পাসওয়ার্ড"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          hint={mode === 'register' ? 'কমপক্ষে ৮ অক্ষর' : undefined}
        />
        {mode === 'register' && needSetup && <FieldInput label="সেটআপ কোড (সুপার অ্যাডমিন)" value={setupCode} onChange={setSetupCode} hint="wrangler-এ সেট করা SETUP_CODE" />}
        <PrimaryButton busy={busy}>{mode === 'login' ? 'লগইন' : 'অ্যাকাউন্ট খোলো'}</PrimaryButton>
        {mode === 'register' && cfg?.registration === 'approval' && <p className="text-center text-[13px] text-stone-500">নতুন অ্যাকাউন্ট অ্যাডমিন অনুমোদনের পর চালু হবে।</p>}
      </form>
      {mode === 'login' && <p className="text-center text-[13px] text-stone-500">পাসওয়ার্ড ভুলে গেলে অ্যাডমিনের কাছে রিসেট লিংক চাও।</p>}
    </AuthCard>
  );
}

export function InvitePage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, error, isLoading } = useQuery({
    queryKey: ['invite', token],
    queryFn: () => api<{ kind: 'invite' | 'reset'; email: string; name: string }>(`/api/auth/token/${token}`),
    retry: false,
  });
  const { data: cfg } = useQuery({ queryKey: ['auth-config'], queryFn: () => api<AuthConfig>('/api/auth/config') });
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (data) setName(data.name);
  }, [data]);

  if (isLoading) return <AuthCard title="লোড হচ্ছে…"><Loader2 className="mx-auto h-6 w-6 animate-spin text-green" /></AuthCard>;
  if (error || !data) return <AuthCard title="লিংকটি কাজ করছে না"><Err>{(error as Error)?.message}</Err><Link to="/admin/login" className="text-center font-semibold text-green underline">লগইন পেজে যাও</Link></AuthCard>;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return setErr('দুইটি পাসওয়ার্ড মিলছে না।');
    setBusy(true);
    setErr('');
    try {
      await api(`/api/auth/token/${token}`, { method: 'POST', body: { name, password } });
      await qc.invalidateQueries({ queryKey: ['me'] });
      navigate('/admin', { replace: true });
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const invite = data.kind === 'invite';
  return (
    <AuthCard title={invite ? 'স্বাগতম! অ্যাকাউন্ট চালু করো' : 'নতুন পাসওয়ার্ড দাও'}>
      <Ok>
        {invite ? 'তোমাকে শিক্ষক হিসেবে আমন্ত্রণ জানানো হয়েছে:' : 'পাসওয়ার্ড রিসেট করা হবে:'} <b>{realEmail(data.email) || data.name}</b>
      </Ok>
      {err && <Err>{err}</Err>}
      {invite && cfg?.google && (
        <>
          <GoogleButton />
          <p className="-mt-2 text-center text-[13px] text-stone-500">এই ইমেইলের Google অ্যাকাউন্ট দিয়ে ঢুকলে পাসওয়ার্ড লাগবে না।</p>
          <Divider />
        </>
      )}
      <form onSubmit={submit} className="flex flex-col gap-4">
        {invite && <FieldInput label="তোমার নাম" value={name} onChange={setName} autoComplete="name" />}
        <FieldInput label="নতুন পাসওয়ার্ড" type="password" value={password} onChange={setPassword} autoFocus autoComplete="new-password" hint="কমপক্ষে ৮ অক্ষর" />
        <FieldInput label="আবার লেখো" type="password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        <PrimaryButton busy={busy}>{invite ? 'অ্যাকাউন্ট চালু করো' : 'পাসওয়ার্ড সেভ করো'}</PrimaryButton>
      </form>
    </AuthCard>
  );
}
