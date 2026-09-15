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
import { parse } from './markdown.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

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
