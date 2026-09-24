'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma, type Prisma } from '@zemmz/db';
import { emailSchema, eventType, isCurrency, mobileSchema, ticketFee, type CurrencyCode, lowerFirst } from '@zemmz/shared';
import { createRegistrations, RegistrationError, resendConfirmation, validateAgainstForm, type PersonInput } from '@/lib/registrations';
import { getPublicEvent, homeState } from '@/lib/public-event';
import { rateLimit } from '@/lib/rate-limit';
import { ticketToken } from '@/lib/tokens';
import { sign, verify } from '@/lib/order-tokens';
import { chargeMock } from '@/lib/payments';

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

async function readPerson(eventId: string, fd: FormData, prefix = '') {
  const fields = await prisma.formField.findMany({ where: { eventId, enabled: true }, orderBy: { sortOrder: 'asc' } });
  const g = (k: string) => s(fd, prefix + k);
  const answers: Record<string, string> = {};
  for (const f of fields) if (!['title', 'first', 'last', 'email', 'mob', 'spec', 'hosp', 'tk'].includes(f.key)) answers[f.key] = g(`a_${f.key}`);
  const p: PersonInput = {
    ticketTypeId: g('ticketTypeId') || null, title: g('title'), firstName: g('firstName'), lastName: g('lastName'),
    email: g('email'), mobile: g('mobile'), field1: g('field1'), field2: g('field2'), answers, consentMarketing: fd.get(prefix + 'consent') === 'on',
  };
  const errors = validateAgainstForm(fields, p);
  const em = emailSchema.safeParse(p.email);
  if (!em.success) errors.email = em.error.issues[0].message;
  else p.email = em.data;
  const mob = mobileSchema.safeParse(p.mobile);
  if (!mob.success) errors.mob = mob.error.issues[0].message;
  else p.mobile = mob.data;
  return { p, errors };
}

/** Free registration from the homepage panel. */
export async function registerFree(slug: string, _p: PublicFormState, fd: FormData): Promise<PublicFormState> {
  const values = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]));
  if (s(fd, 'website')) return { error: 'Something went wrong. Please try again.' }; // honeypot
  if (!rateLimit(`reg:${await clientIp()}`, 20, 10 * 60_000)) return { error: 'Too many registrations from this connection. Wait a few minutes and try again.', values };

  const event = await getPublicEvent(slug);
  if (homeState(event) !== 'open') return { error: 'Registration has closed.', values };
  const TY = eventType(event.type);
  const { p, errors } = await readPerson(event.id, fd);

  const onSale = await prisma.ticketType.findMany({ where: { eventId: event.id, onSale: true }, orderBy: { sortOrder: 'asc' } });
  if (onSale.some((t) => t.priceMinor > 0)) return { error: 'This event sells tickets. Choose them above.', values };
  if (!p.ticketTypeId) p.ticketTypeId = onSale.length === 1 ? onSale[0].id : null;
  if (onSale.length > 1 && !onSale.some((t) => t.id === p.ticketTypeId)) errors.tk = 'Choose how you’re attending';
  if (Object.keys(errors).length) return { error: 'Check the highlighted fields.', fieldErrors: errors, values };

  // One registration per email. Re-registering resends the confirmation instead
  // of creating a duplicate, without revealing anything on screen.
  const existing = await prisma.registration.findFirst({ where: { eventId: event.id, email: p.email, status: 'CONFIRMED' } });
  if (existing) {
    await resendConfirmation(event, existing.id);
    return { info: `${p.email} is already registered. We’ve sent the confirmation email again, with your ${lowerFirst(TY.idName)}.` };
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
  lines: { ticketTypeId: string; name: string; qty: number; unitMinor: number }[];
  subtotalMinor: number;
  discountMinor: number;
  feeMinor: number;
  totalMinor: number;
  promo: { code: string; percentOff: number } | null;
  currency: string;
  error?: string;
}

