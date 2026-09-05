import type { Metadata } from 'next';
import { SmoothEffects } from '@/components/motion/smooth-effects';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://sehaj-jaap.vercel.app'),
  title: 'Sehaj Jaap — Sikh Jaap Counter',
  description:
    'A peaceful, bilingual Jaap counter for daily Simran, focus sessions, goals, and progress.',
  applicationName: 'Sehaj Jaap',
  alternates: {
    canonical: '/',
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'Sehaj Jaap',
    title: 'Sehaj Jaap — Sikh Jaap Counter',
    description:
      'A peaceful, bilingual Jaap counter for daily Simran, focus sessions, goals, and progress.',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased"><SmoothEffects />{children}</body>
    </html>
  );
}
