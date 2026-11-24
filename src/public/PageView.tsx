import type { PageDesign, PublicPageData } from '../../shared/types';
import type { Lang } from '../lib/i18n';
import { ThemedShell } from './ThemedShell';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BlockView, TeacherFilter } from './blocks/Blocks';

export function PageView({
  design,
  data,
  lang,
  setLang,
  preview,
  selectedId,
  onSelect,
}: {
  design: PageDesign;
  data: PublicPageData;
  lang: Lang;
  setLang: (l: Lang) => void;
  preview?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const ctx = { data, lang, preview, layout: design.layout };
  const [params, setParams] = useSearchParams();
  const [previewTeacher, setPreviewTeacher] = useState('');
  const filter: [string, (h: string) => void] = preview
    ? [previewTeacher, setPreviewTeacher]
    : [
        params.get('teacher') ?? '',
        (h) => {
          const next = new URLSearchParams(params);
          if (h) next.set('teacher', h);
          else next.delete('teacher');
          setParams(next, { replace: true, preventScrollReset: true });
        },
      ];
  return (
    <TeacherFilter.Provider value={filter}>
    <ThemedShell theme={design.theme} site={data.site} lang={lang} setLang={setLang} layout={design.layout} preview={preview}>
      <div className="space-y-12">
        {design.blocks
          .filter((b) => b.visible)
          .map((b) =>
            preview ? (
              <div
                key={b.id}
                id={`blk-${b.id}`}
                onClickCapture={() => onSelect?.(b.id)}
                className="relative rounded-lg outline-offset-4 transition"
                style={{ outline: selectedId === b.id ? '2px dashed #6366f1' : undefined }}
              >
                <BlockView block={b} ctx={ctx} />
              </div>
            ) : (
              <BlockView key={b.id} block={b} ctx={ctx} />
            ),
          )}
      </div>
    </ThemedShell>
    </TeacherFilter.Provider>
  );
}
