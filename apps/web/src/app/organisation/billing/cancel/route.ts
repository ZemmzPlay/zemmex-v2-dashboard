import { NextResponse } from 'next/server';
import { prisma } from '@zemmz/db';
import { verify } from '@/lib/order-tokens';
import { markPurchaseFailed, syncPurchase } from '@/lib/billing';
import { appUrl } from '@/lib/email';
import { planDef } from '@/lib/plans';

export async function GET(req: Request) {
  const id = verify('plan', new URL(req.url).searchParams.get('p') ?? '');
  const p = id ? await prisma.planPurchase.findUnique({ where: { id } }) : null;
  if (p && (await syncPurchase(p).catch(() => 'pending' as const)) !== 'paid') await markPurchaseFailed(p.id);
  return NextResponse.redirect(new URL(p && planDef(p.plan).product === 'play' ? '/play/plan?payment=cancelled' : '/organisation?tab=plan&payment=cancelled', appUrl()), 303);
}
