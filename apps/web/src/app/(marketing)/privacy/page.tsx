import type { Metadata } from 'next';
import { LegalPage } from '@/components/marketing/legal-page';

export const metadata: Metadata = { title: 'Privacy policy' };

export default function Privacy() {
  return (
    <LegalPage title="Privacy policy" updated="24 September 2026">
      <h2>Who this covers</h2>
      <p>Organisers who use zemmz Live, and attendees who register for their events. For attendee details, the organiser decides what is collected and why; zemmz processes it on their behalf.</p>
      <h2>What we collect</h2>
      <ul>
        <li>Organiser accounts: name, work email, password (stored only as a salted hash), organisation, and the activity log of changes.</li>
        <li>Attendees: the fields on the event’s form (for example name, email, mobile, speciality), ticket and order, and check-in and check-out times.</li>
        <li>Files organisers upload: logos, photos and slides.</li>
        <li>Technical data needed to run the service securely, such as the IP address of sign-in attempts.</li>
      </ul>
      <h2>How it’s used</h2>
      <p>To run registration, check-in, messages and certificates for the event, and to keep accounts secure. Attendee details are not used to market anything else and are not sold.</p>
      <h2>Who we share it with</h2>
      <p>Only the providers needed to run the service: hosting, email delivery, SMS delivery and, for paid tickets, the payment provider.</p>
      <h2>How long we keep it</h2>
      <p>For as long as the organiser’s account is active, or until the organiser deletes it. Attendees can ask the organiser, or us, to correct or delete their details.</p>
      <h2>Contact</h2>
      <p>Privacy questions: <a href="mailto:hello@zemmz.com">hello@zemmz.com</a>.</p>
    </LegalPage>
  );
}
