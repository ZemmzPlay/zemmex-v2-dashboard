import type { Metadata } from 'next';
import Link from 'next/link';
import { playCan, requireProjectPermission } from '@/lib/play/core';
import { Icon } from '@/components/icon';
import { TournamentForm } from '../tournament-form';
import { formValues } from '../values';
import { saveTournament } from '../actions';

export const metadata: Metadata = { title: 'New tournament' };

export default async function NewTournament({ params }: { params: Promise<{ project: string }> }) {
  const { project: slug } = await params;
  const { project } = await requireProjectPermission(slug, playCan.runTournaments);
  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb"><Link href={`/play/${slug}/tournaments`}>Tournaments</Link> <Icon name="chevr" size={12} /> <span>New tournament</span></nav>
      <div className="ph"><div><h1>New tournament</h1><p>Players can register once it’s published and its registration opens.</p></div></div>
      <TournamentForm action={saveTournament.bind(null, slug, null)} initial={formValues(null, project.timezone)} editing={false} started={false} bilingual={project.siteLanguage !== 'EN'} />
    </>
  );
}
