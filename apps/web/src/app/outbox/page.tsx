import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@zemmz/db';
import { formatShortDateTime } from '@zemmz/shared';
import { requireUser } from '@/lib/auth';
import { DashboardShell } from '@/components/shell/dashboard-shell';

export const metadata: Metadata = { title: 'Email outbox' };

/**
 * Development mail viewer. With MESSAGING_PROVIDER=log nothing leaves the
 * machine; every email and SMS the worker "sends" can be read here.
 */
export default async function OutboxPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  if (process.env.MESSAGING_PROVIDER === 'sendgrid') notFound();
  const user = await requireUser();
  const { id } = await searchParams;
  const where = { event: { organisationId: user.organisationId } };
  const [rows, open] = await Promise.all([
    prisma.outboundMessage.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100, include: { event: { select: { timezone: true, name: true } } } }),
    id ? prisma.outboundMessage.findFirst({ where: { id, ...where } }) : null,
  ]);
  const tz = 'Asia/Dubai';
  const badge = (s: string) => (s === 'SENT' ? 'b-ok' : s === 'FAILED' ? 'b-danger' : s === 'SENDING' ? 'b-info' : 'b-warn');

  return (
    <DashboardShell user={user}>
      <div className="ph">
        <div>
          <h1>Email outbox</h1>
          <p>Local development only. Messages are stored, not sent. Set MESSAGING_PROVIDER=sendgrid to deliver them.</p>
        </div>
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_600px]">
        <div className="tbl-wrap">
          {rows.length === 0 ? (
            <div className="empty"><h3>No messages yet</h3><p>Register on an event website or send a message from the dashboard.</p></div>
          ) : (
            <table className="tbl">
              <thead><tr><th>Queued</th><th>To</th><th>Subject</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id} className={m.id === id ? '[&>td]:!bg-brand-soft' : ''}>
                    <td className="muted whitespace-nowrap">{formatShortDateTime(m.createdAt, m.event?.timezone ?? tz)}</td>
                    <td className="max-w-[200px] truncate">{m.channel === 'SMS' ? `SMS ${m.toAddress}` : m.toAddress}</td>
                    <td><Link href={`/outbox?id=${m.id}`} className="rowlink">{m.subject}</Link></td>
                    <td><span className={`badge ${badge(m.status)}`}>{m.status.toLowerCase()}</span>{m.lastError && <div className="muted">{m.lastError}</div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {open && (
          <section className="card overflow-hidden" aria-label="Message">
            <div className="border-b border-line px-4 py-3 text-[13px]">
              <div><span className="text-muted">To</span> {open.toName} &lt;{open.toAddress}&gt;</div>
              <div><span className="text-muted">Subject</span> <b>{open.subject}</b></div>
            </div>
            {open.html ? (
              <iframe title="Email preview" srcDoc={open.html} sandbox="" className="h-[640px] w-full border-0 bg-white" />
            ) : (
              <pre className="m-0 whitespace-pre-wrap p-4 text-[13px]">{open.text}</pre>
            )}
          </section>
        )}
      </div>
    </DashboardShell>
  );
}
