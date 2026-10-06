import { runTick } from '../../../../../../worker/src/tick';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * One worker tick for Vercel Cron (or a manual call with CRON_SECRET).
 * Secured by Authorization: Bearer <CRON_SECRET>, or Vercel's cron header.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  const fromVercelCron = req.headers.get('x-vercel-cron') === '1';
  const ok = fromVercelCron || (secret != null && secret.length > 0 && auth === `Bearer ${secret}`);
  if (!ok) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const result = await runTick();
    return Response.json({ ok: true, ...result });
  } catch (err) {
    console.error('[cron/tick]', err);
    return Response.json({ ok: false, error: String((err as Error).message ?? err) }, { status: 500 });
  }
}
