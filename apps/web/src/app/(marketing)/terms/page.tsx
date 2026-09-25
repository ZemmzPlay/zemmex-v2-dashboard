import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/marketing/legal-page';
import { TRIAL_ATTENDEES } from '@/lib/plans';

export const metadata: Metadata = { title: 'Terms and conditions' };

export default function Terms() {
  return (
    <LegalPage title="Terms and conditions" updated="24 September 2026">
      <h2>1. The service</h2>
      <p>zemmz Live gives organisations an event website, registration and ticketing, badges and e-tickets, check-in, messages, and certificates or after-event pages. These terms apply to the organisation that signs up (“you”) and the people it invites.</p>
      <h2>2. Your account</h2>
      <p>You’re responsible for the people you give access to and for what they do in your account. Keep passwords private and remove people who no longer need access. Every change is recorded in your activity log.</p>
      <h2>3. Trial and plans</h2>
      <p>You can use zemmz Live free until your events have {TRIAL_ATTENDEES} confirmed attendees in total. After that, public registration pauses until a plan is active. Plans are invoiced; prices are listed on our <Link href="/#pricing">pricing section</Link> and exclude VAT.</p>
      <h2>4. Tickets and payments</h2>
      <p>Paid tickets carry a platform fee per ticket, shown before you sell. zemmz collects ticket payments through its payment provider and pays your share into your bank account weekly, less the platform fee when you absorb it and card processing at cost. You set each event’s refund policy; refunds you or your buyers make are taken from your balance.</p>
      <h2>5. Your content and attendee data</h2>
      <p>You keep the rights to what you upload and to the details your attendees give. You can export it at any time. You must have a lawful basis to collect it and to message the people on your lists. See the <Link href="/privacy">privacy policy</Link>.</p>
      <h2>6. Acceptable use</h2>
      <p>Don’t use zemmz Live for unlawful events, to send unsolicited messages, or to upload content you don’t have the right to use. We may suspend an account that does.</p>
      <h2>7. Availability and support</h2>
      <p>We work to keep the service available, especially on event days, and support every plan on event days. Planned maintenance is announced in advance.</p>
      <h2>8. Contact</h2>
      <p>Questions about these terms: <a href="mailto:hello@zemmz.com">hello@zemmz.com</a>.</p>
    </LegalPage>
  );
}