async function quote(eventId: string, currency: string, wanted: Record<string, number>, promoCode: string): Promise<CheckoutQuote> {
  const cur: CurrencyCode = isCurrency(currency) ? currency : 'AED';
  const types = await prisma.ticketType.findMany({ where: { eventId, onSale: true, id: { in: Object.keys(wanted) } }, orderBy: { sortOrder: 'asc' } });
  const lines = types.filter((t) => wanted[t.id] > 0).map((t) => ({ ticketTypeId: t.id, name: t.name, qty: Math.min(10, Math.floor(wanted[t.id])), unitMinor: t.priceMinor }));
  let promo: CheckoutQuote['promo'] = null;
  let error: string | undefined;
  if (promoCode) {
    const p = await prisma.promoCode.findUnique({ where: { eventId_code: { eventId, code: promoCode.toUpperCase() } } });
    if (!p || !p.active || (p.maxUses != null && p.uses >= p.maxUses)) error = `The code ${promoCode.toUpperCase()} isn’t valid for this event.`;
    else promo = { code: p.code, percentOff: p.percentOff };
  }
  let subtotal = 0, discount = 0, fee = 0;
  for (const l of lines) {
    const unitDiscount = promo ? Math.round((l.unitMinor * promo.percentOff) / 100) : 0;
    subtotal += l.unitMinor * l.qty;
    discount += unitDiscount * l.qty;
    // The platform fee is per paid ticket, on what the buyer actually pays, capped (docs/05).
    fee += ticketFee(l.unitMinor - unitDiscount, cur) * l.qty;
  }
  return { lines, subtotalMinor: subtotal, discountMinor: discount, feeMinor: fee, totalMinor: subtotal - discount + fee, promo, currency, error };
}

export async function getQuote(slug: string, wanted: Record<string, number>, promoCode: string): Promise<CheckoutQuote> {
  const event = await getPublicEvent(slug);
  return quote(event.id, event.currency, wanted, promoCode.trim());
}

export async function placeOrder(slug: string, _p: PublicFormState, fd: FormData): Promise<PublicFormState> {
  const values = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]));
  if (!rateLimit(`order:${await clientIp()}`, 15, 10 * 60_000)) return { error: 'Too many attempts from this connection. Wait a few minutes and try again.', values };
  const event = await getPublicEvent(slug);
  if (homeState(event) !== 'open') return { error: 'Ticket sales have closed.', values };

  let wanted: Record<string, number> = {};
  try {
    const raw = JSON.parse(s(fd, 'wanted') || '{}');
    if (raw && typeof raw === 'object') for (const [k, v] of Object.entries(raw)) if (typeof v === 'number' && v > 0) wanted[k] = v;
  } catch {
    wanted = {};
  }
  const q = await quote(event.id, event.currency, wanted, s(fd, 'promo'));
  if (q.error) return { error: q.error, values };
  const count = q.lines.reduce((n, l) => n + l.qty, 0);
  if (!count) return { error: 'Choose at least one ticket.', values };

  // Buyer details, then one name per ticket (defaults to the buyer).
  const { p: buyer, errors } = await readPerson(event.id, fd, 'b_');
  if (Object.keys(errors).length) return { error: 'Check the highlighted fields.', fieldErrors: errors, values };
  const people: PersonInput[] = [];
  let i = 0;
  for (const l of q.lines) {
    for (let k = 0; k < l.qty; k++, i++) {
      const first = s(fd, `h${i}_first`) || buyer.firstName;
      const last = s(fd, `h${i}_last`) || buyer.lastName;
      people.push({ ...buyer, ticketTypeId: l.ticketTypeId, firstName: first, lastName: last });
    }
  }

  const outcome = s(fd, 'pay');
  let orderId: string;
  try {
    orderId = await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          eventId: event.id, buyerName: `${buyer.firstName} ${buyer.lastName}`, buyerEmail: buyer.email, currency: event.currency,
          subtotalMinor: q.subtotalMinor, discountMinor: q.discountMinor, feeMinor: q.feeMinor, totalMinor: q.totalMinor,
          promoCodeId: q.promo ? (await tx.promoCode.findUnique({ where: { eventId_code: { eventId: event.id, code: q.promo.code } } }))?.id : null,
          provider: process.env.PAYMENT_PROVIDER ?? 'mock',
        },
      });
      // Seats are taken (and capacity checked) before the charge, inside the same
      // transaction, so a failed payment releases them by rolling back.
      await createRegistrations({ event, people, source: 'WEBSITE', orderId: order.id, tx });
      if (q.totalMinor > 0) {
        const charge = await chargeMock({ amountMinor: q.totalMinor, currency: event.currency, outcome });
        if (!charge.ok) throw new RegistrationError(charge.message);
        await tx.order.update({ where: { id: order.id }, data: { status: 'PAID', paidAt: new Date(), providerRef: charge.ref } });
      } else {
        await tx.order.update({ where: { id: order.id }, data: { status: 'PAID', paidAt: new Date(), providerRef: 'free' } });
      }
      if (q.promo) await tx.promoCode.update({ where: { eventId_code: { eventId: event.id, code: q.promo.code } }, data: { uses: { increment: 1 } } });
      return order.id;
    });
  } catch (e) {
    if (e instanceof RegistrationError) return { error: e.message, values };
    throw e;
  }
  redirect(`/e/${slug}/order/${sign('order', orderId)}`);
}

