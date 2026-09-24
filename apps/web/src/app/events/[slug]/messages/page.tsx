import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@zemmz/db';
import { eventType, formatShortDateTime, lowerFirst } from '@zemmz/shared';
import { can, requirePermission } from '@/lib/auth';
import { mergeValuesFor } from '@/lib/email';
import { AUDIENCES, audienceWhere, type Audience } from '@/lib/audiences';
import { fmt } from '@/lib/format';
import { sendBroadcast, saveTemplate } from './actions';
import { TemplateEditor } from './template-editor';

export const metadata: Metadata = { title: 'Messages' };

export default async function MessagesPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { slug } = await params;
  const { tab = 'confirm' } = await searchParams;
  const { event } = await requirePermission(slug, can.sendMessages);
  const TY = eventType(event.type);
  const base = `/events/${slug}/messages`;

  const [template, sample] = await Promise.all([
    prisma.messageTemplate.findUnique({ where: { eventId_kind: { eventId: event.id, kind: 'CONFIRMATION' } } }),
    prisma.registration.findFirst({ where: { eventId: event.id, status: 'CONFIRMED' }, orderBy: { publicId: 'asc' }, include: { ticketType: true } }),
  ]);
  const sampleValues = mergeValuesFor(event, sample ?? { firstName: 'Sara', lastName: 'Nasser', title: '', publicId: 1001 }, sample?.ticketType);

  const tabs: [string, string][] = [['confirm', 'Confirmation email'], ['send', 'Send a message'], ['sent', 'Sent']];

  return (
    <>
      <div className="ph">
        <div>
          <h1>Messages</h1>
          <p>Emails go out from the outbox within 20 seconds and are retried if the provider is busy.</p>
        </div>
      </div>
      <nav className="tabs" aria-label="Messages">
        {tabs.map(([k, l]) => <Link key={k} href={`${base}?tab=${k}`} aria-current={tab === k ? 'page' : undefined}>{l}</Link>)}
      </nav>

      {tab === 'confirm' && (
        <>
          <p className="mb-4 mt-0 max-w-[70ch] text-ink-2">Sent automatically to everyone who registers, with their {lowerFirst(TY.idName)} and a link to their {TY.badge}.</p>
          <TemplateEditor
            action={saveTemplate.bind(null, slug)}
            initial={{ subject: template?.subject ?? `Your ${TY.one} for ${event.name}`, bodyHtml: template?.bodyHtml ?? '<p>Hi <b>{first_name}</b>,</p><p>You’re registered.</p>', kicker: template?.kicker ?? 'CONFIRMATION' }}
            sample={sampleValues}
            accent={event.accentColour}
            withKicker
            submitLabel="Save confirmation email"
          />
        </>
      )}

      {tab === 'send' && <SendTab slug={slug} eventId={event.id} accent={event.accentColour} sample={sampleValues} />}
      {tab === 'sent' && <SentTab eventId={event.id} tz={event.timezone} />}
    </>
  );
}

async function SendTab({ slug, eventId, accent, sample }: { slug: string; eventId: string; accent: string; sample: ReturnType<typeof mergeValuesFor> }) {
  const counts = await Promise.all((Object.keys(AUDIENCES) as Audience[]).map(async (a) => [a, await prisma.registration.count({ where: audienceWhere(eventId, a) })] as const));
  const smsReady = (process.env.MESSAGING_PROVIDER ?? 'log') === 'log';
  return (
    <TemplateEditor
      action={sendBroadcast.bind(null, slug)}
      initial={{ subject: '', bodyHtml: '<p>Hi {first_name},</p><p></p>' }}
      sample={sample}
      accent={accent}
      submitLabel="Send message"
      confirmText="Send this message now? It can’t be recalled once it’s sent."
    >
      <fieldset className="m-0 mb-3.5 border-0 p-0">
        <legend className="mb-2 text-[13px] font-medium text-ink-2">Send to</legend>
        <div className="opt-cards">
          {counts.map(([a, n], i) => (
            <label className="opt-card" key={a}>
              <input type="radio" name="audience" value={a} defaultChecked={i === 0} className="sr-only" />
              <b>{AUDIENCES[a]}</b>
              <small>{fmt(n)} {n === 1 ? 'person' : 'people'}</small>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="m-0 mb-3.5 border-0 p-0">
        <legend className="mb-2 text-[13px] font-medium text-ink-2">Channel</legend>
        <div className="flex gap-4 text-[13.5px]">
          <label className="flex items-center gap-2"><input type="radio" name="channel" value="email" defaultChecked /> Email</label>
          <label className="flex items-center gap-2"><input type="radio" name="channel" value="sms" /> SMS {!smsReady && <span className="tag">No SMS provider yet</span>}</label>
        </div>
      </fieldset>
    </TemplateEditor>
  );
}

async function SentTab({ eventId, tz }: { eventId: string; tz: string }) {
  const sent = await prisma.broadcast.findMany({
    where: { eventId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { _count: { select: { messages: true } }, messages: { where: { status: 'FAILED' }, select: { id: true } } },
  });
  if (!sent.length) return <div className="card empty"><h3>Nothing sent yet</h3><p>Messages you send to your audience appear here with how many were delivered.</p></div>;
  const delivered = await prisma.outboundMessage.groupBy({ by: ['broadcastId'], where: { broadcastId: { in: sent.map((s) => s.id) }, status: 'SENT' }, _count: { _all: true } });
  const dmap = new Map(delivered.map((d) => [d.broadcastId, d._count._all]));
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead><tr><th>Sent</th><th>Subject</th><th>To</th><th>Channel</th><th className="num">Recipients</th><th>Delivery</th><th>By</th></tr></thead>
        <tbody>
          {sent.map((b) => {
            const tracked = b._count.messages > 0;
            const ok = dmap.get(b.id) ?? 0;
            const failed = b.messages.length;
            return (
              <tr key={b.id}>
                <td className="muted whitespace-nowrap">{formatShortDateTime(b.createdAt, tz)}</td>
                <td className="font-semibold">{b.subject}</td>
                <td>{b.audience}</td>
                <td>{b.channel === 'SMS' ? 'SMS' : 'Email'}</td>
                <td className="num">{fmt(b.recipientCount)}</td>
                <td>
                  {!tracked ? <span className="badge b-neutral">Before tracking</span>
                    : failed ? <span className="badge b-danger">{fmt(failed)} failed</span>
                    : ok >= b._count.messages ? <span className="badge b-ok">Delivered</span>
                    : <span className="badge b-warn">{fmt(ok)} of {fmt(b._count.messages)}</span>}
                </td>
                <td className="muted">{b.sentByLabel}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
