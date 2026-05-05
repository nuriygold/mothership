'use client';

import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/ui/sidebar';
import { MobileNav } from '@/components/ui/mobile-nav';
import { Header } from '@/components/ui/header';

interface NavItem {
  label: string;
  href: string;
}

const BARE_ROUTES = ['/login'];

export function AppShell({ items, children }: { items: NavItem[]; children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const bare = BARE_ROUTES.some((r) => pathname.startsWith(r));

  if (bare) return <>{children}</>;

  return (
    <>
      <Header />
      <MobileNav items={items} />
      <div className="flex main-container">
        <Sidebar items={items} />
        <main className="flex-1 px-4 md:px-8 py-5 md:py-8 pb-20 md:pb-12 overflow-auto">
          {children}
        </main>
      </div>
    </>
  );
}
