import type { Metadata, Viewport } from 'next';
import { Sora } from 'next/font/google';
import './globals.css';

const sora = Sora({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-sora', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'zemmz Live', template: '%s · zemmz Live' },
  description: 'Registration, check-in and certificates for conferences, summits and live events.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F4F5FA' },
    { media: '(prefers-color-scheme: dark)', color: '#0B0A1F' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={sora.variable}>
      <body>{children}</body>
    </html>
  );
}
