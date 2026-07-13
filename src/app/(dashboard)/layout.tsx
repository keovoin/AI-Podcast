import Link from 'next/link';

const navItems = [
  { href: '/', label: 'Home' },
  { href: '/providers', label: 'Providers' },
  { href: '/projects', label: 'Projects' },
  { href: '/speakers', label: 'Speakers' },
  { href: '/benchmark', label: 'Benchmark Lab' },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="container flex h-16 items-center px-4">
          <Link href="/" className="text-lg font-bold mr-8">
            AI Podcast Studio
          </Link>
          <nav className="flex items-center space-x-6 text-sm font-medium">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="transition-colors hover:text-foreground/80 text-foreground/60"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
