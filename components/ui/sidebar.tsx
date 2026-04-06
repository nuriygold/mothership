'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  ListChecks,
  Bot,
  Mail,
  DollarSign,
  Activity,
} from 'lucide-react';
import { MothershipLogo } from '@/components/ui/mothership-logo';

interface SidebarItem {
  label: string;
  href: string;
}

const ICON_MAP: Record<string, React.ElementType> = {
  '/today': Home,
  '/tasks': ListChecks,
  '/bots': Bot,
  '/email': Mail,
  '/finance': DollarSign,
  '/activity': Activity,
};

export function Sidebar({ items }: { items: SidebarItem[] }) {
  const pathname = usePathname();

  return (
    <aside
      className="flex-shrink-0 w-20 flex flex-col items-center py-5 gap-1 border-r"
      style={{ background: 'var(--sidebar)', borderColor: 'var(--sidebar-border)', minHeight: '100vh' }}
    >
      {/* Logo at top — links back to Today */}
      <Link href="/today" className="mb-5 mt-1 transition-opacity hover:opacity-85">
        <MothershipLogo size={44} />
      </Link>

      {/* Nav items */}
      {items.map((item) => {
        const active = pathname?.startsWith(item.href);
        const Icon = ICON_MAP[item.href] ?? Home;
        const shortLabel = item.label.replace(' (Log)', '');

        return (
          <Link
            key={item.href}
            href={item.href as any}
            className="relative flex flex-col items-center gap-1 py-2 w-full px-2 transition-all duration-200"
          >
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-200"
              style={{ background: active ? 'var(--color-cyan)' : 'transparent' }}
            >
              <Icon
                className="w-5 h-5"
                style={{
                  color: active ? '#0A0E1A' : 'var(--sidebar-foreground)',
                  opacity: active ? 1 : 0.55,
                }}
              />
            </div>
            <span
              className="text-[10px] leading-tight"
              style={{ color: 'var(--sidebar-foreground)', opacity: active ? 1 : 0.5 }}
            >
              {shortLabel}
            </span>
            {active && (
              <div
                className="absolute right-0 top-1/2 -translate-y-1/2 w-[3px] h-8 rounded-full"
                style={{ background: 'var(--color-cyan)' }}
              />
            )}
          </Link>
        );
      })}
    </aside>
  );
}
