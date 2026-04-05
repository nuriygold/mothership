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
    <aside className="w-64 border-r border-border backdrop-blur-xl" style={{ background: 'var(--sidebar)' }}>
      <div className="px-6 py-6 text-xl font-semibold tracking-tight" style={{ color: 'var(--foreground)' }}>
        Mothership
      </div>
      <ScrollArea style={{ height: 'calc(100vh - 80px)' }}>
        <nav className="px-3 pb-6 space-y-1">
          {items.map((item) => {
            const active = pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href as any}
                className={cn(
                  'flex items-center rounded-xl px-3 py-2 text-sm transition',
                  active
                    ? 'shadow'
                    : 'hover:bg-[var(--sidebar-accent)]'
                )}
                style={{
                  background: active ? 'var(--sidebar-accent)' : 'transparent',
                  color: active ? 'var(--sidebar-foreground)' : 'var(--muted-foreground)',
                  borderColor: 'var(--sidebar-border)',
                }}
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
