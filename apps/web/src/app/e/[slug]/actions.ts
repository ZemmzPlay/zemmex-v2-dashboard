'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma, type Prisma } from '@zemmz/db';
import { emailSchema, eventType, formatMoney, isCurrency, mobileSchema, ticketFee, type CurrencyCode, type SiteText, localiseAll, localise } from '@zemmz/shared';
import { siteTextFor } from '@/lib/site-locale';
import { createRegistrations, RegistrationError, resendConfirmation, validateAgainstForm, type PersonInput } from '@/lib/registrations';
import { getPublicEvent, homeState } from '@/lib/public-event';
import { rateLimit } from '@/lib/rate-limit';
import { ticketToken } from '@/lib/tokens';
import { sign, verify } from '@/lib/order-tokens';
import { cardProcessingMinor, paymentProvider, paymentsReady, PaymentError, startCheckout } from '@/lib/payments';
import { markOrderFailed, refundTickets, RefundError, selfRefundBlock } from '@/lib/orders';
import { appUrl } from '@/lib/email';

export interface PublicFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
  info?: string;
}

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

async function clientIp() {
  return (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
}

async function readPerson(eventId: string, fd: FormData, t: SiteText, prefix = '') {
  const fields = await prisma.formField.findMany({ where: { eventId, enabled: true }, orderBy: { sortOrder: 'asc' } });
  const g = (k: string) => s(fd, prefix + k);
  const answers: Record<string, string> = {};
  for (const f of fields) if (!['title', 'first', 'last', 'email', 'mob', 'spec', 'hosp', 'tk'].includes(f.key)) answers[f.key] = g(`a_${f.key}`);
  const p: PersonInput = {
    ticketTypeId: g('ticketTypeId') || null, title: g('title'), firstName: g('firstName'), lastName: g('lastName'),
    email: g('email'), mobile: g('mobile'), field1: g('field1'), field2: g('field2'), answers, consentMarketing: fd.get(prefix + 'consent') === 'on', locale: t.locale,
  };
  const errors = validateAgainstForm(fields, p, { ...t.err, term: t.term });
  const em = emailSchema.safeParse(p.email);
  if (!em.success) errors.email = t.locale === 'ar' ? t.err.email : em.error.issues[0].message;
  else p.email = em.data;
  const mob = mobileSchema.safeParse(p.mobile);
  if (!mob.success) errors.mob = t.locale === 'ar' ? t.err.mobile : mob.error.issues[0].message;
  else p.mobile = mob.data;
  return { p, errors };
}

/** Free registration from the homepage panel. */
export async function registerFree(slug: string, _p: PublicFormState, fd: FormData): Promise<PublicFormState> {
  const values = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]));
  const event = await getPublicEvent(slug);
  const { t } = await siteTextFor(event);
  if (s(fd, 'website')) return { error: t.err.generic }; // honeypot
  if (!rateLimit(`reg:${await clientIp()}`, 20, 10 * 60_000)) return { error: t.err.busy, values };
  if (homeState(event) !== 'open') return { error: t.err.regClosed, values };
  const { p, errors } = await readPerson(event.id, fd, t);

  const onSale = await prisma.ticketType.findMany({ where: { eventId: event.id, onSale: true }, orderBy: { sortOrder: 'asc' } });
  if (onSale.some((x) => x.priceMinor > 0)) return { error: t.err.sellsTickets, values };
  if (!p.ticketTypeId) p.ticketTypeId = onSale.length === 1 ? onSale[0].id : null;
  if (onSale.length > 1 && !onSale.some((x) => x.id === p.ticketTypeId)) errors.tk = t.err.chooseAttending;
  if (Object.keys(errors).length) return { error: t.err.checkFields, fieldErrors: errors, values };

  // One registration per email. Re-registering resends the confirmation instead
  // of creating a duplicate, without revealing anything on screen.
  const existing = await prisma.registration.findFirst({ where: { eventId: event.id, email: p.email, status: 'CONFIRMED' } });
  if (existing) {
    await resendConfirmation(event, existing.id);
    return { info: t.err.alreadyRegistered(p.email) };
  }

  let token: string;
  try {
    const [reg] = await createRegistrations({ event, people: [p], source: 'WEBSITE' });
    token = ticketToken(reg.id);
  } catch (e) {
    if (e instanceof RegistrationError) return { error: e.message, values };
    throw e;
  }
  redirect(`/e/${slug}/t/${token}?new=1`);
}

