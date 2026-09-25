import { NextResponse } from 'next/server';
import { prisma } from '@zemmz/db';
import { verify } from '@/lib/order-tokens';
import { appUrl } from '@/lib/email';
import { syncEntryOrder } from '@/lib/play/entry-payments';

/** Back from paying an entry fee: the provider is asked whether it was paid. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(req.url);
  const id = verify('entry', url.searchParams.get('o') ?? '');
  const o = id ? await prisma.entryOrder.findUnique({ where: { id } }) : null;
  const to = (q: string) => NextResponse.redirect(new URL(`/p/${slug}/me${q}`, appUrl()), 303);
  if (!o) return to('');
  const state = await syncEntryOrder({ ...o, providerSession: o.providerSession ?? url.searchParams.get('tap_id') }).catch(() => 'pending' as const);
  return to(`?payment=${state}`);
}
