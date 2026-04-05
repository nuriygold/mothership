import type { Metadata } from 'next';
import './globals.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Sidebar } from '@/components/ui/sidebar';
import { Header } from '@/components/ui/header';
import { cn } from '@/components/lib/utils';
import Providers from '@/components/lib/providers';

export const metadata: Metadata = {
  title: 'Mothership',
  description: 'Operator command center for workflows, runs, and approvals.',
};

const navItems = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Tasks', href: '/tasks' },
  { label: 'Workflows', href: '/workflows' },
  { label: 'Activity', href: '/activity' },
  { label: 'Command Center', href: '/command-center' },
  { label: 'Runs', href: '/runs' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        <Providers>
          <div className="flex min-h-screen">
            <Sidebar items={navItems} />
            <div className="flex-1">
              <Header />
              <main className={cn('px-8 pb-10')}>{children}</main>
            </div>
          </div>
          <ReactQueryDevtools initialIsOpen={false} position="bottom-right" />
        </Providers>
      </body>
    </html>
  );
}
