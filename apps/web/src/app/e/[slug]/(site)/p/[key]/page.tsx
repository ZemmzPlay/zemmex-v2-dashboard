import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@zemmz/db';
import { localise, sanitizeRichText } from '@zemmz/shared';
import { siteTextFor } from '@/lib/site-locale';
import { getPublicEvent } from '@/lib/public-event';

async function load(slug: string, key: string) {
  const event = await getPublicEvent(slug);
  const { locale } = await siteTextFor(event);
  const page = await prisma.sitePage.findUnique({ where: { eventId_key: { eventId: event.id, key } } });
  if (!page) notFound();
  return localise(page, locale);
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; key: string }> }): Promise<Metadata> {
  const { slug, key } = await params;
  return { title: (await load(slug, key)).title };
}

export default async function CustomPage({ params }: { params: Promise<{ slug: string; key: string }> }) {
  const { slug, key } = await params;
  const page = await load(slug, key);
  return (
    <div className="wrap pb-20">
      <div className="page-h"><h1>{page.title}</h1></div>
      <div className="prose" dangerouslySetInnerHTML={{ __html: sanitizeRichText(page.bodyHtml) }} />
    </div>
  );
}
