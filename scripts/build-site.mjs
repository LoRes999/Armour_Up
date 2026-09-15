/**
 * Builds the public web pages the stores ask for, into site/: privacy policy,
 * terms, support, and how to delete an account (Google Play requires that
 * one), plus a front page linking them. Upload the folder to a GitHub Pages
 * repository as it is.
 *
 * Built from the same docs/*.md as the in-app legal screens, through the same
 * reader, so the published copy and the one in the app cannot drift. Links
 * ([text](url)) and email addresses become clickable here only; the in-app
 * screens render text, so privacy.md and terms.md should not use links.
 *
 *   node scripts/build-site.mjs
 */

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from './markdown.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'site');
const APP = 'ArmourUp Fitness';

const PAGES = [
  { id: 'privacy', label: 'Privacy Policy' },
  { id: 'terms', label: 'Terms of Service' },
  { id: 'support', label: 'Support' },
  { id: 'delete-account', label: 'Delete your account' },
];

const escape = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Text to HTML: [label](href) links, and bare email addresses as mailto links. */
function inline(text) {
  return text
    .split(/(\[[^\]]+\]\([^)]+\))/g)
    .map((piece) => {
      const link = piece.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link) return `<a href="${escape(link[2])}">${escape(link[1])}</a>`;
      return escape(piece).replace(
        /[\w.+-]+@[\w-]+(\.[\w-]+)+/g,
        (email) => `<a href="mailto:${email}">${email}</a>`
      );
    })
    .join('');
}

const render = (spanList) =>
  spanList.map((s) => (s.bold ? `<strong>${inline(s.text)}</strong>` : inline(s.text))).join('');

/** Blocks to HTML, grouping consecutive bullets into one list. */
function body(blocks) {
  const html = [];
  let open = false;
  for (const block of blocks) {
    if (block.kind === 'li' && !open) {
      html.push('<ul>');
      open = true;
    } else if (block.kind !== 'li' && open) {
      html.push('</ul>');
      open = false;
    }
    const tag = block.kind === 'li' ? 'li' : block.kind;
    html.push(`<${tag}>${render(block.spans)}</${tag}>`);
  }
  if (open) html.push('</ul>');
  return html.join('\n');
}

// The app's logo (scripts/make-assets.mjs): a dumbbell in white outlines.
const LOGO = `<svg viewBox="0 0 100 100" width="34" height="34" aria-hidden="true" fill="none" stroke="#fff" stroke-width="5">
<rect x="30" y="46.4" width="40" height="7.2" rx="2"/>
<rect x="18.6" y="28.6" width="11.4" height="42.8" rx="3.6"/>
<rect x="70" y="28.6" width="11.4" height="42.8" rx="3.6"/>
<rect x="11.4" y="37.1" width="7.2" height="25.8" rx="2.9"/>
<rect x="81.4" y="37.1" width="7.2" height="25.8" rx="2.9"/>
</svg>`;

const STYLE = `
:root { color-scheme: light dark; --ground: #fff; --text: #1e1719; --dim: #6b5f5a; --link: #9e630e; --rule: #e6dbd1; }
@media (prefers-color-scheme: dark) { :root { --ground: #171214; --text: #f2e9e4; --dim: #9c8b85; --link: #e8a33d; --rule: #382c31; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--ground); color: var(--text); font: 16px/1.65 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
header { background: #111; }
.bar, main, footer { max-width: 720px; margin: 0 auto; padding: 0 20px; }
.bar { display: flex; align-items: center; gap: 10px; min-height: 64px; }
.brand { color: #fff; text-decoration: none; font-weight: 800; font-size: 18px; display: flex; align-items: center; gap: 10px; }
main { padding-top: 28px; padding-bottom: 40px; }
h1 { font-size: 30px; line-height: 1.2; margin: 0 0 12px; }
h2 { font-size: 19px; margin: 32px 0 8px; }
ul { padding-left: 22px; }
li { margin: 6px 0; }
a { color: var(--link); }
footer { border-top: 1px solid var(--rule); padding-top: 18px; padding-bottom: 40px; color: var(--dim); font-size: 14px; }
footer a { margin-right: 16px; }
`;

function page(title, content) {
  const nav = PAGES.map((p) => `<a href="${p.id}.html">${p.label}</a>`).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)} · ${APP}</title>
<link rel="icon" href="favicon.png">
<style>${STYLE}</style>
</head>
<body>
<header><div class="bar"><a class="brand" href="index.html">${LOGO}<span>${APP}</span></a></div></header>
<main>
<h1>${escape(title)}</h1>
${content}
</main>
<footer>
<nav>
${nav}
</nav>
</footer>
</body>
</html>
`;
}

mkdirSync(OUT, { recursive: true });

for (const { id } of PAGES) {
  const doc = parse(readFileSync(join(ROOT, 'docs', `${id}.md`), 'utf8'));
  writeFileSync(join(OUT, `${id}.html`), page(doc.title, body(doc.blocks)));
  console.log(`${`${id}.html`.padEnd(20)} "${doc.title}"`);
}

const links = PAGES.map((p) => `<li><a href="${p.id}.html">${p.label}</a></li>`).join('\n');
writeFileSync(
  join(OUT, 'index.html'),
  page(APP, `<p>An app for strength coaches and the clients they train.</p>\n<ul>\n${links}\n</ul>`)
);
console.log('index.html');

copyFileSync(join(ROOT, 'assets', 'favicon.png'), join(OUT, 'favicon.png'));
// Serve the pages as they are, without GitHub Pages' Jekyll step.
writeFileSync(join(OUT, '.nojekyll'), '');
console.log('favicon.png, .nojekyll');
