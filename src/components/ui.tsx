import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Loader2, X } from 'lucide-react';
import { createPortal } from 'react-dom';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export { cx };

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';

export function Button({
  variant = 'secondary',
  size = 'md',
  loading,
  icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; loading?: boolean; icon?: ReactNode }) {
  const styles: Record<Variant, string> = {
    primary: 'bg-indigo-600 text-[#f4eee1] border-[1.5px] border-indigo-600 hover:bg-indigo-700',
    secondary: 'bg-white text-indigo-600 border-[1.5px] border-indigo-600 hover:bg-indigo-50',
    ghost: 'text-stone-700 hover:bg-stone-100',
    danger: 'bg-white text-red-700 border-[1.5px] border-red-700 hover:bg-red-50',
    soft: 'bg-gold-soft text-indigo-600 border-[1.5px] border-gold hover:bg-indigo-200',
  };
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-full font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'px-3 py-1 text-[13px]' : 'px-4 py-1.5 text-[15px]',
        styles[variant],
        className,
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx('input', props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx('input min-h-[90px]', props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx('input pr-8', props.className)} />;
}

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-stone-500">{hint}</span>}
    </label>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('rounded-2xl border-[1.5px] border-stone-900 bg-white shadow-hard-sm', className)}>{children}</div>;
}

export function Badge({ children, tone = 'stone' }: { children: ReactNode; tone?: 'stone' | 'green' | 'amber' | 'indigo' | 'red' | 'sky' }) {
  const tones = {
    stone: 'bg-stone-100 text-stone-700',
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    amber: 'bg-amber-50 text-amber-800 ring-amber-200',
    indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
    red: 'bg-red-50 text-red-700 ring-red-200',
    sky: 'bg-sky-50 text-sky-700 ring-sky-200',
  };
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ring-transparent', tones[tone])}>{children}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const tone = status === 'published' ? 'green' : status === 'unlisted' ? 'sky' : 'amber';
  const label = status === 'published' ? 'Published' : status === 'unlisted' ? 'Link only' : 'Draft';
  return <Badge tone={tone}>{label}</Badge>;
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean }) {
  return (
    <label className={cx('inline-flex cursor-pointer select-none items-center gap-2 text-sm', disabled && 'opacity-50')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx('relative h-5 w-9 rounded-full border-[1.5px] border-stone-900 transition', checked ? 'bg-indigo-600' : 'bg-stone-200')}
      >
        <span className={cx('absolute top-[1px] h-[15px] w-[15px] rounded-full transition', checked ? 'left-[17px] bg-gold' : 'left-[1px] bg-white')} />
      </button>
      {label}
    </label>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('h-5 w-5 animate-spin text-stone-400', className)} />;
}

export function PageLoader() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner className="h-7 w-7" />
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border-[1.5px] border-dashed border-stone-300 bg-white px-6 py-14 text-center">
      {icon && <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-gold-soft text-indigo-600">{icon}</div>}
      <h3 className="serif text-xl font-bold text-indigo-600">{title}</h3>
      {children && <p className="mt-1 max-w-md text-sm text-stone-500">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Progress({ value, className, tone = 'indigo' }: { value: number; className?: string; tone?: 'indigo' | 'amber' | 'red' }) {
  const color = tone === 'red' ? 'bg-red-600' : tone === 'amber' ? 'bg-amber-600' : 'bg-gold';
  return (
    <div className={cx('h-2.5 w-full overflow-hidden rounded-full bg-stone-300', className)}>
      <div className={cx('h-full rounded-full transition-all', color)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean | 'xl';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className={cx(
          'flex max-h-[92vh] w-full flex-col rounded-t-[22px] border-[1.5px] border-stone-900 bg-white shadow-hard-lg sm:rounded-[22px]',
          wide === 'xl' ? 'sm:max-w-5xl' : wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
        )}
      >
        <div className="flex items-center justify-between border-b-[1.5px] border-stone-200 px-6 py-4">
          <h2 className="serif flex items-center gap-2 text-lg font-bold text-indigo-600"><i className="inline-block h-2.5 w-2.5 rounded-full bg-gold" />{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-stone-500 hover:bg-stone-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t-[1.5px] border-stone-200 px-6 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}

// ---------- Confirm dialog ----------

type ConfirmOpts = { title: string; message?: ReactNode; confirmLabel?: string; danger?: boolean };
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal
        open={!!state}
        onClose={() => close(false)}
        title={state?.title}
        footer={
          <>
            <Button onClick={() => close(false)}>Cancel</Button>
            <Button variant={state?.danger ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>
              {state?.confirmLabel ?? 'Confirm'}
            </Button>
          </>
        }
      >
        <div className="text-sm text-stone-600">{state?.message}</div>
      </Modal>
    </ConfirmCtx.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmCtx);

// ---------- Tabs ----------

export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { id: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cx('flex gap-1 rounded-full border-[1.5px] border-stone-900 bg-white p-1', className)}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={cx('flex-1 rounded-full px-3 py-1 text-sm font-semibold transition', value === t.id ? 'bg-gold text-indigo-600' : 'text-stone-600 hover:text-indigo-600')}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ---------- Dropdown menu ----------

/**
 * Dropdown menu. The panel is rendered into <body> with fixed positioning so it is never
 * clipped by a scrolling table or card, and it flips upward when there is no room below.
 */
export function Menu({ trigger, children, align = 'right' }: { trigger: ReactNode; children: ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left?: number; right?: number; maxHeight: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const place = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const below = vh - r.bottom - 8;
    const above = r.top - 8;
    const want = panel.current?.scrollHeight ?? 260;
    const up = below < Math.min(want, 260) && above > below;
    const horiz = align === 'right' ? { right: Math.max(8, vw - r.right) } : { left: Math.max(8, r.left) };
    setPos(up ? { bottom: vh - r.top + 4, maxHeight: above, ...horiz } : { top: r.bottom + 4, maxHeight: below, ...horiz });
  };

  useLayoutEffect(() => {
    if (open) place();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !panel.current?.contains(t)) setOpen(false);
    };
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);

  return (
    <div className="relative inline-block" ref={ref}>
      <div onClick={() => setOpen((o) => !o)}>{trigger}</div>
      {open &&
        createPortal(
          <div
            ref={panel}
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', zIndex: 60, visibility: pos ? 'visible' : 'hidden', ...(pos ?? { top: 0, left: 0, maxHeight: 400 }) }}
            className="min-w-[210px] overflow-y-auto rounded-xl border-[1.5px] border-stone-900 bg-white py-1 shadow-hard"
          >
            {children}
          </div>,
          document.body,
        )}
    </div>
  );
}

export function MenuItem({ icon, children, onClick, danger }: { icon?: ReactNode; children: ReactNode; onClick?: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={cx('flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-gold-soft/60', danger ? 'text-red-700' : 'text-stone-800')}>
      {icon}
      {children}
    </button>
  );
}

export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="serif text-3xl font-bold leading-snug text-indigo-600">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[15px] text-stone-600">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2 rounded-xl border-[1.5px] border-stone-300 bg-white px-2 py-1.5">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-7 w-9 cursor-pointer rounded border-0 bg-transparent p-0" />
      <span className="flex-1 text-xs text-stone-600">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="w-[74px] rounded border border-stone-200 px-1.5 py-0.5 font-mono text-[11px]" />
    </label>
  );
}
