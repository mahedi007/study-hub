import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, ExternalLink, KeyRound, MessageCircle, MoreHorizontal, Pencil, RefreshCw, ShieldCheck, UserCheck, UserPlus, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { adminApi } from '../../lib/api';
import type { User } from '../../../shared/types';
import { Badge, Button, Card, Field, Input, Menu, MenuItem, Modal, PageHeader, PageLoader, Progress, Select, Textarea, useConfirm } from '../../components/ui';
import { ImagePicker } from '../../components/ImagePicker';
import { copyText, formatBytes, timeAgo } from '../../lib/format';
import { useMe } from '../AdminApp';
import { realEmail } from '../../../shared/design';

/** A readable random password: no look-alike characters. */
export function makePassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

function PasswordInput({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <div className="flex gap-2">
      <Input value={value} onChange={(e) => onChange(e.target.value)} autoFocus={autoFocus} autoComplete="new-password" placeholder="At least 8 characters" className="font-mono" />
      <Button type="button" icon={<RefreshCw className="h-4 w-4" />} onClick={() => onChange(makePassword())}>Generate</Button>
    </div>
  );
}

/** Shows the sign-in details once so the admin can hand them to the teacher. */
function CredentialsModal({ name, username, password, onClose }: { name: string; username: string; password: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const loginUrl = `${window.location.origin}/admin/login`;
  const msg = `আসসালামু আলাইকুম ${name}! স্টাডি ম্যাটেরিয়ালসে লগইন করুন:\n${loginUrl}\nইউজারনেম: ${username}\nপাসওয়ার্ড: ${password}\n(লগইনের পর Profile থেকে পাসওয়ার্ড বদলে নিতে পারবেন)`;
  return (
    <Modal open onClose={onClose} title="Sign-in details" footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      <p className="mb-3 text-sm text-stone-600">Give these to <b>{name}</b>. The password is not shown again — set a new one any time from the teacher's menu.</p>
      <div className="space-y-1.5 rounded-xl border-[1.5px] border-stone-300 bg-stone-50 px-4 py-3 text-sm">
        <div><span className="inline-block w-24 text-stone-500">Sign-in page</span> <code className="break-all">{loginUrl}</code></div>
        <div><span className="inline-block w-24 text-stone-500">Username</span> <code className="font-bold">{username}</code></div>
        <div><span className="inline-block w-24 text-stone-500">Password</span> <code className="font-bold">{password}</code></div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" icon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} onClick={async () => { await copyText(msg); setCopied(true); }}>
          {copied ? 'Copied' : 'Copy message'}
        </Button>
        <a href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-indigo-600 px-4 py-1.5 text-[15px] font-semibold text-indigo-600 hover:bg-indigo-50">
          <MessageCircle className="h-4 w-4" /> Send on WhatsApp
        </a>
      </div>
    </Modal>
  );
}

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
  const blank = () => ({ email: '', name: '', handle: '', password: makePassword(), role: 'teacher', quota_mb: '' });
  const [form, setForm] = useState(blank);
  const [creds, setCreds] = useState<{ name: string; username: string; password: string } | null>(null);
  const [pwUser, setPwUser] = useState<U | null>(null);
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<U | null>(null);
  const [transferTo, setTransferTo] = useState('');
  const [link, setLink] = useState<{ link: string; email: string; kind: 'invite' | 'reset' } | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ['users'] });

  const create = async () => {
    setBusy(true);
    try {
      const res = await adminApi<{ user: User; link: string | null }>('/system/users', { method: 'POST', body: { ...form, quota_mb: form.quota_mb === '' ? 0 : Number(form.quota_mb) } });
      setInvite(false);
      if (res.link) setLink({ link: res.link, email: res.user.email, kind: 'invite' });
      else setCreds({ name: res.user.name, username: res.user.handle ?? '', password: form.password });
      setForm(blank());
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
        description="Create a username and password for each teacher, or invite them by email. You can change any teacher's details or password here. Storage is unlimited unless you set a limit."
        actions={<Button variant="primary" icon={<UserPlus className="h-4 w-4" />} onClick={() => { setForm(blank()); setInvite(true); }}>Add teacher</Button>}
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
                          <div className="truncate text-xs text-stone-500">
                            {u.handle && <span className="font-medium text-stone-700">@{u.handle}</span>}
                            {u.handle && realEmail(u.email) && ' · '}
                            {realEmail(u.email)}
                          </div>
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
                        <MenuItem icon={<Pencil className="h-4 w-4" />} onClick={() => setEdit(u)}>Edit profile (photo, name, bio…)</MenuItem>
                        {(!isSuper || u.id === me.user.id) && <MenuItem icon={<KeyRound className="h-4 w-4" />} onClick={() => setPwUser(u)}>Set a new password</MenuItem>}
                        {realEmail(u.email) && !isSuper && <MenuItem onClick={() => makeLink(u)}>{u.has_password ? 'Send a reset link instead' : 'Copy invite link again'}</MenuItem>}
                        {u.handle && <MenuItem icon={<ExternalLink className="h-4 w-4" />} onClick={() => window.open(`/?teacher=${u.handle}`, '_blank')}>View their materials</MenuItem>}
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

      <Modal
        open={invite}
        onClose={() => setInvite(false)}
        title="Add a teacher"
        footer={<><Button onClick={() => setInvite(false)}>Cancel</Button><Button variant="primary" loading={busy} onClick={create}>{form.password ? 'Create account' : 'Create invite link'}</Button></>}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name"><Input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Rony Ahmed" /></Field>
            <Field label="Username" hint="For sign-in. a-z, 0-9 and -">
              <Input value={form.handle} onChange={(e) => setForm({ ...form, handle: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} placeholder="rony" />
            </Field>
          </div>
          <Field label="Password" hint="Clear it to send an email invite instead, so they choose their own.">
            <PasswordInput value={form.password} onChange={(v) => setForm({ ...form, password: v })} />
          </Field>
          <Field label={form.password ? 'Email (optional)' : 'Email'} hint="Optional with a password. With a Gmail address they can also use “Continue with Google”.">
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="rony@gmail.com" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
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
      {edit && <EditUser user={edit} isSuper={edit.email === data?.superAdminEmail} onClose={() => setEdit(null)} onSave={async (body) => { if (await patch(edit, body, 'Saved')) setEdit(null); }} />}
      {pwUser && (
        <SetPassword
          user={pwUser}
          onClose={() => setPwUser(null)}
          onSave={async (password) => {
            if (await patch(pwUser, { password }, 'Password changed — they were signed out of other devices')) {
              if (pwUser.id !== me.user.id) setCreds({ name: pwUser.name, username: pwUser.handle ?? realEmail(pwUser.email), password });
              setPwUser(null);
            }
          }}
        />
      )}
      {creds && <CredentialsModal {...creds} onClose={() => setCreds(null)} />}

      <Modal
        open={!!del}
        onClose={() => setDel(null)}
        title={`Remove ${del?.name || del?.handle}?`}
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

function EditUser({ user, isSuper, onClose, onSave }: { user: U; isSuper: boolean; onClose: () => void; onSave: (b: Record<string, unknown>) => void }) {
  const [name, setName] = useState(user.name);
  const [handle, setHandle] = useState(user.handle ?? '');
  const [email, setEmail] = useState(realEmail(user.email));
  const [bio, setBio] = useState(user.bio ?? '');
  const [avatar, setAvatar] = useState<string | null>(user.avatar_asset ?? null);
  const [quota, setQuota] = useState(mbOf(user.quota_bytes));
  const body: Record<string, unknown> = { name, handle, bio, avatar_asset: avatar, quota_mb: quota === '' ? 0 : Number(quota) };
  if (!isSuper && email !== realEmail(user.email)) body.email = email;
  return (
    <Modal open wide onClose={onClose} title={`Edit ${user.name || user.handle}’s profile`} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => onSave(body)}>Save profile</Button></>}>
      <div className="space-y-4">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <ImagePicker label="Photo" value={avatar} onChange={setAvatar} compact />
          <div className="grid flex-1 gap-3 sm:grid-cols-2">
            <Field label="Display name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Username" hint={`Sign-in name · filter link /?teacher=${handle || '…'}`}>
              <Input value={handle} onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} />
            </Field>
            <Field label="Email" hint={isSuper ? 'The super admin email is set in Cloudflare.' : 'Optional with a username + password.'}>
              <Input type="email" value={email} disabled={isSuper} onChange={(e) => setEmail(e.target.value)} placeholder="No email" />
            </Field>
            <Field label="Storage limit (MB)" hint="Empty = no limit"><Input type="number" min={0} value={quota} onChange={(e) => setQuota(e.target.value)} placeholder="No limit" /></Field>
          </div>
        </div>
        <Field label="Short bio" hint="Shown on the site when students pick this teacher.">
          <Textarea rows={3} value={bio} onChange={(e) => setBio(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function SetPassword({ user, onClose, onSave }: { user: U; onClose: () => void; onSave: (password: string) => void }) {
  const [password, setPassword] = useState(makePassword());
  return (
    <Modal
      open
      onClose={onClose}
      title={`New password for ${user.name || user.handle}`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={password.length < 8} onClick={() => onSave(password)}>Save password</Button></>}
    >
      <p className="mb-3 text-sm text-stone-600">This replaces their current password and signs them out of other devices. You'll see the details to send them next.</p>
      <Field label="New password"><PasswordInput value={password} onChange={setPassword} autoFocus /></Field>
    </Modal>
  );
}