/* ------------------------------------------------------------------ */
/* Paid checkout                                                        */
/* ------------------------------------------------------------------ */

export interface CheckoutQuote {
  lines: { ticketTypeId: string; name: string; qty: number; unitMinor: number; paidEachMinor: number }[];
  subtotalMinor: number;
  discountMinor: number;
  /** VAT on the tickets after discount. */
  vatMinor: number;
  vatBps: number;
  /** The platform fee; added to the total only when passed on. */
  feeMinor: number;
  feePassedOn: boolean;
  totalMinor: number;
  promo: { code: string; percentOff: number } | null;
  currency: string;
  error?: string;
}

type QuoteEvent = { id: string; currency: string; vatBps: number; feePassedOn: boolean };

async function quote(event: QuoteEvent, wanted: Record<string, number>, promoCode: string, t: SiteText): Promise<CheckoutQuote> {
  const cur: CurrencyCode = isCurrency(event.currency) ? event.currency : 'AED';
  const types = localiseAll(await prisma.ticketType.findMany({ where: { eventId: event.id, onSale: true, id: { in: Object.keys(wanted) } }, orderBy: { sortOrder: 'asc' } }), t.locale);
  let promo: CheckoutQuote['promo'] = null;
  let error: string | undefined;
  if (promoCode) {
    const p = await prisma.promoCode.findUnique({ where: { eventId_code: { eventId: event.id, code: promoCode.toUpperCase() } } });
    if (!p || !p.active || (p.maxUses != null && p.uses >= p.maxUses)) error = t.err.promoInvalid(promoCode.toUpperCase());
    else promo = { code: p.code, percentOff: p.percentOff };
  }
  let subtotal = 0, discount = 0, vat = 0, fee = 0;
  const lines = types.filter((x) => wanted[x.id] > 0).map((x) => {
    const qty = Math.min(10, Math.floor(wanted[x.id]));
    const unitDiscount = promo ? Math.round((x.priceMinor * promo.percentOff) / 100) : 0;
    const net = x.priceMinor - unitDiscount;
    const unitVat = Math.round((net * event.vatBps) / 10_000);
    subtotal += x.priceMinor * qty;
    discount += unitDiscount * qty;
    vat += unitVat * qty;
    // The platform fee is per paid ticket, on the ticket price after discount, capped (docs/05).
    fee += ticketFee(net, cur) * qty;
    return { ticketTypeId: x.id, name: x.name, qty, unitMinor: x.priceMinor, paidEachMinor: net + unitVat };
  });
  const total = subtotal - discount + vat + (event.feePassedOn ? fee : 0);
  return { lines, subtotalMinor: subtotal, discountMinor: discount, vatMinor: vat, vatBps: event.vatBps, feeMinor: fee, feePassedOn: event.feePassedOn, totalMinor: total, promo, currency: event.currency, error };
}

export async function getQuote(slug: string, wanted: Record<string, number>, promoCode: string): Promise<CheckoutQuote> {
  const event = await getPublicEvent(slug);
  return quote(event, wanted, promoCode.trim(), (await siteTextFor(event)).t);
}

