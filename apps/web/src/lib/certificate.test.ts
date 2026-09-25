import { describe, expect, it } from 'vitest';
import { certificateBodyHtml } from './certificate';

describe('certificateBodyHtml', () => {
  it('fills every merge field and escapes the organiser’s text', () => {
    const html = certificateBodyHtml({ bodyText: 'By {provider}: {credits} points <script>x</script>, {credits} again', provider: 'KIMS & <b>co</b>' }, 4.5, 'Session 1');
    expect(html).toBe('By KIMS &amp; &lt;b&gt;co&lt;/b&gt;: <b>4.5</b> points &lt;script&gt;x&lt;/script&gt;, <b>4.5</b> again');
  });

  it('escapes session titles', () => {
    expect(certificateBodyHtml({ bodyText: 'For {sessions}.', provider: '' }, 0, 'Q&A <live>')).toBe('For Q&amp;A &lt;live&gt;.');
  });
});
