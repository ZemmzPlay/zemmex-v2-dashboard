import { revalidatePath } from 'next/cache';
import { siteFor } from '@/lib/play/site';
import { currentPlayer } from '@/lib/play/players';
import { ReportError, submitReport } from '@/lib/play/reports';
import { isSameOrigin } from '@/lib/same-origin';

const json = (status: number, body: object) => Response.json(body, { status });

/** A player reports a match result with a screenshot (multipart: match, scoreA, scoreB, shot). */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = await siteFor(slug);
  if (!isSameOrigin(req)) return json(403, { error: 'Report from the website.' });
  const player = await currentPlayer(s.project.id);
  if (!player) return json(401, { error: s.locale === 'ar' ? 'سجّل الدخول أولاً.' : 'Sign in first.' });
  if (Number(req.headers.get('content-length') ?? 0) > 11 * 1024 * 1024) return json(413, { error: s.locale === 'ar' ? 'حجم الصورة أكبر من 10 ميغابايت.' : 'That screenshot is over 10 MB. Take a smaller one.' });
  const fd = await req.formData().catch(() => null);
  if (!fd) return json(400, { error: 'Try again.' });
  const file = fd.get('shot');
  try {
    await submitReport({ project: s.project, player, matchId: String(fd.get('match') ?? ''), scoreA: Number(fd.get('scoreA')), scoreB: Number(fd.get('scoreB')), file: file instanceof File ? file : null, locale: s.locale });
  } catch (e) {
    if (e instanceof ReportError) return json(400, { error: e.message });
    throw e;
  }
  revalidatePath(`/play/${slug}`, 'layout');
  return json(200, { ok: s.t.reported });
}
