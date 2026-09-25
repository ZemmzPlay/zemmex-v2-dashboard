import { afterEach, describe, expect, it, vi } from 'vitest';
import { PermanentSendError, providerFromEnv, twilioSms, unifonicSms } from './providers';

afterEach(() => vi.unstubAllGlobals());

const reply = (status: number, body: object) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe('SMS providers', () => {
  it('Twilio: sends with basic auth and a messaging service, returns the SID', async () => {
    const fetch = reply(201, { sid: 'SM123' });
    vi.stubGlobal('fetch', fetch);
    const r = await twilioSms('AC1', 'tok', 'MG9')({ id: 'm1', to: '+971501234567', text: 'Doors open at 7' });
    expect(r.providerMessageId).toBe('SM123');
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/Accounts/AC1/Messages.json');
    expect(String(init.body)).toContain('MessagingServiceSid=MG9');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from('AC1:tok').toString('base64')}`);
  });

  it('Twilio: a bad number is permanent, rate limiting is retried', async () => {
    vi.stubGlobal('fetch', reply(400, { message: 'invalid To' }));
    await expect(twilioSms('AC1', 'tok', '+1555')({ id: 'm', to: 'x', text: 't' })).rejects.toBeInstanceOf(PermanentSendError);
    vi.stubGlobal('fetch', reply(429, {}));
    const e = await twilioSms('AC1', 'tok', '+1555')({ id: 'm', to: 'x', text: 't' }).catch((x) => x);
    expect(e).not.toBeInstanceOf(PermanentSendError);
  });

  it('Unifonic: digits-only recipient, success flag checked', async () => {
    const fetch = reply(200, { success: true, data: { MessageID: 42 } });
    vi.stubGlobal('fetch', fetch);
    const r = await unifonicSms('app', 'ZEMMZ')({ id: 'm', to: '+966 50 123 4567', text: 'Hi' });
    expect(r.providerMessageId).toBe('42');
    expect(String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body)).toContain('Recipient=966501234567');
    vi.stubGlobal('fetch', reply(200, { success: false, message: 'Sender ID not approved' }));
    await expect(unifonicSms('app', 'ZEMMZ')({ id: 'm', to: '1', text: 'x' })).rejects.toThrow(/Sender ID not approved/);
  });

  it('adds SMS to either email provider, and refuses half a configuration', () => {
    expect(providerFromEnv({ MESSAGING_PROVIDER: 'log', SMS_PROVIDER: 'unifonic', UNIFONIC_APP_SID: 'a', SMS_FROM: 'Z' }).name).toBe('log+unifonic');
    expect(() => providerFromEnv({ SMS_PROVIDER: 'twilio' })).toThrow(/TWILIO_ACCOUNT_SID/);
  });
});
