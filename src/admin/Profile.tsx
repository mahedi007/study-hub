import { realEmail } from '../../shared/design';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { adminApi } from '../lib/api';
import { Button, Card, Field, Input, PageHeader, Textarea } from '../components/ui';
import { ImagePicker } from '../components/ImagePicker';
import { formatBytes } from '../lib/format';
import { useMe } from './AdminApp';

export default function Profile() {
  const me = useMe();
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', handle: '', bio: '', avatar_asset: null as string | null });
  const [busy, setBusy] = useState(false);
  useEffect(() => setForm({ name: me.user.name, handle: me.user.handle ?? '', bio: me.user.bio, avatar_asset: me.user.avatar_asset }), [me.user]);

  const save = async () => {
    setBusy(true);
    try {
      await adminApi('/me', { method: 'PATCH', body: form });
      await qc.invalidateQueries({ queryKey: ['me'] });
      qc.invalidateQueries({ queryKey: ['page-data'] });
      toast.success('Profile saved');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwBusy, setPwBusy] = useState(false);
  const savePassword = async () => {
    if (pw.next !== pw.confirm) return toast.error('New passwords do not match');
    setPwBusy(true);
    try {
      await adminApi('/me/password', { method: 'POST', body: { current: pw.current, next: pw.next } });
      setPw({ current: '', next: '', confirm: '' });
      qc.invalidateQueries({ queryKey: ['me'] });
      toast.success('Password updated. Other devices were signed out.');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setPwBusy(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Profile" description="How students see you across your page, materials and share links." />
      <Card className="space-y-4 p-5">
        <div className="flex items-start gap-5">
          <ImagePicker label="Photo" value={form.avatar_asset} onChange={(v) => setForm({ ...form, avatar_asset: v })} compact />
          <div className="flex-1 space-y-3">
            <Field label="Display name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Username" hint={`You sign in with it, and students see only your materials at ${window.location.origin}/?teacher=${form.handle || "…"}`}>
              <Input value={form.handle} onChange={(e) => setForm({ ...form, handle: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} />
            </Field>
          </div>
        </div>
        <Field label="Short bio"><Textarea rows={3} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></Field>
        <div className="flex items-center justify-between border-t border-stone-100 pt-4 text-sm text-stone-500">
          <span>{realEmail(me.user.email) || `@${me.user.handle}`} · {me.isSuperAdmin ? 'super admin' : me.user.role} · {formatBytes(me.user.used_bytes)} used{me.user.quota_bytes ? ` of ${formatBytes(me.user.quota_bytes)}` : ''}</span>
          <Button variant="primary" icon={<Save className="h-4 w-4" />} loading={busy} onClick={save}>Save</Button>
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="serif text-lg font-bold text-indigo-600">Sign-in</h2>
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="rounded-full border-[1.5px] border-stone-300 px-3 py-0.5">Google: {me.user.google_linked ? 'connected' : me.capabilities.google ? 'not connected — sign in with Google once using this email to connect' : 'not enabled on this site'}</span>
          <span className="rounded-full border-[1.5px] border-stone-300 px-3 py-0.5">Password: {me.user.has_password ? 'set' : 'not set'}</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {me.user.has_password && (
            <Field label="Current password"><Input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
          )}
          <Field label={me.user.has_password ? 'New password' : 'Create a password'}><Input type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
          <Field label="Repeat"><Input type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Field>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-200 pt-4">
          <Button
            variant="ghost"
            onClick={async () => {
              await adminApi('/me/logout-all', { method: 'POST' });
              toast.success('Signed out on all other devices');
            }}
          >
            Sign out other devices
          </Button>
          <Button variant="primary" loading={pwBusy} disabled={!pw.next} onClick={savePassword}>{me.user.has_password ? 'Change password' : 'Set password'}</Button>
        </div>
      </Card>
    </div>
  );
}
