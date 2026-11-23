import { Fragment } from 'react';

/** Hand-drawn gold underline used under the highlighted word of big headings. */
export function SquiggleSvg() {
  return (
    <svg viewBox="0 0 300 30" preserveAspectRatio="none" aria-hidden="true">
      <path d="M4 22 C 40 6, 70 6, 100 16 S 160 30, 200 14 S 270 4, 296 10" fill="none" stroke="var(--tp-accent, #e9a928)" strokeWidth="7" strokeLinecap="round" />
    </svg>
  );
}

/** Renders a title (newlines become line breaks) and draws the squiggle under `highlight`. */
export function SquiggleTitle({ text, highlight }: { text: string; highlight?: string }) {
  const lines = text.split('\n');
  const word = (highlight ?? '').trim();
  let done = false;
  return (
    <>
      {lines.map((line, li) => {
        let content: React.ReactNode = line;
        if (word && !done) {
          const i = line.lastIndexOf(word);
          if (i >= 0) {
            done = true;
            content = (
              <>
                {line.slice(0, i)}
                <span className="squiggle-host">
                  <SquiggleSvg />
                  <span className="relative">{word}</span>
                </span>
                {line.slice(i + word.length)}
              </>
            );
          }
        }
        return (
          <Fragment key={li}>
            {li > 0 && <br />}
            {content}
          </Fragment>
        );
      })}
    </>
  );
}

/** Use the last word of a title as the highlight when none is set. */
export const lastWord = (s: string) => s.trim().split(/\s+/).pop() ?? '';
