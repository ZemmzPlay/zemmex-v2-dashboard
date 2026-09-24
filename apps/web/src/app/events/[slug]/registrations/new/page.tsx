import type { Metadata } from 'next';
import Link from 'next/link';
import { eventType } from '@zemmz/shared';
import { can, requirePermission } from '@/lib/auth';
import { loadFormFields } from '@/lib/form-fields';
import { Icon } from '@/components/icon';
import { PersonForm } from '@/components/person-form';
import { addRegistration } from '../actions';

export const metadata: Metadata = { title: 'Add registration' };

export default async function NewRegistration({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { event } = await requirePermission(slug, can.editRegistrations);
  const TY = eventType(event.type);
  const form = await loadFormFields(event.id, event.currency, { forOrganiser: true });
  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href={`/events/${slug}/registrations`}>{TY.regs}</Link> <Icon name="chevr" size={12} /> <span>{TY.register}</span>
      </nav>
      <div className="ph">
        <div>
          <h1>{TY.register}</h1>
          <p>They get the next {TY.idName.toLowerCase()} and the confirmation email. Tickets added here aren’t charged.</p>
        </div>
      </div>
      <PersonForm action={addRegistration.bind(null, slug)} fields={form.fields} tickets={form.tickets} initial={{}} submitLabel={TY.register} cancelHref={`/events/${slug}/registrations`} />
    </>
  );
}
