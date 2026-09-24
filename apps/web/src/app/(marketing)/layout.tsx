import { Schibsted_Grotesk } from 'next/font/google';
import '../marketing.css';

const schibsted = Schibsted_Grotesk({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-schibsted', display: 'swap' });

/** The marketing site, sign-in and onboarding: the prototype's own styles, scoped under .mk. */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <div className={`mk ${schibsted.variable}`}>{children}</div>;
}
