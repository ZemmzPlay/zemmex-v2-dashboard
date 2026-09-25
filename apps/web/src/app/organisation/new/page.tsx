import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { ORG_COUNTRIES, ORG_KINDS } from '@/lib/onboarding';
import { DashboardShell } from '@/components/shell/dashboard-shell';
import { SimpleForm } from '@/components/simple-form';
import { createAnotherOrganisation } from './actions';

export const metadata: Metadata = { title: 'New organisation' };

export default async function NewOrganisationPage() {
  const user = await requireUser();
  return (
    <DashboardShell user={user}>
      <div className="ph"><div><h1>New organisation</h1><p>For a client you run events for, or another part of your company. It has its own events, team, plan and payouts, and starts on the free trial.</p></div></div>
      <SimpleForm action={createAnotherOrganisation} submitLabel="Create organisation" canEdit>
        <section className="fsec">
          <div className="fld"><label htmlFor="n-name">Name</label><input id="n-name" name="name" className="inp" required maxLength={120} autoFocus /></div>
          <div className="grid gap-x-4 sm:grid-cols-2">
            <div className="fld !mb-0"><label htmlFor="n-kind">What best describes it</label><select id="n-kind" name="kind" className="sel"><option value="">Not set</option>{ORG_KINDS.map((k) => <option key={k}>{k}</option>)}</select></div>
            <div className="fld !mb-0"><label htmlFor="n-country">Country</label><select id="n-country" name="country" className="sel" defaultValue="United Arab Emirates">{ORG_COUNTRIES.map((k) => <option key={k}>{k}</option>)}</select></div>
          </div>
        </section>
      </SimpleForm>
    </DashboardShell>
  );
}
