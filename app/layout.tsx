import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Sidebar } from '@/components/ui/sidebar';
import { MobileNav } from '@/components/ui/mobile-nav';
import { Header } from '@/components/ui/header';
import { CommandPalette } from '@/components/ui/command-palette';
import Providers from '@/components/lib/providers';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

export const metadata: Metadata = {
  title: 'Mothership',
  description: 'Operator command center for workflows, runs, and approvals.',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Mothership' },
  other: { 'mobile-web-app-capable': 'yes' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

const navItems = [
  { label: 'Today', href: '/today' },
  { label: 'Tasks', href: '/tasks' },
  { label: 'Bots', href: '/bots' },
  { label: 'Email', href: '/email' },
  { label: 'Finance', href: '/finance' },
  { label: 'Activity (Log)', href: '/activity' },
  { label: 'Ruby', href: '/ruby' },
  { label: 'Vision', href: '/vision' },
  { label: 'Dispatch', href: '/dispatch' },
  { label: 'Projects', href: '/projects' },
  { label: 'Trophy', href: '/trophy' },
  { label: 'Marco', href: '/marco' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen" style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
        <Providers>
          {/* Global command palette — triggered by Cmd+K / Ctrl+K */}
          <CommandPalette />

          {/* Full-width thin status bar at top */}
          <Header />

          {/* Mobile horizontal nav (hidden on md+) */}
          <MobileNav items={navItems} />

          {/* Sidebar + main content below */}
          <div className="flex main-container">
            <Sidebar items={navItems} />
            <main className="flex-1 px-4 md:px-8 py-5 md:py-8 pb-20 md:pb-12 overflow-auto">
              {children}
            </main>
          </div>

          <ReactQueryDevtools initialIsOpen={false} position="bottom-right" />
        </Providers>
      </body>
    </html>
  );
}
