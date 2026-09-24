import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSessionAccount } from '@/lib/auth';
import { onboardingSteps } from '@/lib/onboarding';
import { OnboardingShell } from '@/components/onboarding-shell';
import { AccountStep, OrganisationStep, VerifyStep } from './steps';

export const metadata: Metadata = { title: 'Start your free trial' };

/** Steps 1–3 happen on the server, in order: account, email code, organisation. */
export default async function SignupPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan } = await searchParams;
  const planKey = ['event', 'season', 'enterprise'].includes(plan ?? '') ? plan!.toUpperCase() : 'EVENT';
  const user = await getSessionAccount();
  if (user?.emailVerifiedAt && user.memberships.length) redirect('/signup/event');
  const step = !user ? 0 : !user.emailVerifiedAt ? 1 : 2;
  return (
    <OnboardingShell steps={onboardingSteps()} current={step} signIn={!user}>
      {step === 0 && <AccountStep plan={planKey} />}
      {step === 1 && <VerifyStep email={user!.email} plan={planKey} />}
      {step === 2 && <OrganisationStep plan={planKey} />}
    </OnboardingShell>
  );
}
