import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { adminApi } from '../../lib/api';
import type { SiteSettings } from '../../../shared/types';
import { Button, Card, Field, Input, PageHeader, PageLoader, Select, Textarea } from '../../components/ui';
import { ImagePicker } from '../../components/ImagePicker';

export default function SiteSettingsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['settings'], queryFn: () => adminApi<{ settings: SiteSettings }>('/system/settings') });
  const users = useQuery({ queryKey: ['users'], queryFn: () => adminApi<{ users: { handle: string | null; name: string }[] }>('/system/users') });
  const [s, setS] = useState<SiteSettings | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setS(data.settings); }, [data]);

  if (isLoading || !s) return <PageLoader />;
  const set = <K extends keyof SiteSettings>(k: K, v: SiteSettings[K]) => setS({ ...s, [k]: v });

  const save = async () => {
    setBusy(true);
    try {
      await adminApi('/system/settings', { method: 'PUT', body: s });
      qc.invalidateQueries({ queryKey: ['settings'] });
      qc.invalidateQueries({ queryKey: ['me'] });
      qc.invalidateQueries({ queryKey: ['site'] });
      toast.success('Settings saved');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <PageHeader title="Site settings" description="Branding of the home page and limits for every teacher." actions={<Button variant="primary" icon={<Save className="h-4 w-4" />} loading={busy} onClick={save}>Save</Button>} />
      <div className="space-y-5">
        <Card className="space-y-4 p-5">
          <h2 className="serif text-lg font-bold text-indigo-600">Branding</h2>
          <div className="flex items-start gap-5">
            <ImagePicker label="Logo" value={s.logoAsset} onChange={(v) => set('logoAsset', v)} compact />
            <div className="flex-1 space-y-3">
              <Field label="Brand (top-left, e.g. Munjiba)"><Input value={s.brandName} onChange={(e) => set('brandName', e.target.value)} /></Field>
              <Field label="Site name (top-right)"><Input value={s.siteName} onChange={(e) => set('siteName', e.target.value)} /></Field>
              <Field label="Tagline"><Input value={s.tagline} onChange={(e) => set('tagline', e.target.value)} /></Field>
            </div>
          </div>
          <Field label="Home page notice (Markdown, optional)"><Textarea rows={3} value={s.bannerText} onChange={(e) => set('bannerText', e.target.value)} /></Field>
          <Field label="Footer text"><Input value={s.footerText} onChange={(e) => set('footerText', e.target.value)} /></Field>
        </Card>
        <Card className="space-y-4 p-5">
          <h2 className="serif text-lg font-bold text-indigo-600">Home page</h2>
          <p className="text-sm text-stone-500">There is one home page for everyone. Edit its look in <b>Home page design</b>.</p>
          <Field label="Default student language">
            <Select value={s.defaultLanguage} onChange={(e) => set('defaultLanguage', e.target.value as SiteSettings['defaultLanguage'])}>
              <option value="bn">বাংলা</option>
              <option value="en">English</option>
            </Select>
          </Field>
        </Card>
        <Card className="space-y-4 p-5">
          <h2 className="serif text-lg font-bold text-indigo-600">Teacher sign-up</h2>
          <Field label="Who can create a teacher account" hint="Invited teachers can always join with their invite link or Google.">
            <Select value={s.registration} onChange={(e) => set('registration', e.target.value as SiteSettings['registration'])}>
              <option value="approval">Anyone can sign up, but you approve them first (recommended)</option>
              <option value="open">Anyone can sign up and start immediately</option>
              <option value="closed">Invite only</option>
            </Select>
          </Field>
        </Card>
        <Card className="space-y-4 p-5">
          <h2 className="serif text-lg font-bold text-indigo-600">Limits (optional)</h2>
          <p className="text-sm text-stone-500">Teachers have no limits by default. Cloudflare's free R2 storage is 10 GB for the whole site — set limits here or per teacher only if you need them. 0 = no limit.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Max size per file (MB)"><Input type="number" min={0} value={s.maxFileMb} onChange={(e) => set('maxFileMb', Number(e.target.value))} /></Field>
            <Field label="Storage limit for new teachers (MB)"><Input type="number" min={0} value={s.defaultQuotaMb} onChange={(e) => set('defaultQuotaMb', Number(e.target.value))} /></Field>
          </div>
        </Card>
      </div>
    </div>
  );
}
