import { requireProject } from '@/lib/play/core';
import { DashboardShell } from '@/components/shell/dashboard-shell';

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ project: string }> }) {
  const { project: slug } = await params;
  const { user, project } = await requireProject(slug);
  return (
    <DashboardShell user={user} play={project}>
      {children}
    </DashboardShell>
  );
}
