/**
 * Message delivery. SendGrid is called with plain fetch against its v3 API —
 * no SDK dependency. "log" keeps messages in the database only; they are
 * readable at /outbox in the web app during development.
 */

export interface OutgoingEmail {
  id: string;
  to: string;
  toName: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendResult {
  providerMessageId: string | null;
}

export class PermanentSendError extends Error {}

export interface Provider {
  name: string;
  sendEmail(msg: OutgoingEmail): Promise<SendResult>;
  sendSms?(msg: { id: string; to: string; text: string }): Promise<SendResult>;
}

export const logProvider: Provider = {
  name: 'log',
  async sendEmail(msg) {
    console.log(`[mail:log] → ${msg.to} · ${msg.subject}`);
    return { providerMessageId: `log-${msg.id}` };
  },
  async sendSms(msg) {
    console.log(`[sms:log] → ${msg.to} · ${msg.text.slice(0, 60)}`);
    return { providerMessageId: `log-${msg.id}` };
  },
};

export function sendgridProvider(apiKey: string, from: { email: string; name: string }): Provider {
  return {
    name: 'sendgrid',
    async sendEmail(msg) {
      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: msg.to, name: msg.toName || undefined }] }],
          from,
          subject: msg.subject,
          content: [
            { type: 'text/plain', value: msg.text },
            { type: 'text/html', value: msg.html },
          ],
          custom_args: { outbound_message_id: msg.id },
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (res.status === 202) return { providerMessageId: res.headers.get('x-message-id') };
      const body = await res.text().catch(() => '');
      // 4xx other than rate limiting will not succeed on retry.
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        throw new PermanentSendError(`SendGrid ${res.status}: ${body.slice(0, 300)}`);
      }
      throw new Error(`SendGrid ${res.status}: ${body.slice(0, 300)}`);
    },
    // No SMS provider is in the stack yet; SMS rows fail with a clear reason.
  };
}

export function providerFromEnv(env = process.env): Provider {
  const kind = env.MESSAGING_PROVIDER ?? 'log';
  if (kind === 'sendgrid') {
    if (!env.SENDGRID_API_KEY) throw new Error('MESSAGING_PROVIDER=sendgrid but SENDGRID_API_KEY is empty');
    return sendgridProvider(env.SENDGRID_API_KEY, {
      email: env.MAIL_FROM_ADDRESS ?? 'no-reply@zemmz.com',
      name: env.MAIL_FROM_NAME ?? 'zemmz Live',
    });
  }
  if (kind !== 'log') throw new Error(`Unknown MESSAGING_PROVIDER "${kind}". Use "log" or "sendgrid".`);
  return logProvider;
}
