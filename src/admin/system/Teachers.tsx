import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, ExternalLink, KeyRound, MessageCircle, MoreHorizontal, ShieldCheck, UserCheck, UserPlus, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { adminApi } from '../../lib/api';
import type { User } from '../../../shared/types';
import { Badge, Button, Card, Field, Input, Menu, MenuItem, Modal, PageHeader, PageLoader, Progress, Select, useConfirm } from '../../components/ui';
import { copyText, formatBytes, timeAgo } from '../../lib/format';
import { useMe } from '../AdminApp';

type U = User & { avatar_url?: string | null };

function LinkModal({ link, email, kind, onClose }: { link: string; email: string; kind: 'invite' | 'reset'; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const msg =
    kind === 'invite'
      ? `আসসালামু আলাইকুম! স্টাডি ম্যাটেরিয়ালসে আপনার শিক্ষক অ্যাকাউন্ট চালু করতে এই লিংকে যান: ${link}`
      : `আপনার পাসওয়ার্ড রিসেট করার লিংক: ${link}`;
  return (
    <Modal open onClose={onClose} title={kind === 'invite' ? 'Invite link ready' : 'Password reset link'} footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      <p className="mb-3 text-sm text-stone-600">
        Send this one-time link to <b>{email}</b>. {kind === 'invite' ? 'They set their own password (or use Google with the same email). Valid for 14 days.' : 'It lets them choose a new password. Valid for 2 days.'}
      </p>
      <div className="flex gap-2">
        <code className="min-w-0 flex-1 break-all rounded-xl border-[1.5px] border-stone-300 bg-stone-50 px-3 py-2 text-xs">{link}</code>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="primary"
          icon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          onClick={async () => {
            await copyText(link);
            setCopied(true);
          }}
        >
          {copied ? 'Copied' : 'Copy link'}
        </Button>
        <a href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-indigo-600 px-4 py-1.5 text-[15px] font-semibold text-indigo-600 hover:bg-indigo-50">
          <MessageCircle className="h-4 w-4" /> Send on WhatsApp
        </a>
        <a href={`mailto:${email}?subject=${encodeURIComponent('Study materials account')}&body=${encodeURIComponent(msg)}`} className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[15px] font-semibold text-stone-700 hover:bg-stone-100">
          Email it
        </a>
      </div>
    </Modal>
  );
}

const mbOf = (bytes: number) => (bytes ? String(Math.round(bytes / 1048576)) : '');

export default function Teachers() {
  const me = useMe();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data, isLoading } = useQuery({ queryKey: ['users'], queryFn: () => adminApi<{ users: U[]; superAdminEmail: string }>('/system/users') });
  const [invite, setInvite] = useState(false);
  const [edit, setEdit] = useState<U | null>(null);
  const [form, setForm] = useState({ email: '', name: '', handle: '', role: 'teacher', quota_mb: '' });
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<U | null>(null);
  const [transferTo, setTransferTo] = useState('');
  const [link, setLink] = useState<{ link: string; email: string; kind: 'invite' | 'reset' } | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ['users'] });

  const create = async () => {
    setBusy(true);
    try {
      const res = await adminApi<{ user: User; link: string }>('/system/users', { method: 'POST', body: { ...form, quota_mb: form.quota_mb === '' ? 0 : Number(form.quota_mb) } });
      setInvite(false);
      setForm({ email: '', name: '', handle: '', role: 'teacher', quota_mb: '' });
      setLink({ link: res.link, email: res.user.email, kind: 'invite' });
      refresh();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const patch = async (u: U, body: Record<string, unknown>, msg?: string) => {
    try {
      await adminApi(`/system/users/${u.id}`, { method: 'PATCH', body });
      if (msg) toast.success(msg);
      refresh();
      return true;
    } catch (e: any) {
      toast.error(e.message);
      return false;
    }
  };

  const makeLink = async (u: U) => {
    try {
      const res = await adminApi<{ link: string; kind: 'invite' | 'reset' }>(`/system/users/${u.id}/link`, { method: 'POST' });
      setLink({ link: res.link, email: u.email, kind: res.kind });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const doDelete = async () => {
    if (!del) return;
    try {
      await adminApi(`/system/users/${del.id}?${transferTo ? `transferTo=${transferTo}` : 'purge=1'}`, { method: 'DELETE' });
      toast.success('User removed');
      setDel(null);
      refresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (isLoading) return <PageLoader />;
  const users = data?.users ?? [];
  const pending = users.filter((u) => u.status === 'pending');
  const registration = me.settings.registration;

  return (
    <div>
      <PageHeader
        title="Teachers"
        description="Invite teachers by email. They sign in with Google or with their own email and password. Storage is unlimited unless you set a limit."
        actions={<Button variant="primary" icon={<UserPlus className="h-4 w-4" />} onClick={() => setInvite(true)}>Invite teacher</Button>}
      />

      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl border-[1.5px] border-stone-300 bg-white px-4 py-3 text-sm">
        <span className="font-semibold">Self sign-up:</span>
        <Badge tone={registration === 'open' ? 'green' : registration === 'approval' ? 'amber' : 'stone'}>
          {registration === 'open' ? 'Open — anyone can join' : registration === 'approval' ? 'Needs your approval' : 'Closed — invite only'}
        </Badge>
        <span className="text-stone-500">Change it in Site settings.</span>
      </div>

      {pending.length > 0 && (
        <Card className="mb-5 border-gold bg-gold-soft/40 p-4">
          <h2 className="serif mb-3 flex items-center gap-2 text-lg font-bold text-indigo-600">
            <UserCheck className="h-5 w-5" /> Waiting for approval ({pending.length})
          </h2>
          <ul className="space-y-2">
            {pending.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-3 rounded-xl border-[1.5px] border-stone-900 bg-white px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{u.name}</div>
                  <div className="text-xs text-stone-500">{u.email} · signed up {timeAgo(u.created_at)}{u.google_linked ? ' · via Google' : ''}</div>
                </div>
                <Button size="sm" variant="primary" icon={<Check className="h-3.5 w-3.5" />} onClick={() => patch(u, { status: 'active' }, `${u.name} approved`)}>Approve</Button>
                <Button
                  size="sm"
                  variant="danger"
                  icon={<X className="h-3.5 w-3.5" />}
                  onClick={async () => {
                    if (await confirm({ title: `Reject ${u.email}?`, message: 'The sign-up is deleted.', danger: true, confirmLabel: 'Reject' })) {
                      await adminApi(`/system/users/${u.id}?purge=1`, { method: 'DELETE' });
                      refresh();
                    }
                  }}
                >
                  Reject
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b-[1.5px] border-stone-200 bg-stone-50 text-left text-xs text-stone-600">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Teacher</th>
                <th className="px-2 py-2.5 font-semibold">Role</th>
                <th className="hidden px-2 py-2.5 font-semibold md:table-cell">Sign-in</th>
                <th className="hidden px-2 py-2.5 font-semibold md:table-cell">Materials</th>
                <th className="px-2 py-2.5 font-semibold">Storage</th>
                <th className="hidden px-2 py-2.5 font-semibold lg:table-cell">Last active</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {users.filter((u) => u.status !== 'pending').map((u) => {
                const unlimited = !u.quota_bytes;
                const pct = unlimited ? 0 : ((u.used_bytes ?? 0) / u.quota_bytes) * 100;
                const isSuper = u.email === data?.superAdminEmail;
                return (
                  <tr key={u.id} className={u.status === 'disabled' ? 'opacity-60' : ''}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {u.avatar_url ? (
                          <img src={u.avatar_url} alt="" className="h-9 w-9 rounded-full border-[1.5px] border-stone-900 object-cover" />
                        ) : (
                          <span className="serif flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-gold">{(u.name || u.email).slice(0, 1).toUpperCase()}</span>
                        )}
                        <div className="min-w-0">
                          <div className="truncate font-semibold">
                            {u.name || '—'} {u.id === me.user.id && <span className="text-xs font-normal text-stone-500">(you)</span>}
                          </div>
                          <div className="truncate text-xs text-stone-500">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-3">
                      {isSuper ? (
                        <Badge tone="amber"><ShieldCheck className="h-3 w-3" /> Super admin</Badge>
                      ) : u.role === 'admin' ? (
                        <Badge tone="indigo"><ShieldCheck className="h-3 w-3" /> Admin</Badge>
                      ) : (
                        <Badge>Teacher</Badge>
                      )}
                      {u.status === 'disabled' && <span className="ml-1"><Badge tone="red">Disabled</Badge></span>}
                    </td>
                    <td className="hidden px-2 py-3 text-xs text-stone-600 md:table-cell">
                      {[u.google_linked && 'Google', u.has_password && 'Password'].filter(Boolean).join(' + ') || <span className="text-amber-700">Invite not accepted</span>}
                    </td>
                    <td className="hidden px-2 py-3 tabular-nums md:table-cell">{u.material_count}</td>
                    <td className="w-48 px-2 py-3">
                      <div className="mb-1 text-xs text-stone-600">
                        {formatBytes(u.used_bytes ?? 0)} {unlimited ? <span className="text-stone-400">· no limit</span> : `/ ${formatBytes(u.quota_bytes)}`}
                      </div>
                      {!unlimited && <Progress value={pct} className="h-1.5" tone={pct > 90 ? 'red' : pct > 75 ? 'amber' : 'indigo'} />}
                    </td>
                    <td className="hidden px-2 py-3 text-xs text-stone-500 lg:table-cell">{timeAgo(u.last_login_at)}</td>
                    <td className="px-2 py-3">
                      <Menu trigger={<button className="rounded-full p-1.5 text-stone-500 hover:bg-stone-100" aria-label="Actions"><MoreHorizontal className="h-4 w-4" /></button>}>
                        <MenuItem onClick={() => setEdit(u)}>Edit name, handle & storage limit</MenuItem>
                        <MenuItem icon={<KeyRound className="h-4 w-4" />} onClick={() => makeLink(u)}>{u.has_password ? 'Create password reset link' : 'Copy invite link again'}</MenuItem>
                        {u.handle && <MenuItem icon={<ExternalLink className="h-4 w-4" />} onClick={() => window.open(`/t/${u.handle}`, '_blank')}>View public page</MenuItem>}
                        {u.id !== me.user.id && !isSuper && (
                          <>
                            <MenuItem onClick={() => patch(u, { role: u.role === 'admin' ? 'teacher' : 'admin' })}>{u.role === 'admin' ? 'Make teacher' : 'Make admin'}</MenuItem>
                            <MenuItem onClick={() => patch(u, { status: u.status === 'active' ? 'disabled' : 'active' })}>{u.status === 'active' ? 'Disable sign-in' : 'Enable sign-in'}</MenuItem>
                            <MenuItem danger onClick={() => { setDel(u); setTransferTo(''); }}>Remove…</MenuItem>
                          </>
                        )}
                      </Menu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!users.length && <div className="py-10 text-center text-sm text-stone-500"><Users className="mx-auto mb-2 h-8 w-8" />No users</div>}
      </Card>

      <Modal open={invite} onClose={() => setInvite(false)} title="Invite a teacher" footer={<><Button onClick={() => setInvite(false)}>Cancel</Button><Button variant="primary" loading={busy} onClick={create}>Create invite link</Button></>}>
        <div className="space-y-3">
          <Field label="Email" hint="You'll get a one-time link to send them. If it's a Gmail address, they can also just click “Continue with Google”.">
            <Input type="email" autoFocus value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="munjiba@gmail.com" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Munjiba" /></Field>
            <Field label="Page handle" hint="Their page: /t/handle"><Input value={form.handle} onChange={(e) => setForm({ ...form, handle: e.target.value })} placeholder="munjiba" /></Field>
            <Field label="Role">
              <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="teacher">Teacher</option>
                <option value="admin">Admin</option>
              </Select>
            </Field>
            <Field label="Storage limit (MB)" hint="Empty = no limit"><Input type="number" min={0} value={form.quota_mb} onChange={(e) => setForm({ ...form, quota_mb: e.target.value })} placeholder="No limit" /></Field>
          </div>
        </div>
      </Modal>

      {link && <LinkModal {...link} onClose={() => setLink(null)} />}
      {edit && <EditUser user={edit} onClose={() => setEdit(null)} onSave={async (body) => { if (await patch(edit, body, 'Saved')) setEdit(null); }} />}

      <Modal
        open={!!del}
        onClose={() => setDel(null)}
        title={`Remove ${del?.email}?`}
        footer={
          <>
            <Button onClick={() => setDel(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (!transferTo && !(await confirm({ title: 'Delete all their content?', message: 'All materials, files, collections and links owned by this user are deleted permanently.', danger: true, confirmLabel: 'Delete everything' }))) return;
                doDelete();
              }}
            >
              Remove user
            </Button>
          </>
        }
      >
        <Field label="What happens to their materials?">
          <Select value={transferTo} onChange={(e) => setTransferTo(e.target.value)}>
            <option value="">Delete everything they uploaded</option>
            {users.filter((u) => u.id !== del?.id && u.status === 'active').map((u) => <option key={u.id} value={u.id}>Transfer to {u.name || u.email}</option>)}
          </Select>
        </Field>
      </Modal>
    </div>
  );
}

function EditUser({ user, onClose, onSave }: { user: U; onClose: () => void; onSave: (b: Record<string, unknown>) => void }) {
  const [name, setName] = useState(user.name);
  const [handle, setHandle] = useState(user.handle ?? '');
  const [quota, setQuota] = useState(mbOf(user.quota_bytes));
  return (
    <Modal open onClose={onClose} title={`Edit ${user.email}`} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => onSave({ name, handle, quota_mb: quota === '' ? 0 : Number(quota) })}>Save</Button></>}>
      <div className="space-y-3">
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Handle"><Input value={handle} onChange={(e) => setHandle(e.target.value)} /></Field>
        <Field label="Storage limit (MB)" hint="Leave empty for no limit"><Input type="number" min={0} value={quota} onChange={(e) => setQuota(e.target.value)} placeholder="No limit" /></Field>
      </div>
    </Modal>
  );
}
