import { dispatchOutbox, planRenewals, playRenewals, releaseHeldOrders, transitionSessions } from './jobs';
import { providerFromEnv, type Provider } from './providers';

/** One worker pass: sessions, outbox, unpaid holds, plan reminders. */
export async function runTick(provider: Provider = providerFromEnv()) {
  const started = Date.now();
  const sessions = await transitionSessions();
  const outbox = await dispatchOutbox(provider);
  const released = await releaseHeldOrders();
  const reminded = (await planRenewals()) + (await playRenewals());
  return {
    ms: Date.now() - started,
    provider: provider.name,
    sessions,
    outbox,
    released,
    reminded,
  };
}