export async function placeOrder(slug: string, _p: PublicFormState, fd: FormData): Promise<PublicFormState> {
  const values = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]));
  const event = await getPublicEvent(slug);
  const { t } = await siteTextFor(event);
  if (!rateLimit(`order:${await clientIp()}`, 15, 10 * 60_000)) return { error: t.err.busy, values };
  if (homeState(event) !== 'open') return { error: t.err.salesClosed, values };

  let wanted: Record<string, number> = {};
  try {
    const raw = JSON.parse(s(fd, 'wanted') || '{}');
    if (raw && typeof raw === 'object') for (const [k, v] of Object.entries(raw)) if (typeof v === 'number' && v > 0) wanted[k] = v;
  } catch {
    wanted = {};
  }
  const q = await quote(event, wanted, s(fd, 'promo'), t);
  if (q.error) return { error: q.error, values };
  const count = q.lines.reduce((n, l) => n + l.qty, 0);
  if (!count) return { error: t.err.chooseTicket, values };
  const paid = q.totalMinor > 0;
  if (paid && !paymentsReady()) return { error: t.locale === 'ar' ? 'لم يتم إعداد الدفع لهذه الفعالية بعد. لم يُخصم أي مبلغ.' : 'Payments are not set up for this event yet. Nothing was charged.', values };

  // Buyer details, then one name per ticket (defaults to the buyer).
  const { p: buyer, errors } = await readPerson(event.id, fd, t, 'b_');
  if (Object.keys(errors).length) return { error: t.err.checkFields, fieldErrors: errors, values };
  const people: PersonInput[] = [];
  let i = 0;
  for (const l of q.lines) {
    for (let k = 0; k < l.qty; k++, i++) {
      const first = s(fd, `h${i}_first`) || buyer.firstName;
      const last = s(fd, `h${i}_last`) || buyer.lastName;
      people.push({ ...buyer, ticketTypeId: l.ticketTypeId, firstName: first, lastName: last, paidMinor: l.paidEachMinor });
    }
  }

  // Seats are taken (and capacity checked) in the same transaction as the
  // order. A paid order holds them as PENDING until the provider confirms.
  let orderId: string;
  try {
    orderId = await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          eventId: event.id, buyerName: `${buyer.firstName} ${buyer.lastName}`, buyerEmail: buyer.email, currency: event.currency,
          subtotalMinor: q.subtotalMinor, discountMinor: q.discountMinor, vatMinor: q.vatMinor, vatBps: q.vatBps, feeMinor: q.feeMinor, feePassedOn: q.feePassedOn, totalMinor: q.totalMinor,
          promoCodeId: q.promo ? (await tx.promoCode.findUnique({ where: { eventId_code: { eventId: event.id, code: q.promo.code } } }))?.id : null,
          provider: paid ? paymentProvider() : 'free', locale: t.locale, processingMinor: paid ? cardProcessingMinor(q.totalMinor) : 0,
          ...(paid ? {} : { status: 'PAID' as const, paidAt: new Date(), providerRef: 'free' }),
        },
      });
      await createRegistrations({ event, people, source: 'WEBSITE', orderId: order.id, tx, pending: paid });
      if (!paid && q.promo) await tx.promoCode.update({ where: { eventId_code: { eventId: event.id, code: q.promo.code } }, data: { uses: { increment: 1 } } });
      return order.id;
    });
  } catch (e) {
    if (e instanceof RegistrationError) return { error: e.message, values };
    throw e;
  }
  const token = sign('order', orderId);
  if (!paid) redirect(`/e/${slug}/order/${token}`);

  let url: string;
  try {
    const base = `${appUrl()}/e/${slug}/pay`;
    const checkout = await startCheckout({
      orderId, amountMinor: q.totalMinor, currency: event.currency, locale: t.locale,
      description: `${event.name}: ${t.ticketCount(count)}`,
      buyer: { name: `${buyer.firstName} ${buyer.lastName}`, email: buyer.email },
      returnUrl: `${base}/return?o=${token}&s={SESSION}`,
      cancelUrl: `${base}/cancel?o=${token}`,
      webhookUrl: `${appUrl()}/api/payments/${paymentProvider()}`,
      mockUrl: `/e/${slug}/pay/test/${token}`,
    });
    await prisma.order.update({ where: { id: orderId }, data: { providerSession: checkout.session } });
    url = checkout.url;
  } catch (e) {
    await markOrderFailed(orderId);
    const why = e instanceof PaymentError ? e.message : t.locale === 'ar' ? 'تعذّر الوصول إلى مزوّد الدفع.' : 'The payment provider could not be reached.';
    return { error: t.payment.failed(why), values };
  }
  redirect(url);
}

/* ------------------------------------------------------------------ */
/* After the event: certificates, recordings, after-show page           */
/* ------------------------------------------------------------------ */

