import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Lock, MessageCircle, QrCode, Trash2, Calendar, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { adminApi } from '../lib/api';
import type { ShareLink } from '../../shared/types';
import { Badge, Button, Field, Input, Modal, Select, Spinner, Toggle, useConfirm } from '../components/ui';
import { QR } from '../components/QR';
import { copyText, formatDate, fromDateInput, shareUrl, toDateInput } from '../lib/format';

export function LinkRow({ link, onChange }: { link: ShareLink; onChange: () => void }) {
  const confirm = useConfirm();
  const [qr, setQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editPass, setEditPass] = useState(false);
  const [pass, setPass] = useState('');
  const url = shareUrl(link.slug);
  const expired = !!link.expires_at && link.expires_at < Date.now();

  const patch = async (body: Record<string, unknown>) => {
    try {
      await adminApi(`/links/${link.id}`, { method: 'PATCH', body });
      onChange();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="rounded-xl border border-stone-200 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded bg-stone-50 px-2 py-1 text-xs">{url}</code>
        <Button
          size="sm"
          icon={copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          onClick={async () => {
            await copyText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <a href={`https://wa.me/?text=${encodeURIComponent(`${link.target_title ?? ''} ${url}`.trim())}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs font-medium hover:bg-stone-50">
          <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
        </a>
        <Button size="sm" variant="ghost" icon={<QrCode className="h-3.5 w-3.5" />} onClick={() => setQr((v) => !v)}>QR</Button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-stone-500">
        {link.label && <span className="font-medium text-stone-700">{link.label}</span>}
        <Badge tone={link.active && !expired ? 'green' : 'stone'}>{expired ? 'Expired' : link.active ? 'Active' : 'Off'}</Badge>
        {link.has_passcode && <Badge tone="amber"><Lock className="h-3 w-3" /> Passcode</Badge>}
        {link.expires_at && <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> until {formatDate(link.expires_at)}</span>}
        {link.allow_download !== null && <span>{link.allow_download ? 'Download allowed' : 'Download blocked'}</span>}
        <span>{link.view_count} opens</span>
        <span className="ml-auto flex items-center gap-3">
          <Toggle checked={link.active} onChange={(v) => patch({ active: v })} label={<span className="text-xs">On</span>} />
          <button className="text-indigo-600 hover:underline" onClick={() => setEditPass((v) => !v)}>Passcode</button>
          <button
            className="text-red-600 hover:underline"
            onClick={async () => {
              if (await confirm({ title: 'Delete this link?', message: 'Anyone using it will no longer be able to open the material.', danger: true, confirmLabel: 'Delete' })) {
                await adminApi(`/links/${link.id}`, { method: 'DELETE' });
                onChange();
              }
            }}
            aria-label="Delete link"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </span>
      </div>
      {editPass && (
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg bg-stone-50 p-2">
          <Field label="New passcode" className="flex-1">
            <Input value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Leave empty to remove" />
          </Field>
          <Field label="Expires">
            <Input type="date" defaultValue={toDateInput(link.expires_at)} onChange={(e) => patch({ expires_at: fromDateInput(e.target.value) })} />
          </Field>
          <Button size="sm" variant="primary" onClick={() => { patch({ passcode: pass }); setEditPass(false); setPass(''); toast.success(pass ? 'Passcode updated' : 'Passcode removed'); }}>Save</Button>
        </div>
      )}
      {qr && (
        <div className="mt-3 flex justify-center">
          <QR text={url} filename={`${link.slug}.png`} />
        </div>
      )}
    </div>
  );
}

export default function ShareDialog({
  open,
  onClose,
  targetType,
  targetId,
  title,
}: {
  open: boolean;
  onClose: () => void;
  targetType: 'material' | 'collection' | 'page';
  targetId: string;
  title: string;
}) {
  const qc = useQueryClient();
  const key = ['links', targetType, targetId];
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => adminApi<{ links: ShareLink[] }>(`/links?target_type=${targetType}&target_id=${targetId}`),
    enabled: open,
  });
  const [label, setLabel] = useState('');
  const [slug, setSlug] = useState('');
  const [passcode, setPasscode] = useState('');
  const [expires, setExpires] = useState('');
  const [download, setDownload] = useState<'inherit' | 'yes' | 'no'>('inherit');
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ['links'] });
  };

  const create = async () => {
    setBusy(true);
    try {
      const { link } = await adminApi<{ link: ShareLink }>('/links', {
        method: 'POST',
        body: {
          target_type: targetType,
          target_id: targetId,
          label,
          slug: slug || undefined,
          passcode: passcode || undefined,
          expires_at: fromDateInput(expires),
          allow_download: download === 'inherit' ? null : download === 'yes',
        },
      });
      await copyText(shareUrl(link.slug));
      toast.success('Link created and copied');
      setLabel('');
      setSlug('');
      setPasscode('');
      setExpires('');
      setShowForm(false);
      refresh();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const links = data?.links ?? [];
  const formVisible = showForm || (!isLoading && !links.length);

  return (
    <Modal open={open} onClose={onClose} title={`Share “${title}”`} wide>
      <p className="mb-4 text-sm text-stone-600">
        Students open share links without logging in. Make separate links per class or batch to track opens, add a passcode, or set an expiry date.
      </p>
      {isLoading ? (
        <Spinner />
      ) : (
        <div className="space-y-3">
          {links.map((l) => (
            <LinkRow key={l.id} link={l} onChange={refresh} />
          ))}
        </div>
      )}
      {formVisible ? (
        <div className="mt-4 space-y-3 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Label (only you see this)">
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Class 5 – Section B" />
            </Field>
            <Field label="Custom link (optional)" hint={`${window.location.host}/s/${slug || 'auto-generated'}`}>
              <Input value={slug} onChange={(e) => setSlug(e.target.value.replace(/[^A-Za-z0-9-]/g, ''))} placeholder="bangla-ch1" />
            </Field>
            <Field label="Passcode (optional)">
              <Input value={passcode} onChange={(e) => setPasscode(e.target.value)} placeholder="e.g. 4521" />
            </Field>
            <Field label="Expires (optional)">
              <Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
            </Field>
            {targetType !== 'page' && (
              <Field label="Downloads">
                <Select value={download} onChange={(e) => setDownload(e.target.value as any)}>
                  <option value="inherit">Use material setting</option>
                  <option value="yes">Allow download</option>
                  <option value="no">View only</option>
                </Select>
              </Field>
            )}
          </div>
          <div className="flex justify-end gap-2">
            {links.length > 0 && <Button onClick={() => setShowForm(false)}>Cancel</Button>}
            <Button variant="primary" loading={busy} onClick={create}>Create link</Button>
          </div>
        </div>
      ) : (
        <Button className="mt-4" icon={<Plus className="h-4 w-4" />} onClick={() => setShowForm(true)}>New link</Button>
      )}
    </Modal>
  );
}
