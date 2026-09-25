import { MarketingNav } from './nav';
import { MarketingFooter } from './footer';
import { getCurrentUser } from '@/lib/auth';

export async function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <div className="z">
      <MarketingNav signedIn={!!user} />
      <main className="legal-page">
        <h1>{title}</h1>
        <p>Last updated {updated}. This version is awaiting legal review and may change before it is final.</p>
        {children}
      </main>
      <MarketingFooter />
    </div>
  );
}
