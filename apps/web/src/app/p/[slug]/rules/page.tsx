import type { Metadata } from 'next';
import { sanitizeRichText } from '@zemmz/shared';
import { siteFor } from '@/lib/play/site';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return { title: (await siteFor((await params).slug)).t.nav.rules };
}

export default async function Rules({ params }: { params: Promise<{ slug: string }> }) {
  const { project, t } = await siteFor((await params).slug);
  return <section><div className="wrap" style={{ maxWidth: 860 }}><div className="sec-h"><h2>{t.nav.rules}</h2></div><div className="prose" dangerouslySetInnerHTML={{ __html: sanitizeRichText(project.rulesHtml) }} /></div></section>;
}
