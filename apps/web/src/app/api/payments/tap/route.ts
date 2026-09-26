import { NextResponse } from 'next/server';
import { prisma } from '@zemmz/db';
import { syncOrder } from '@/lib/orders';
import { syncPurchase } from '@/lib/billing';
import { syncEntryOrder } from '@/lib/play/entry-payments';

/**
 * Tap webhook (the charge's post.url). The body is only used to find the
 * order: its status is fetched from Tap with our secret key, so a forged
 * request can't mark anything paid.
 */
export async function POST(req: Request) {
  let body: { id?: string; object?: string; reference?: { order?: string }; metadata?: { orderId?: string } };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad body' }, { status: 400 });
  }
  if (!body.id?.startsWith('chg_')) return NextResponse.json({ ok: true });
  const orderId = body.metadata?.orderId ?? body.reference?.order ?? '-';
  const order = await prisma.order.findFirst({ where: { OR: [{ providerSession: body.id }, { id: orderId }], provider: 'tap' } });
  if (order) {
    await syncOrder({ ...order, providerSession: order.providerSession ?? body.id });
    return NextResponse.json({ ok: true });
  }
  const plan = await prisma.planPurchase.findFirst({ where: { OR: [{ providerSession: body.id }, { id: orderId }], provider: 'tap' } });
  if (!plan) {
    const entry = await prisma.entryOrder.findFirst({ where: { OR: [{ providerSession: body.id }, { id: orderId }], provider: 'tap' } });
    if (!entry) return NextResponse.json({ ok: true, note: 'unknown order' });
    await syncEntryOrder({ ...entry, providerSession: entry.providerSession ?? body.id });
    return NextResponse.json({ ok: true });
  }
  await syncPurchase({ ...plan, providerSession: plan.providerSession ?? body.id });
  return NextResponse.json({ ok: true });
}
