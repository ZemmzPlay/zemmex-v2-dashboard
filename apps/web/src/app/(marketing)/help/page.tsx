import type { Metadata } from 'next';
import Link from 'next/link';
import { EVENT_TYPE_KEYS, eventType, isEventTypeKey } from '@zemmz/shared';
import { getCurrentUser } from '@/lib/auth';
import { helpData } from '@/lib/help';
import { MarketingNav } from '@/components/marketing/nav';
import { MarketingFooter } from '@/components/marketing/footer';

export const metadata: Metadata = { title: 'Help centre', description: 'How to set up, run and close an event with zemmz Live.' };

/** The public help centre. Inside the dashboard the same guides use your event's words and add on-screen tours. */
export default async function PublicHelp({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type = 'conference' } = await searchParams;
  const key = isEventTypeKey(type) ? type : 'conference';
  const TY = eventType(key);
  const user = await getCurrentUser();
  const cats = helpData(TY, !TY.credits);
  return (
    <div className="z">
      <MarketingNav signedIn={!!user} />
      <main className="legal-page" style={{ maxWidth: 980 }}>
        <h1>Help centre</h1>
        <p>Guides for every stage of your event. Choose your type of event to see the words your dashboard uses.{user && <> In your dashboard, the Help centre also has on-screen tours.</>}</p>
        <div className="chips" role="group" aria-label="Type of event" style={{ margin: '16px 0 8px' }}>
          {EVENT_TYPE_KEYS.map((k) => <Link key={k} href={`/help?type=${k}`} className="chip" aria-pressed={k === key} aria-current={k === key ? 'true' : undefined} style={{ textDecoration: 'none' }}>{eventType(k).label}</Link>)}
        </div>
        {cats.map((c) => (
          <section key={c.name}>
            <h2>{c.name}</h2>
            {c.articles.map((a) => (
              <details key={a.id} style={{ borderTop: '1px solid var(--z-rule)', padding: '12px 0' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{a.title} <span style={{ color: 'var(--z-slate)', fontWeight: 400 }}>· {a.summary}</span></summary>
                <ol style={{ margin: '12px 0 0', paddingLeft: 22 }}>{a.steps.map((s) => <li key={s}>{s}</li>)}</ol>
                {a.tip && <p style={{ marginTop: 8 }}><b>Tip:</b> {a.tip}</p>}
              </details>
            ))}
          </section>
        ))}
        <p style={{ marginTop: 32 }}>Still stuck? <Link href="/contact">Get in touch</Link>.</p>
      </main>
      <MarketingFooter />
    </div>
  );
}
