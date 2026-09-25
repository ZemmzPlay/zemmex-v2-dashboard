import { NextResponse } from 'next/server';
import { seal } from '@/lib/sso';
import { appUrl } from '@/lib/email';

/** The test identity provider's "Continue": back to our callback with a sealed code. Development only. */
export async function POST(req: Request) {
  if (process.env.SSO_TEST !== '1' || process.env.NODE_ENV === 'production') return new Response('Not found', { status: 404 });
  const fd = await req.formData();
  const g = (k: string) => String(fd.get(k) ?? '');
  const email = g('email').trim().toLowerCase();
  const code = seal({
    iss: 'zemmz-test', aud: 'test', exp: Math.floor(Date.now() / 1000) + 300, nonce: g('nonce'), sub: `test-${email}`,
    email, name: g('name') || email.split('@')[0], email_verified: fd.get('verified') === 'on',
  });
  const back = new URL(`${appUrl()}/auth/test/callback`);
  back.searchParams.set('code', code);
  back.searchParams.set('state', g('state'));
  return NextResponse.redirect(back, 303);
}
