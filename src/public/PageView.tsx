import type { PageDesign, PublicPageData } from '../../shared/types';
import type { Lang } from '../lib/i18n';
import { ThemedShell } from './ThemedShell';
import { BlockView } from './blocks/Blocks';

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
  return (
    <ThemedShell theme={design.theme} teacher={data.teacher} lang={lang} setLang={setLang} layout={design.layout} preview={preview}>
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
  );
}
