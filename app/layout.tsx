import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sehaj Jaap — Sikh Jaap Counter',
  description:
    'A peaceful, bilingual Jaap counter for daily Simran, focus sessions, goals, and progress.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