/* ------------------------------------------------------------------ */
/* After the event: certificates, recordings, after-show page           */
/* ------------------------------------------------------------------ */

export async function claim(slug: string, _p: PublicFormState, fd: FormData): Promise<PublicFormState> {
  const values = { publicId: s(fd, 'publicId'), email: s(fd, 'email') };
  if (!rateLimit(`claim:${await clientIp()}`, 30, 10 * 60_000)) return { error: 'Too many attempts. Wait a few minutes and try again.', values };
  const event = await getPublicEvent(slug);
  const TY = eventType(event.type);
  if (homeState(event) !== 'after') return { error: `The ${TY.afterLbl.toLowerCase()} isn’t open yet.`, values };

  const id = Number(values.publicId.replace(/\D/g, ''));
  const email = values.email.toLowerCase();
  const fieldErrors: Record<string, string> = {};
  if (!id) fieldErrors.publicId = `Enter the number on your ${TY.badge}`;
  if (!email) fieldErrors.email = 'Enter the email you registered with';
  if (Object.keys(fieldErrors).length) return { fieldErrors, values };

  const reg = await prisma.registration.findUnique({ where: { eventId_publicId: { eventId: event.id, publicId: id } }, include: { _count: { select: { attendance: true } } } });
  // Same message whether the ID or the email is wrong, so IDs can't be probed.
  if (!reg || reg.email !== email) return { error: `We couldn’t find ${lowerFirst(TY.idName)} ${id} with that email. Check both against your confirmation email.`, values };
  if (reg.status === 'CANCELLED') return { error: `This ${TY.one} was cancelled, so there’s nothing to claim.`, values };

  const after = await prisma.afterEventPage.findUnique({ where: { eventId: event.id } });
  const attended = reg._count.attendance > 0;
  const gate = TY.cert !== 'none' || (after?.attendeesOnly ?? true);
  if (gate && !attended) {
    return {
      error: TY.cert === 'none'
        ? `Our records show you booked but didn’t check in, so the recordings aren’t available to you. If you were there, contact the organiser with your ${lowerFirst(TY.idName)}.`
        : `Our records show you registered but didn’t check in to any ${TY.unit.toLowerCase()}, so we can’t issue a certificate. If you were there, contact the organiser with your ${lowerFirst(TY.idName)}.`,
      values,
    };
  }
  redirect(`/e/${slug}/after/${sign('claim', reg.id)}`);
}

export async function submitEvaluation(slug: string, token: string, _p: PublicFormState, fd: FormData): Promise<PublicFormState> {
  const regId = verify('claim', token);
  if (!regId) return { error: 'This link has expired. Claim again from the homepage.' };
  const event = await getPublicEvent(slug);
  const reg = await prisma.registration.findFirst({ where: { id: regId, eventId: event.id } });
  if (!reg) return { error: 'This link has expired. Claim again from the homepage.' };
  const questions = await prisma.evaluationQuestion.findMany({ where: { eventId: event.id }, orderBy: { sortOrder: 'asc' } });
  const fieldErrors: Record<string, string> = {};
  const answers: Prisma.EvaluationAnswerCreateManyResponseInput[] = [];
  for (const q of questions) {
    const raw = s(fd, `q_${q.id}`);
    if (q.required && !raw && q.kind !== 'CHECK') fieldErrors[q.id] = 'Answer this question';
    if ((q.kind === 'RATING' || q.kind === 'CHOICE') && raw) answers.push({ questionId: q.id, rating: Math.min(5, Math.max(1, Number(raw) || 1)) });
    else if (q.kind === 'CHECK' && fd.get(`q_${q.id}`) === 'on') answers.push({ questionId: q.id, checked: true });
    else if (q.kind === 'TEXT' && raw) answers.push({ questionId: q.id, text: raw.slice(0, 2000) });
  }
  if (Object.keys(fieldErrors).length) return { error: 'Answer the required questions.', fieldErrors, values: Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)])) };
  await prisma.evaluationResponse.upsert({
    where: { registrationId: reg.id },
    update: {},
    create: { eventId: event.id, registrationId: reg.id, answers: { createMany: { data: answers } } },
  });
  redirect(`/e/${slug}/after/${token}`);
}
