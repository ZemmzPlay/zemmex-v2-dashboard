import { NextResponse } from 'next/server';
import { prisma } from '@zemmz/db';
import { verify } from '@/lib/order-tokens';
import { syncOrder } from '@/lib/orders';
import { appUrl } from '@/lib/email';

/**
 * The provider sends the buyer here after paying. The query string only says
 * which order; whether it was paid is asked of the provider.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(req.url);
  const token = url.searchParams.get('o') ?? '';
  const id = verify('order', token);
  const order = id ? await prisma.order.findFirst({ where: { id, event: { slug } } }) : null;
  const to = (path: string) => NextResponse.redirect(new URL(path, appUrl()), 303);
  if (!order) return to(`/e/${slug}`);
  // Tap adds the charge id as ?tap_id=; keep ours if the provider didn't.
  const tapId = url.searchParams.get('tap_id');
  if (tapId && order.provider === 'tap' && !order.providerSession) await prisma.order.update({ where: { id: order.id }, data: { providerSession: tapId } });
  let state: Awaited<ReturnType<typeof syncOrder>>;
  try {
    state = await syncOrder({ ...order, providerSession: order.providerSession ?? tapId });
  } catch {
    state = 'pending';
  }
  if (state === 'paid') return to(`/e/${slug}/order/${token}`);
  if (state === 'failed') return to(`/e/${slug}/checkout?payment=failed&retry=${token}`);
  return to(`/e/${slug}/pay/wait/${token}`);
}
