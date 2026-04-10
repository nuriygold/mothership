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

export function MobileNav({ items }: { items: SidebarItem[] }) {
  const pathname = usePathname();

  return (
    <nav
      className="flex md:hidden items-center px-2 overflow-x-auto scrollbar-hide border-b flex-shrink-0"
      style={{
        background: 'var(--sidebar)',
        borderColor: 'var(--sidebar-border)',
        height: '60px',
      }}
    >
      {/* Logo */}
      <Link href="/today" className="flex-shrink-0 mr-1 px-2 transition-opacity hover:opacity-85">
        <MothershipLogo size={32} />
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
            className="relative flex-shrink-0 flex flex-col items-center gap-0.5 px-3 py-2 transition-all duration-200"
          >
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200"
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
                className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[3px] w-8 rounded-full"
                style={{ background: 'var(--color-cyan)' }}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
