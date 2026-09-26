import { NextResponse } from 'next/server';
import { prisma } from '@zemmz/db';
import { verify } from '@/lib/order-tokens';
import { appUrl } from '@/lib/email';
import { markEntryFailed, syncEntryOrder } from '@/lib/play/entry-payments';

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const id = verify('entry', new URL(req.url).searchParams.get('o') ?? '');
  const o = id ? await prisma.entryOrder.findUnique({ where: { id } }) : null;
  if (o && (await syncEntryOrder(o).catch(() => 'pending' as const)) !== 'paid') await markEntryFailed(o.id);
  return NextResponse.redirect(new URL(`/p/${slug}/me?payment=cancelled`, appUrl()), 303);
}
