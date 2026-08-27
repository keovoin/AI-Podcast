'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const navItems = [
  { href: '/projects', label: 'Projects', icon: '🎙️' },
  { href: '/providers', label: 'Providers', icon: '🔌' },
  { href: '/speakers', label: 'Speakers', icon: '🗣️' },
  { href: '/benchmark', label: 'Benchmark', icon: '📊' },
  { href: '/exports', label: 'Exports', icon: '📦' },
  { href: '/usage', label: 'Usage', icon: '📈' },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Header — Fragments-style responsive app bar */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 text-base font-bold tracking-tight">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm text-primary-foreground shadow-sm"
              aria-hidden="true"
            >
              🎧
            </span>
            <span className="hidden sm:inline">AI Podcast Studio</span>
            <span className="sm:hidden">Studio</span>
          </Link>

          {/* Desktop nav */}
          <nav aria-label="Main navigation" className="ml-2 hidden flex-1 md:block">
            <ul className="flex items-center gap-1">
              {navItems.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== '/projects' && pathname.startsWith(item.href)) ||
                  (item.href === '/projects' && pathname.startsWith('/projects'));
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                        active
                          ? 'bg-accent text-accent-foreground'
                          : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                      )}
                    >
                      <span aria-hidden="true" className="text-base leading-none">{item.icon}</span>
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {/* Mobile menu toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileOpen((v) => !v)}
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav"
              aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            >
              {mobileOpen ? '✕' : '☰'}
            </Button>
          </div>
        </div>

        {/* Mobile nav — collapsible drawer */}
        {mobileOpen && (
          <nav
            id="mobile-nav"
            aria-label="Mobile navigation"
            className="border-t border-border bg-background md:hidden animate-fade-in"
          >
            <ul className="mx-auto max-w-7xl space-y-1 px-4 py-3">
              {navItems.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== '/projects' && pathname.startsWith(item.href)) ||
                  (item.href === '/projects' && pathname.startsWith('/projects'));
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                        active
                          ? 'bg-accent text-accent-foreground'
                          : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                      )}
                    >
                      <span aria-hidden="true" className="text-base leading-none">{item.icon}</span>
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
      </header>

      <main id="main-content" className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {children}
      </main>

      <footer className="border-t border-border py-6">
        <p className="mx-auto max-w-7xl px-4 text-center text-xs text-muted-foreground sm:px-6">
          AI Podcast Studio · ស្ទូឌីយោផតខាសឆ្លាតវៃ · Khmer-first multi-provider podcast generation
        </p>
      </footer>
    </div>
  );
}
