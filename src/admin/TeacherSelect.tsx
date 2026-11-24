import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../lib/api';
import type { User } from '../../shared/types';
import { Field, Select } from '../components/ui';
import { useMe } from './AdminApp';

/** Admins only: pick which teacher a material belongs to. Renders nothing for teachers. */
export default function TeacherSelect({ value, onChange, className }: { value: string; onChange: (id: string) => void; className?: string }) {
  const me = useMe();
  const isAdmin = me.user.role === 'admin';
  const { data } = useQuery({
    queryKey: ['users'],
    queryFn: () => adminApi<{ users: User[]; superAdminEmail: string }>('/system/users'),
    enabled: isAdmin,
  });
  if (!isAdmin) return null;
  const users = (data?.users ?? []).filter((u) => u.status !== 'pending');
  const sa = data?.superAdminEmail;
  const selected = users.find((u) => u.id === value);
  return (
    <Field
      label="Teacher"
      className={className}
      hint={selected?.email === sa ? 'Your own uploads are not shown on the site — pick a teacher to publish it under their name.' : 'Shown on the site as this teacher’s material.'}
    >
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        {!users.some((u) => u.id === value) && <option value={value}>…</option>}
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.email === sa ? `${u.name || 'Me'} (super admin — hidden from site)` : `${u.name || u.handle}${u.handle ? ` (@${u.handle})` : ''}`}
            {u.status === 'disabled' ? ' — disabled' : ''}
          </option>
        ))}
      </Select>
    </Field>
  );
}
