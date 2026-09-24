/**
 * Allowlist sanitiser for organiser-authored rich text (emails, site pages).
 *
 * Output is rebuilt from scratch: only allowed tags survive, each with only
 * allowed attributes, and every other `<` or `>` is escaped. Nothing from the
 * input passes through unparsed.
 */

const ALLOWED: Record<string, string[]> = {
  p: [], br: [], b: [], strong: [], i: [], em: [], u: [], s: [],
  h2: [], h3: [], h4: [], ul: [], ol: [], li: [], blockquote: [],
  a: ['href'], span: [],
};
const VOID = new Set(['br']);
const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[a-zA-Z-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*\/?>/g;
const ATTR = /([a-zA-Z-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

const escText = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s: string) => s.replace(/&(?!(?:[a-z]+|#\d+);)/gi, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function safeHref(v: string): string | null {
  const t = v.trim().replace(/[\u0000-\u001F\s]+/g, '');
  if (/^(https?:|mailto:|tel:)/i.test(t) || t.startsWith('#') || t.startsWith('/')) return v.trim();
  return null;
}

export function sanitizeRichText(input: string): string {
  let out = '';
  let last = 0;
  const open: string[] = [];
  // Drop the bodies of script/style entirely.
  const src = input.replace(/<(script|style|iframe|object|embed|template)\b[\s\S]*?<\/\1\s*>/gi, '');
  for (const m of src.matchAll(TAG)) {
    out += escText(src.slice(last, m.index));
    last = m.index! + m[0].length;
    const closing = m[1] === '/';
    const name = m[2].toLowerCase();
    const allowed = ALLOWED[name];
    if (!allowed) continue;
    if (closing) {
      const at = open.lastIndexOf(name);
      if (at === -1) continue;
      while (open.length > at) out += `</${open.pop()}>`;
      continue;
    }
    let attrs = '';
    for (const a of m[3].matchAll(ATTR)) {
      const an = a[1].toLowerCase();
      if (!allowed.includes(an)) continue;
      const raw = a[2] ?? a[3] ?? a[4] ?? '';
      const val = an === 'href' ? safeHref(raw) : raw;
      if (val === null) continue;
      attrs += ` ${an}="${escAttr(val)}"`;
    }
    if (name === 'a') attrs += ' rel="noopener noreferrer"';
    out += `<${name}${attrs}>`;
    if (!VOID.has(name)) open.push(name);
  }
  out += escText(src.slice(last));
  while (open.length) out += `</${open.pop()}>`;
  return out;
}