export async function claim(slug: string, _p: PublicFormState, fd: FormData): Promise<PublicFormState> {
  const values = { publicId: s(fd, 'publicId'), email: s(fd, 'email') };
  const event = await getPublicEvent(slug);
  const TY = eventType(event.type);
  const { t } = await siteTextFor(event);
  if (!rateLimit(`claim:${await clientIp()}`, 30, 10 * 60_000)) return { error: t.err.busy, values };
  if (homeState(event) !== 'after') return { error: t.err.afterNotOpen, values };

  const id = Number(values.publicId.replace(/\D/g, ''));
  const email = values.email.toLowerCase();
  const fieldErrors: Record<string, string> = {};
  if (!id) fieldErrors.publicId = t.err.enterNumber;
  if (!email) fieldErrors.email = t.err.enterEmail;
  if (Object.keys(fieldErrors).length) return { fieldErrors, values };

  const reg = await prisma.registration.findUnique({ where: { eventId_publicId: { eventId: event.id, publicId: id } }, include: { _count: { select: { attendance: true } } } });
  // Same message whether the ID or the email is wrong, so IDs can't be probed.
  if (!reg || reg.email !== email) return { error: t.err.notFound(id), values };
  if (reg.status !== 'CONFIRMED') return { error: t.err.cancelled, values };

  const after = await prisma.afterEventPage.findUnique({ where: { eventId: event.id } });
  const attended = reg._count.attendance > 0;
  const gate = TY.cert !== 'none' || (after?.attendeesOnly ?? true);
  if (gate && !attended) {
    return {
      error: TY.cert === 'none' ? t.err.noShowAfter : t.err.noShowCert,
      values,
    };
  }
  redirect(`/e/${slug}/after/${sign('claim', reg.id)}`);
}

export async function submitEvaluation(slug: string, token: string, _p: PublicFormState, fd: FormData): Promise<PublicFormState> {
  const event = await getPublicEvent(slug);
  const { t } = await siteTextFor(event);
  const regId = verify('claim', token);
  if (!regId) return { error: t.err.linkExpired };
  const reg = await prisma.registration.findFirst({ where: { id: regId, eventId: event.id } });
  if (!reg) return { error: t.err.linkExpired };
  const questions = await prisma.evaluationQuestion.findMany({ where: { eventId: event.id }, orderBy: { sortOrder: 'asc' } });
  const fieldErrors: Record<string, string> = {};
  const answers: Prisma.EvaluationAnswerCreateManyResponseInput[] = [];
  for (const q of questions) {
    const raw = s(fd, `q_${q.id}`);
    if (q.required && !raw && q.kind !== 'CHECK') fieldErrors[q.id] = t.err.answerThis;
    if ((q.kind === 'RATING' || q.kind === 'CHOICE') && raw) answers.push({ questionId: q.id, rating: Math.min(5, Math.max(1, Number(raw) || 1)) });
    else if (q.kind === 'CHECK' && fd.get(`q_${q.id}`) === 'on') answers.push({ questionId: q.id, checked: true });
    else if (q.kind === 'TEXT' && raw) answers.push({ questionId: q.id, text: raw.slice(0, 2000) });
  }
  if (Object.keys(fieldErrors).length) return { error: t.err.answerRequired, fieldErrors, values: Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)])) };
  await prisma.evaluationResponse.upsert({
    where: { registrationId: reg.id },
    update: {},
    create: { eventId: event.id, registrationId: reg.id, answers: { createMany: { data: answers } } },
  });
  redirect(`/e/${slug}/after/${token}`);
}

/* ------------------------------------------------------------------ */
/* Buyer cancels a ticket within the refund window                      */
/* ------------------------------------------------------------------ */

export async function cancelOwnTicket(slug: string, orderToken: string, registrationId: string): Promise<PublicFormState> {
  const event = await getPublicEvent(slug);
  const { t } = await siteTextFor(event);
  if (!rateLimit(`refund:${await clientIp()}`, 10, 10 * 60_000)) return { error: t.err.busy };
  const orderId = verify('order', orderToken);
  const reg = orderId
    ? await prisma.registration.findFirst({ where: { id: registrationId, orderId, eventId: event.id }, include: { _count: { select: { attendance: true } } } })
    : null;
  if (!reg || !orderId) return { error: t.err.linkExpired };
  const block = await selfRefundBlock(event, reg);
  if (block === 'closed') return { error: t.payment.cancelTooLate(event.refundHours ?? 0) };
  if (block === 'used') return { error: t.payment.cancelUsed };
  if (block) return { error: t.payment.refundPolicy(null) };
  try {
    const r = await refundTickets({ orderId, registrationIds: [reg.id], requestedBy: 'buyer', byLabel: reg.email });
    return { info: t.payment.cancelDone(formatMoney(r.amount, event.currency)) };
  } catch (e) {
    if (e instanceof RefundError) return { error: t.payment.refundFailed };
    throw e;
  }
}
