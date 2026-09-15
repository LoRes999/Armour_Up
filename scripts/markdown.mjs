/**
 * The small markdown reader shared by build-legal.mjs (the in-app legal
 * screens) and build-site.mjs (the published web pages), so both read the
 * docs the same way.
 */

/** `a **b** c` -> three spans, the middle one bold. */
export function spans(text) {
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
 * Just enough markdown for these documents: headings, bullets, paragraphs
 * and inline bold. Anything richer would be a parser nobody asked for.
 */
export function parse(markdown) {
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
