import type { Metadata, Viewport } from 'next';
import { Noto_Sans_Khmer } from 'next/font/google';
import './globals.css';

const notoSansKhmer = Noto_Sans_Khmer({
  subsets: ['khmer', 'latin'],
  display: 'swap',
  variable: '--font-noto-sans-khmer',
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: {
    default: 'AI Podcast Studio — ស្ទូឌីយោផតខាសឆ្លាតវៃ',
    template: '%s | AI Podcast Studio',
  },
  description:
    'Provider-agnostic multi-speaker AI podcast generator with Khmer-first support. Configure commercial or self-hosted AI providers, generate structured dialogue, and export professional podcasts with transcripts and show notes.',
  applicationName: 'AI Podcast Studio',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0a0e1a' },
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="km" className="dark" suppressHydrationWarning>
      <body className={`min-h-screen bg-background font-sans antialiased ${notoSansKhmer.variable}`}>
        {children}
      </body>
    </html>
  );
}
