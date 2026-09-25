/**
 * Message delivery, all with plain fetch and no SDKs.
 *   Email: SendGrid's v3 API (MESSAGING_PROVIDER=sendgrid), or "log", which
 *          keeps messages in the database for /outbox during development.
 *   SMS:   SMS_PROVIDER=twilio or unifonic (Unifonic covers Saudi sender-ID
 *          registration and Gulf routes). Unset: SMS rows fail with a clear
 *          reason when email is real, and are logged when email is "log".
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
  };
}

type SmsSender = NonNullable<Provider['sendSms']>;

/** Errors a retry won't fix: bad number, unverified sender, auth. 429 and 5xx are retried. */
function smsFailure(service: string, status: number, body: string): Error {
  const msg = `${service} ${status}: ${body.slice(0, 300)}`;
  return status >= 400 && status < 500 && status !== 429 ? new PermanentSendError(msg) : new Error(msg);
}

export function twilioSms(accountSid: string, authToken: string, from: string): SmsSender {
  return async (msg) => {
    const body = new URLSearchParams({ To: msg.to, Body: msg.text });
    // A Messaging Service SID (MG…) picks the sender per country; otherwise a number or alphanumeric sender ID.
    body.set(from.startsWith('MG') ? 'MessagingServiceSid' : 'From', from);
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    if (res.status === 201 || res.status === 200) return { providerMessageId: (JSON.parse(text) as { sid?: string }).sid ?? null };
    throw smsFailure('Twilio', res.status, text);
  };
}

export function unifonicSms(appSid: string, senderId: string): SmsSender {
  return async (msg) => {
    const res = await fetch('https://el.cloud.unifonic.com/rest/SMS/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ AppSid: appSid, SenderID: senderId, Recipient: msg.to.replace(/\D/g, ''), Body: msg.text, responseType: 'JSON' }),
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    let json: { success?: boolean | string; message?: string; errorCode?: string; data?: { MessageID?: string | number } } = {};
    try {
      json = JSON.parse(text);
    } catch {
      /* not JSON: treated below */
    }
    if (res.ok && (json.success === true || json.success === 'true')) return { providerMessageId: json.data?.MessageID != null ? String(json.data.MessageID) : null };
    throw smsFailure('Unifonic', res.ok ? 400 : res.status, json.message ?? text);
  };
}

export function smsFromEnv(env = process.env): SmsSender | undefined {
  const kind = env.SMS_PROVIDER ?? '';
  if (!kind) return undefined;
  if (kind === 'twilio') {
    if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.SMS_FROM) throw new Error('SMS_PROVIDER=twilio needs TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and SMS_FROM');
    return twilioSms(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN, env.SMS_FROM);
  }
  if (kind === 'unifonic') {
    if (!env.UNIFONIC_APP_SID || !env.SMS_FROM) throw new Error('SMS_PROVIDER=unifonic needs UNIFONIC_APP_SID and SMS_FROM (the registered sender ID)');
    return unifonicSms(env.UNIFONIC_APP_SID, env.SMS_FROM);
  }
  throw new Error(`Unknown SMS_PROVIDER "${kind}". Use "twilio" or "unifonic".`);
}

export function providerFromEnv(env = process.env): Provider {
  const kind = env.MESSAGING_PROVIDER ?? 'log';
  const sms = smsFromEnv(env);
  if (kind === 'sendgrid') {
    if (!env.SENDGRID_API_KEY) throw new Error('MESSAGING_PROVIDER=sendgrid but SENDGRID_API_KEY is empty');
    const email = sendgridProvider(env.SENDGRID_API_KEY, {
      email: env.MAIL_FROM_ADDRESS ?? 'no-reply@zemmz.com',
      name: env.MAIL_FROM_NAME ?? 'zemmz Live',
    });
    return { name: sms ? `sendgrid+${env.SMS_PROVIDER}` : 'sendgrid', sendEmail: email.sendEmail, ...(sms ? { sendSms: sms } : {}) };
  }
  if (kind !== 'log') throw new Error(`Unknown MESSAGING_PROVIDER "${kind}". Use "log" or "sendgrid".`);
  return sms ? { ...logProvider, name: `log+${env.SMS_PROVIDER}`, sendSms: sms } : logProvider;
}
