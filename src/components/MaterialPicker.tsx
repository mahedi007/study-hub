import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Search } from 'lucide-react';
import { adminApi } from '../lib/api';
import type { Material } from '../../shared/types';
import { Button, Input, Modal, Spinner, StatusBadge, cx } from './ui';
import { KindIcon } from './KindIcon';

export function useMyMaterials() {
  return useQuery({ queryKey: ['materials'], queryFn: () => adminApi<{ materials: Material[] }>('/materials') });
}

export function MaterialPicker({
  open,
  onClose,
  onPick,
  exclude = [],
  title = 'Add materials',
}: {
  open: boolean;
  onClose: () => void;
  onPick: (materials: Material[]) => void;
  exclude?: string[];
  title?: string;
}) {
  const { data, isLoading } = useMyMaterials();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string[]>([]);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.materials ?? []).filter(
      (m) => !exclude.includes(m.id) && (!needle || `${m.title} ${m.subject} ${m.class_level} ${m.tags.join(' ')}`.toLowerCase().includes(needle)),
    );
  }, [data, q, exclude]);

  const done = () => {
    const byId = new Map((data?.materials ?? []).map((m) => [m.id, m]));
    onPick(sel.map((id) => byId.get(id)!).filter(Boolean));
    setSel([]);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      wide
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!sel.length} onClick={done}>
            Add {sel.length || ''}
          </Button>
        </>
      }
    >
      <div className="relative mb-3">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
        <Input autoFocus placeholder="Search your materials" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
      </div>
      {isLoading ? (
        <Spinner />
      ) : !list.length ? (
        <p className="py-8 text-center text-sm text-stone-500">Nothing to add.</p>
      ) : (
        <ul className="divide-y divide-stone-100">
          {list.map((m) => {
            const on = sel.includes(m.id);
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => setSel((s) => (on ? s.filter((x) => x !== m.id) : [...s, m.id]))}
                  className={cx('flex w-full items-center gap-3 px-2 py-2.5 text-left hover:bg-stone-50', on && 'bg-indigo-50')}
                >
                  <span className={cx('flex h-5 w-5 items-center justify-center rounded border', on ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-stone-300')}>
                    {on && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <KindIcon kind={m.kind} colored className="h-4 w-4 shrink-0" />
                  <span className="flex-1 truncate text-sm">{m.title}</span>
                  <StatusBadge status={m.status} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
