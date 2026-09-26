import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth-shell';
import { ContactForm } from './contact-form';

export const metadata: Metadata = { title: 'Talk to us' };

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ about?: string }> }) {
  const { about = 'contact' } = await searchParams;
  const a = ['demo', 'enterprise', 'play'].includes(about) ? about : 'contact';
  return (
    <AuthShell>
      <h1>{a === 'demo' ? 'Book a demo' : a === 'enterprise' ? 'Government and enterprise' : a === 'play' ? 'zemmz Play' : 'Talk to us'}</h1>
      <p className="lead">
        {a === 'demo' ? 'Tell us about your events and we’ll show you zemmz Live with one like yours.' : a === 'enterprise' ? 'Unlimited events, your own domain and support on site. Tell us what you run and we’ll send a proposal.' : a === 'play' ? 'Publishers, federations, your own domain or an invoice: tell us about your league and we’ll reply within one working day.' : 'Tell us about your events and we’ll reply within one working day.'}
      </p>
      <ContactForm about={a} />
    </AuthShell>
  );
}
