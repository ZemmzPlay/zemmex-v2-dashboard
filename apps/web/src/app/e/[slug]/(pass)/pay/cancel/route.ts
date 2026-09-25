import { NextResponse } from 'next/server';
import { prisma } from '@zemmz/db';
import { verify } from '@/lib/order-tokens';
import { markOrderFailed, syncOrder } from '@/lib/orders';
import { appUrl } from '@/lib/email';

/** The buyer left the provider's page without paying: release the seats. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const token = new URL(req.url).searchParams.get('o') ?? '';
  const id = verify('order', token);
  const order = id ? await prisma.order.findFirst({ where: { id, event: { slug } } }) : null;
  if (order) {
    // Make sure it really wasn't paid before letting the seats go.
    const state = await syncOrder(order).catch(() => 'pending' as const);
    if (state === 'paid') return NextResponse.redirect(new URL(`/e/${slug}/order/${token}`, appUrl()), 303);
    await markOrderFailed(order.id);
  }
  return NextResponse.redirect(new URL(`/e/${slug}/checkout?payment=cancelled${order ? `&retry=${token}` : ''}`, appUrl()), 303);
}
