import { NextResponse } from 'next/server';
import { prisma } from '@zemmz/db';
import { verify } from '@/lib/order-tokens';
import { syncPurchase } from '@/lib/billing';
import { appUrl } from '@/lib/email';
import { planDef } from '@/lib/plans';

/** Back from paying for a plan. The provider is asked whether it was paid. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = verify('plan', url.searchParams.get('p') ?? '');
  const p = id ? await prisma.planPurchase.findUnique({ where: { id } }) : null;
  const play = p && planDef(p.plan).product === 'play';
  const to = (q: string) => NextResponse.redirect(new URL(play ? `/play/plan?x=1${q}` : `/organisation?tab=plan${q}`, appUrl()), 303);
  if (!p) return to('');
  const tapId = url.searchParams.get('tap_id');
  const state = await syncPurchase({ ...p, providerSession: p.providerSession ?? tapId }).catch(() => 'pending' as const);
  return to(state === 'paid' ? '&payment=paid' : state === 'failed' ? '&payment=failed' : '&payment=pending');
}
