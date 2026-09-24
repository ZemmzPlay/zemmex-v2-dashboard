import 'server-only';
import { prisma } from '@zemmz/db';
import type { CurrentUser } from './auth';

/** Adds a line to the activity log. `action` is past tense: "printed 12 badges". */
export async function logActivity(user: Pick<CurrentUser, 'id' | 'name' | 'organisationId'>, eventId: string | null, action: string) {
  await prisma.activityLog.create({
    data: { organisationId: user.organisationId, eventId, actorId: user.id, actorLabel: user.name, action },
  });
}
