import type { Metadata } from 'next';
import { sanitizeRichText } from '@zemmz/shared';
import { siteFor } from '@/lib/play/site';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return { title: (await siteFor((await params).slug)).t.nav.faq };
}

/** Each subheading and what follows it becomes a question that opens. */
function toDetails(html: string) {
  const parts = html.split(/(?=<h3>)/);
  if (parts.length < 2) return null;
  return parts.filter((p) => p.startsWith('<h3>')).map((p) => {
    const m = /^<h3>([\s\S]*?)<\/h3>([\s\S]*)$/.exec(p);
    return m ? { q: m[1], a: m[2] } : null;
  }).filter(Boolean) as { q: string; a: string }[];
}

export default async function Faq({ params }: { params: Promise<{ slug: string }> }) {
  const { project, t } = await siteFor((await params).slug);
  const html = sanitizeRichText(project.faqHtml);
  const qs = toDetails(html);
  const intro = html.split('<h3>')[0];
  return (
    <section>
      <div className="wrap" style={{ maxWidth: 860 }}>
        <div className="sec-h"><h2>{t.nav.faq}</h2></div>
        {qs ? (
          <div className="faq prose">
            {intro && <div dangerouslySetInnerHTML={{ __html: intro }} />}
            {qs.map((x, i) => <details key={i} open={i === 0}><summary dangerouslySetInnerHTML={{ __html: x.q }} /><div dangerouslySetInnerHTML={{ __html: x.a }} /></details>)}
          </div>
        ) : <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />}
      </div>
    </section>
  );
}
