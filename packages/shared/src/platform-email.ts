import { escapeHtml } from './merge-tags';

/** zemmz's own emails (reset, invitation, code): plain, with one button. */
export function platformEmail(opts: { heading: string; paragraphs: string[]; button?: { label: string; url: string }; code?: string; footer?: string }) {
  const p = opts.paragraphs.map((t) => `<p style="margin:0 0 14px">${escapeHtml(t)}</p>`).join('');
  const button = opts.button
    ? `<p style="margin:22px 0"><a href="${escapeHtml(opts.button.url)}" style="display:inline-block;background:#0B5CFF;color:#FFFFFF;font:600 15px Arial,sans-serif;text-decoration:none;padding:12px 20px;border-radius:10px">${escapeHtml(opts.button.label)}</a></p>`
    : '';
  const code = opts.code ? `<p style="margin:18px 0;font:700 34px/1 Arial,sans-serif;letter-spacing:.3em;color:#00032E">${escapeHtml(opts.code)}</p>` : '';
  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#F4F5FA">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F5FA;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border-radius:14px;overflow:hidden">
<tr><td style="padding:22px 28px 0;font:800 22px Arial,sans-serif;letter-spacing:-.04em;color:#00032E">zemmz <span style="font:700 10px Arial,sans-serif;letter-spacing:.12em;color:#6B6A85">LIVE</span></td></tr>
<tr><td style="padding:18px 28px 10px;font:400 15px/1.6 Arial,sans-serif;color:#1F1D3D"><h1 style="font:700 20px/1.3 Arial,sans-serif;margin:0 0 14px;color:#00032E">${escapeHtml(opts.heading)}</h1>${p}${code}${button}</td></tr>
<tr><td style="padding:6px 28px 24px;font:400 12px/1.5 Arial,sans-serif;color:#6B6A85">${escapeHtml(opts.footer ?? 'You’re getting this because of an action on zemmz Live. If it wasn’t you, you can ignore this email.')}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [opts.heading, ...opts.paragraphs, opts.code ?? '', opts.button ? `${opts.button.label}: ${opts.button.url}` : ''].filter(Boolean).join('\n\n');
  return { html, text };
}

