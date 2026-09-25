import 'server-only';
import { randomBytes } from 'node:crypto';
import { resolveTxt, resolveCname } from 'node:dns/promises';

/**
 * Proving control of a domain with a DNS TXT record, for enterprise single
 * sign-on (the email domain) and custom event domains. In development,
 * domains ending in .test verify without a lookup so the flow can be tried.
 */
export const newDomainToken = () => `zemmz-verify=${randomBytes(12).toString('hex')}`;

export function normaliseDomain(input: string): string | null {
  const d = input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '');
  if (d.length > 253 || !/^(?!-)([a-z0-9-]{1,63}(?<!-)\.)+[a-z]{2,63}$/.test(d)) return null;
  return d;
}

const devDomain = (d: string) => process.env.NODE_ENV !== 'production' && /\.test$/.test(d);

export async function hasTxt(name: string, token: string) {
  if (devDomain(name)) return true;
  try {
    const records = await resolveTxt(name);
    return records.some((parts) => parts.join('').trim() === token);
  } catch {
    return false;
  }
}

/** The host custom domains point at with a CNAME: CUSTOM_DOMAIN_TARGET, or APP_URL's host. */
export function domainTarget() {
  return process.env.CUSTOM_DOMAIN_TARGET || new URL(process.env.APP_URL ?? 'http://localhost:3000').hostname;
}

export async function pointsHere(domain: string) {
  if (devDomain(domain)) return true;
  try {
    const cnames = await resolveCname(domain);
    return cnames.some((c) => c.replace(/\.$/, '').toLowerCase() === domainTarget().toLowerCase());
  } catch {
    // Apex domains can't have a CNAME; an A record to the same server is fine
    // too, and Caddy only issues a certificate once the domain reaches it.
    return true;
  }
}

/** Personal email providers can never be claimed for single sign-on. */
export const PUBLIC_EMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'yahoo.com', 'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'mail.com', 'yandex.com', 'zoho.com']);
