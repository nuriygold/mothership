import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppShell } from '@/components/ui/app-shell';
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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@600;700&family=IBM+Plex+Mono:wght@400;500&family=Space+Grotesk:wght@300;400;500&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen" style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
        <Providers>
          <CommandPalette />
          <AppShell items={navItems}>
            {children}
          </AppShell>
          <ReactQueryDevtools initialIsOpen={false} position="bottom-right" />
        </Providers>
      </body>
    </html>
  );
}
