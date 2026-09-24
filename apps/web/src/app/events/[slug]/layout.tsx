import { requireEvent } from '@/lib/auth';
import { DashboardShell } from '@/components/shell/dashboard-shell';

export default async function EventLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, event } = await requireEvent(slug);
  return (
    <DashboardShell user={user} event={event}>
      {children}
    </DashboardShell>
  );
}
