'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@zemmz/db';
import { contrastRatio, hexColourSchema } from '@zemmz/shared';
import { can, requirePermission } from '@/lib/auth';
import { logActivity } from '@/lib/activity';

export interface SettingsState {
  ok?: string;
  error?: string;
  warn?: string;
}

const detailsSchema = z.object({
  name: z.string().trim().min(3, 'Give the event a name').max(120),
  shortName: z.string().trim().min(1, 'Add a short name, up to 4 letters').max(4, 'Keep the short name to 4 letters'),
  organiserName: z.string().trim().max(120),
  heroText: z.string().trim().max(240),
  venueName: z.string().trim().max(160),
  venueAddress: z.string().trim().max(240),
  venuePhone: z.string().trim().max(40),
  accentColour: hexColourSchema,
  creditThresholdPct: z.coerce.number().int().min(1).max(100).optional(),
  creditRule: z.enum(['duration', 'checkin']).optional(),
});

export async function saveDetails(slug: string, _p: SettingsState, fd: FormData): Promise<SettingsState> {
  const { user, event } = await requirePermission(slug, can.manageEvent);
  const raw = Object.fromEntries(fd.entries());
  const parsed = detailsSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  await prisma.event.update({
    where: { id: event.id },
    data: {
      name: d.name, shortName: d.shortName.toUpperCase(), organiserName: d.organiserName, heroText: d.heroText, venueName: d.venueName,
      venueAddress: d.venueAddress, venuePhone: d.venuePhone, accentColour: d.accentColour.toUpperCase(),
      ...(event.type === 'medical' && d.creditRule ? { creditRule: d.creditRule, creditThresholdPct: d.creditThresholdPct ?? event.creditThresholdPct } : {}),
    },
  });
  await logActivity(user, event.id, 'edited the event details');
  revalidatePath(`/events/${slug}`, 'layout');
  revalidatePath(`/e/${slug}`, 'layout');
  // Contrast is checked, not assumed: the accent sits behind white or dark text on the site.
  const worst = Math.max(contrastRatio(d.accentColour, '#FFFFFF'), contrastRatio(d.accentColour, '#14142B'));
  return { ok: 'Saved.', warn: worst < 4.5 ? `This colour reaches only ${worst.toFixed(1)}:1 with either white or dark text. Buttons may be hard to read.` : undefined };
}
