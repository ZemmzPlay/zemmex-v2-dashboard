import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@zemmz/db';
import { playCan, requireProjectPermission } from '@/lib/play/core';
import { Icon } from '@/components/icon';
import { TournamentForm } from '../../tournament-form';
import { formValues } from '../../values';
import { saveTournament } from '../../actions';

export const metadata: Metadata = { title: 'Edit tournament' };

export default async function EditTournament({ params }: { params: Promise<{ project: string; t: string }> }) {
  const { project: slug, t: tSlug } = await params;
  const { project } = await requireProjectPermission(slug, playCan.runTournaments);
  const t = await prisma.tournament.findUnique({ where: { projectId_slug: { projectId: project.id, slug: tSlug } } });
  if (!t || t.status === 'ENDED' || t.status === 'CANCELLED') notFound();
  const started = t.status === 'LIVE';
  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb"><Link href={`/play/${slug}/tournaments`}>Tournaments</Link> <Icon name="chevr" size={12} /> <Link href={`/play/${slug}/tournaments/${t.slug}`}>{t.name}</Link> <Icon name="chevr" size={12} /> <span>Edit</span></nav>
      <div className="ph"><div><h1>Edit {t.name}</h1><p>{started ? 'The bracket exists, so only the name, description, prizes and end date can change.' : 'Changes show on the website straight away.'}</p></div></div>
      <TournamentForm action={saveTournament.bind(null, slug, t.id)} initial={formValues(t, project.timezone)} editing started={started} bilingual={project.siteLanguage !== 'EN'} />
    </>
  );
}
