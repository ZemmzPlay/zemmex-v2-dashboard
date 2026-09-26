import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@zemmz/db';
import { formatMoney } from '@zemmz/shared';
import { verify } from '@/lib/order-tokens';
import { paymentProvider } from '@/lib/payments';
import { markEntryFailed, markEntryPaid } from '@/lib/play/entry-payments';

export const metadata: Metadata = { title: 'Test payment', robots: { index: false } };

/** Stands in for the provider's page when PAYMENT_PROVIDER=mock. Never in production. */
export default async function TestEntryPayment({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  if (paymentProvider() !== 'mock' || process.env.NODE_ENV === 'production') notFound();
  const id = verify('entry', token);
  const o = id ? await prisma.entryOrder.findFirst({ where: { id, provider: 'mock' }, include: { tournament: true } }) : null;
  if (!o) notFound();
  if (o.status !== 'PENDING') redirect(`/p/${slug}/me`);
  async function approve() {
    'use server';
    await markEntryPaid(o!.id, `test_${o!.id.slice(-8)}`);
    redirect(`/p/${slug}/me?payment=paid`);
  }
  async function decline() {
    'use server';
    await markEntryFailed(o!.id);
    redirect(`/p/${slug}/me?payment=failed`);
  }
  const money = formatMoney(o.totalMinor, o.currency);
  return (
    <section>
      <div className="wrap">
        <div className="auth">
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: '.08em', color: 'var(--muted)' }}>TEST PAYMENT</p>
          <h1 style={{ margin: '8px 0 4px' }}>{money}</h1>
          <p className="sub">{o.tournament.name}: entry fee {formatMoney(o.amountMinor, o.currency)}, booking fee {formatMoney(o.feeMinor, o.currency)}</p>
          <div className="notice warn">This page stands in for the payment provider in test mode. Nothing is charged.</div>
          <form style={{ display: 'grid', gap: 10 }}>
            <button formAction={approve} className="btn primary">Approve {money}</button>
            <button formAction={decline} className="btn ghost">Decline the payment</button>
          </form>
        </div>
      </div>
    </section>
  );
}
