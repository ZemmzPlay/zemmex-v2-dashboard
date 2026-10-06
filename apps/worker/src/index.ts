/**
 * zemmz worker. Plain Node, no framework. Every tick (20 s by default):
 *   1. moves sessions between upcoming, live and ended
 *   2. delivers queued emails and SMS from the outbox
 *   3. releases tickets held for buyers who didn't finish paying
 *   4. reminds owners before their plan ends, and pauses it after the grace period
 *
 *   npm run dev -w @zemmz/worker        watch mode
 *   npm run once -w @zemmz/worker       a single tick, then exit
 */
import { prisma } from '@zemmz/db';
import { providerFromEnv } from './providers';
import { runTick } from './tick';

const TICK_MS = Number(process.env.WORKER_TICK_MS ?? 20_000);
const once = process.argv.includes('--once');
const provider = providerFromEnv();

let stopping = false;
let running: Promise<void> | null = null;

async function tick() {
  try {
    const r = await runTick(provider);
    if (r.released) console.log(`[tick] released ${r.released} unpaid ${r.released === 1 ? 'order' : 'orders'}`);
    if (r.reminded) console.log(`[tick] queued ${r.reminded} plan ${r.reminded === 1 ? 'reminder' : 'reminders'}`);
    const changed = r.sessions.live + r.sessions.ended + r.sessions.upcoming;
    if (changed || r.outbox.claimed) {
      console.log(
        `[tick] sessions: +${r.sessions.live} live, +${r.sessions.ended} ended${r.sessions.upcoming ? `, +${r.sessions.upcoming} upcoming` : ''} · outbox: ${r.outbox.sent} sent, ${r.outbox.failed} failed · ${r.ms} ms`,
      );
    }
  } catch (err) {
    console.error('[tick] failed', err);
  }
}

async function loop() {
  console.log(`zemmz worker started · provider ${provider.name} · tick ${TICK_MS / 1000}s`);
  while (!stopping) {
    running = tick();
    await running;
    running = null;
    if (once) break;
    await new Promise((r) => setTimeout(r, TICK_MS));
  }
  await prisma.$disconnect();
}

async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(`${signal} received, finishing the current tick…`);
  if (running) await running;
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

void loop();
