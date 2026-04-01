'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/components/lib/utils';
import { ScrollArea } from '@radix-ui/react-scroll-area';

interface SidebarItem {
  label: string;
  href: string;
}

export function Sidebar({ items }: { items: SidebarItem[] }) {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r border-border bg-surface/80 backdrop-blur">
      <div className="px-6 py-6 text-xl font-semibold tracking-tight">Mothership</div>
      <ScrollArea style={{ height: 'calc(100vh - 80px)' }}>
        <nav className="px-3 pb-6 space-y-1">
          {items.map((item) => {
            const active = pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center rounded-lg px-3 py-2 text-sm transition hover:bg-panel',
                  active ? 'bg-panel text-white' : 'text-slate-300'
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </ScrollArea>
    </aside>
  );
}
