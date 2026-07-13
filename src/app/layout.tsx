import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Podcast Studio',
  description: 'Provider-agnostic multi-speaker AI podcast generator with Khmer-first support',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
