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
import { dispatchOutbox, planRenewals, releaseHeldOrders, transitionSessions } from './jobs';
import { providerFromEnv } from './providers';

const TICK_MS = Number(process.env.WORKER_TICK_MS ?? 20_000);
const once = process.argv.includes('--once');
const provider = providerFromEnv();

let stopping = false;
let running: Promise<void> | null = null;

async function tick() {
  const started = Date.now();
  try {
    const s = await transitionSessions();
    const o = await dispatchOutbox(provider);
    const released = await releaseHeldOrders();
    if (released) console.log(`[tick] released ${released} unpaid ${released === 1 ? 'order' : 'orders'}`);
    const reminded = await planRenewals();
    if (reminded) console.log(`[tick] queued ${reminded} plan ${reminded === 1 ? 'reminder' : 'reminders'}`);
    const changed = s.live + s.ended + s.upcoming;
    if (changed || o.claimed) {
      console.log(
        `[tick] sessions: +${s.live} live, +${s.ended} ended${s.upcoming ? `, +${s.upcoming} upcoming` : ''} · outbox: ${o.sent} sent, ${o.failed} failed · ${Date.now() - started} ms`,
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
