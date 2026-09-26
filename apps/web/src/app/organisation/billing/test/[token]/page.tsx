import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@zemmz/db';
import { formatMoney } from '@zemmz/shared';
import { requireUser } from '@/lib/auth';
import { verify } from '@/lib/order-tokens';
import { paymentProvider } from '@/lib/payments';
import { markPurchaseFailed, markPurchasePaid } from '@/lib/billing';
import { planDef } from '@/lib/plans';

export const metadata: Metadata = { title: 'Test payment', robots: { index: false } };

/** Stands in for the provider's page when PAYMENT_PROVIDER=mock. Never in production. */
export default async function TestPlanPayment({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (paymentProvider() !== 'mock' || process.env.NODE_ENV === 'production') notFound();
  const user = await requireUser();
  const id = verify('plan', token);
  const p = id ? await prisma.planPurchase.findFirst({ where: { id, organisationId: user.organisationId, provider: 'mock' } }) : null;
  if (!p) notFound();
  const back = planDef(p.plan).product === 'play' ? '/play/plan?x=1' : '/organisation?tab=plan';
  if (p.status !== 'PENDING') redirect(back);

  async function approve() {
    'use server';
    await markPurchasePaid(p!.id, `test_${p!.id.slice(-8)}`);
    redirect(`${back}&payment=paid`);
  }
  async function decline() {
    'use server';
    await markPurchaseFailed(p!.id);
    redirect(`${back}&payment=failed`);
  }
  const money = formatMoney(p.totalMinor, p.currency);
  return (
    <main className="grid min-h-dvh place-items-center bg-bg p-6">
      <div className="card w-full max-w-[420px] p-6">
        <p className="m-0 text-[12px] font-bold tracking-[.08em] text-muted">TEST PAYMENT</p>
        <h1 className="mb-1 mt-2 text-[26px] font-bold">{money}</h1>
        <p className="mt-0 text-[14px] text-ink-2">zemmz {planDef(p.plan).product === 'play' ? 'Play' : 'Live'} · {planDef(p.plan).name} plan{p.months > 1 ? `, ${p.months} months` : ''}</p>
        <div className="notice warn mb-4">This page stands in for the payment provider in test mode. Nothing is charged.</div>
        <form className="grid gap-2.5">
          <button formAction={approve} className="btn primary">Approve {money}</button>
          <button formAction={decline} className="btn secondary">Decline the payment</button>
        </form>
      </div>
    </main>
  );
}
