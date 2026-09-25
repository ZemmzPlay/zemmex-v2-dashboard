'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@zemmz/db';
import { can, requireUser } from '@/lib/auth';
import { failed, type ActionState } from '@/lib/action-state';
import { logActivity } from '@/lib/activity';
import { ensurePlayTrial, playQuote, websiteAllowance } from '@/lib/play/billing';
import { paymentProvider, paymentsReady, PaymentError, startCheckout } from '@/lib/payments';
import { sign } from '@/lib/order-tokens';
import { appUrl } from '@/lib/email';
import { planDef } from '@/lib/plans';
import { slugify } from '@/lib/play/core';

const RESERVED = new Set(['new', 'plan', 'admin', 'api', 'www', 'play', 'help']);

export async function createProject(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!can.manageEvent(user.role)) return failed('Only owners and admins can create tournament websites.');
  const name = String(fd.get('name') ?? '').trim();
  if (name.length < 2 || name.length > 80) return failed('Give the website a name, for example Qatar Winter Cup.');
  const slug = slugify(String(fd.get('slug') ?? '') || name, 'league');
  if (slug.length < 3 || RESERVED.has(slug)) return failed('Choose a web address of at least 3 letters, for example winter-cup.');
  if (await prisma.playProject.findUnique({ where: { slug } })) return failed(`${slug}.zemmz.gg is taken. Try adding the year or your city.`);
  const org = await prisma.organisation.findUniqueOrThrow({ where: { id: user.organisationId } });
  const block = await websiteAllowance(org);
  if (block) return failed(block);
  const lang = String(fd.get('language') ?? 'BOTH');
  const tz = String(fd.get('timezone') ?? 'Asia/Dubai');
  const p = await prisma.playProject.create({
    data: {
      organisationId: org.id, slug, name, description: String(fd.get('description') ?? '').trim().slice(0, 300),
      siteLanguage: lang === 'EN' || lang === 'AR' ? lang : 'BOTH', timezone: tz,
      heroTitle: name, heroText: 'Free, open tournaments for players across the Gulf.',
      rulesHtml: '<h2>General rules</h2><ul><li>Record every match and keep the recording in case of a dispute.</li><li>Don’t message, harass or distract opponents.</li><li>Don’t manipulate your connection to affect gameplay.</li></ul><h2>Reporting scores</h2><p>Within 15 minutes of finishing, upload a screenshot of the result screen from My matches. An admin checks it and confirms the winner.</p>',
      faqHtml: '<h3>Is it free to take part?</h3><p>Each tournament page says whether there’s an entry fee.</p><h3>How do I report my score?</h3><p>Go to My matches, enter the score and upload a screenshot of the result screen.</p>',
    },
  });
  await ensurePlayTrial(org.id);
  await logActivity(user, null, `created the tournament website ${name}`);
  redirect(`/play/${p.slug}?welcome=1`);
}

export async function setProjectArchived(slug: string, archived: boolean) {
  const user = await requireUser();
  if (!can.manageEvent(user.role)) return;
  const p = await prisma.playProject.findFirst({ where: { slug, organisationId: user.organisationId } });
  if (!p) return;
  if (!archived) {
    const block = await websiteAllowance(await prisma.organisation.findUniqueOrThrow({ where: { id: user.organisationId } }));
    if (block) return;
  }
  await prisma.playProject.update({ where: { id: p.id }, data: { archivedAt: archived ? new Date() : null } });
  await logActivity(user, null, `${archived ? 'archived' : 'restored'} the tournament website ${p.name}`);
  revalidatePath('/play');
}


/** Pays for zemmz Play Club or Season, a month or a year at a time, by card. */
export async function buyPlayPlan(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!can.manageEvent(user.role)) return failed('Only owners and admins can change the plan.');
  const plan = String(fd.get('plan'));
  const months = Number(fd.get('months')) === 12 ? 12 : 1;
  if (plan !== 'PLAY_CLUB' && plan !== 'PLAY_SEASON') return failed('Choose Club or Season.');
  if (!paymentsReady()) return failed('Card payments aren’t set up yet. Contact us for an invoice instead.');
  const org = await prisma.organisation.findUniqueOrThrow({ where: { id: user.organisationId } });
  if (plan === 'PLAY_CLUB') {
    const used = await prisma.playProject.count({ where: { organisationId: org.id, archivedAt: null } });
    if (used > 1) return failed(`Club includes one website and you have ${used}. Archive the others first, or choose Season.`);
  }
  const q = playQuote(plan, months, org.country)!;
  const purchase = await prisma.planPurchase.create({
    data: { organisationId: org.id, plan, months, currency: q.currency, amountMinor: q.amountMinor, vatMinor: q.vatMinor, totalMinor: q.totalMinor, provider: paymentProvider(), byLabel: user.name },
  });
  const token = sign('plan', purchase.id);
  let url: string;
  try {
    const base = `${appUrl()}/organisation/billing`;
    const c = await startCheckout({
      orderId: purchase.id, amountMinor: q.totalMinor, currency: q.currency, locale: 'en',
      description: `zemmz Play: ${planDef(plan).name}, ${months === 12 ? '12 months' : '1 month'}`,
      buyer: { name: user.name, email: user.email },
      returnUrl: `${base}/return?p=${token}&s={SESSION}`, cancelUrl: `${base}/cancel?p=${token}`,
      webhookUrl: `${appUrl()}/api/payments/${paymentProvider()}`, mockUrl: `/organisation/billing/test/${token}`,
    });
    await prisma.planPurchase.update({ where: { id: purchase.id }, data: { providerSession: c.session } });
    url = c.url;
  } catch (e) {
    await prisma.planPurchase.update({ where: { id: purchase.id }, data: { status: 'FAILED' } });
    return failed(`${e instanceof PaymentError ? e.message : 'The payment provider could not be reached.'} Nothing was charged.`);
  }
  redirect(url);
}
