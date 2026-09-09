/**
 * Turns docs/privacy.md and docs/terms.md into src/legalContent.ts.
 *
 * The markdown files are the single source: they are what gets published to a
 * URL for App Store Connect, and they are what the in-app screens render. A
 * second hand-maintained copy inside the app would drift, and the version
 * somebody actually reads would stop being the version we published.
 *
 * Metro cannot import .md, hence the generated module.
 *
 *   node scripts/build-legal.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** `a **b** c` -> three spans, the middle one bold. */
function spans(text) {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter((piece) => piece.length > 0)
    .map((piece) =>
      piece.startsWith('**') && piece.endsWith('**')
        ? { text: piece.slice(2, -2), bold: true }
        : { text: piece, bold: false }
    );
}

/**
 * Just enough markdown for these two documents: headings, bullets, paragraphs
 * and inline bold. Anything richer would be a parser nobody asked for.
 */
function parse(markdown) {
  const blocks = [];
  let title = '';
  let paragraph = [];
  let inList = false;

  const flush = () => {
    if (paragraph.length) {
      blocks.push({ kind: 'p', spans: spans(paragraph.join(' ')) });
      paragraph = [];
    }
  };

  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();

    if (line === '') {
      flush();
    } else if (line.startsWith('## ')) {
      flush();
      blocks.push({ kind: 'h2', spans: spans(line.slice(3)) });
    } else if (line.startsWith('# ')) {
      flush();
      // The first h1 is the document title, shown in the header instead.
      if (!title) title = line.slice(2);
      else blocks.push({ kind: 'h2', spans: spans(line.slice(2)) });
    } else if (line.startsWith('- ')) {
      flush();
      blocks.push({ kind: 'li', spans: spans(line.slice(2)) });
      inList = true;
    } else if (inList && paragraph.length === 0 && /^\s/.test(raw)) {
      // A wrapped bullet. Without this the continuation line becomes its own
      // paragraph, and the second half of every long bullet floats free of it.
      const last = blocks[blocks.length - 1];
      last.spans = spans(last.spans.map((s) => (s.bold ? `**${s.text}**` : s.text)).join('') + ' ' + line);
    } else {
      paragraph.push(line);
      inList = false;
    }
  }
  flush();

  return { title, blocks };
}

const documents = {
  privacy: parse(readFileSync(join(ROOT, 'docs', 'privacy.md'), 'utf8')),
  terms: parse(readFileSync(join(ROOT, 'docs', 'terms.md'), 'utf8')),
};

const output = `// GENERATED FILE — do not edit.
// Run \`node scripts/build-legal.mjs\` after changing docs/privacy.md or docs/terms.md.

export type LegalDocId = 'privacy' | 'terms';

export interface LegalSpan {
  text: string;
  bold: boolean;
}

export interface LegalBlock {
  kind: 'h2' | 'p' | 'li';
  spans: LegalSpan[];
}

export interface LegalDoc {
  title: string;
  blocks: LegalBlock[];
}

export const LEGAL_DOCS: Record<LegalDocId, LegalDoc> = ${JSON.stringify(documents, null, 2)};
`;

writeFileSync(join(ROOT, 'src', 'legalContent.ts'), output);

for (const [id, doc] of Object.entries(documents)) {
  console.log(`${id.padEnd(8)} "${doc.title}"  ${doc.blocks.length} blocks`);
}
