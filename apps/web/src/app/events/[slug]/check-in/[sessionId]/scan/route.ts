import { NextResponse } from 'next/server';
import { prisma } from '@zemmz/db';
import { scanSchema } from '@zemmz/shared';
import { can, requirePermission } from '@/lib/auth';
import { performScan } from '@/lib/checkin';
import { isSameOrigin } from '@/lib/same-origin';

/**
 * POST { mode, input } → the scan outcome and fresh counts.
 * JSON rather than a Server Action so the same endpoint can later take
 * batched scans from an offline-capable scanner app (docs/08).
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string; sessionId: string }> }) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Cross-site request refused' }, { status: 403 });
  const { slug, sessionId } = await params;
  const { user, event } = await requirePermission(slug, can.checkIn);
  const body = await req.json().catch(() => ({}));

  // Demo helpers from the prototype: pick someone to scan. Never in production.
  if (body.simulate && process.env.NODE_ENV !== 'production') {
    body.input = await simulatedInput(event.id, sessionId, body.mode, body.simulate);
    if (!body.input) return NextResponse.json({ kind: 'warn', title: body.mode === 'in' ? 'Everyone is already checked in' : 'Nobody left to check out', detail: '', inRoom: null });
  }

  const parsed = scanSchema.safeParse({ sessionId, mode: body.mode, input: body.input });
  if (!parsed.success) return NextResponse.json({ kind: 'err', title: parsed.error.issues[0].message, detail: '' }, { status: 400 });

  const result = await performScan({ event, sessionId, mode: parsed.data.mode, input: parsed.data.input, userId: user.id });
  return NextResponse.json({ ...result, input: parsed.data.input });
}

async function simulatedInput(eventId: string, sessionId: string, mode: 'in' | 'out', kind: string): Promise<string | null> {
  if (kind === 'wrong') return '9981';
  const session = await prisma.session.findFirst({ where: { id: sessionId, eventId } });
  if (!session) return null;
  if (kind === 'wrongGate') {
    const r = await prisma.registration.findFirst({ where: { eventId, status: 'CONFIRMED', ticketTypeId: { not: session.gateTicketTypeId ?? undefined }, attendance: { none: { sessionId } } } });
    return r ? String(r.publicId) : null;
  }
  const where =
    mode === 'in'
      ? { eventId, status: 'CONFIRMED' as const, publicId: { not: 1003 }, attendance: { none: { sessionId, outAt: null } }, ...(session.gateTicketTypeId ? { ticketTypeId: session.gateTicketTypeId } : {}) }
      : { eventId, attendance: { some: { sessionId, outAt: null } } };
  const n = await prisma.registration.count({ where });
  if (!n) return null;
  const r = await prisma.registration.findFirst({ where, skip: Math.floor(Math.random() * n), select: { publicId: true } });
  return r ? String(r.publicId) : null;
}
