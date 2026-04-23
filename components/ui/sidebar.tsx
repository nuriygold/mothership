'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Sun,
  ListChecks,
  Bot,
  Mail,
  DollarSign,
  Activity,
  Send,
  Telescope,
  FolderKanban,
  Trophy,
} from 'lucide-react';
import { MothershipLogo } from '@/components/ui/mothership-logo';

interface SidebarItem {
  label: string;
  href: string;
}

const ICON_MAP: Record<string, React.ElementType> = {
  '/today':    Sun,
  '/trophy':   Trophy,
  '/tasks':    ListChecks,
  '/bots':     Bot,
  '/email':    Mail,
  '/finance':  DollarSign,
  '/activity': Activity,
  '/vision':   Telescope,
  '/dispatch': Send,
  '/projects': FolderKanban,
};

// Routes that live in the top header instead of the desktop sidebar.
// Drizzy (Ruby) moved up here with the personas. Trophies moved out — it now
// anchors the sidebar directly under the logo.
const HEADER_ROUTES = new Set(['/iceman', '/marvin', '/ruby', '/claude', '/marco']);

export function Sidebar({ items }: { items: SidebarItem[] }) {
  const pathname = usePathname();
  const sidebarItems = items.filter((item) => !HEADER_ROUTES.has(item.href));

  return (
    <aside
      className="hidden md:flex flex-shrink-0 w-20 flex-col items-center py-5 gap-1 border-r sticky self-start overflow-y-auto"
      style={{
        background: 'var(--sidebar)',
        borderColor: 'var(--sidebar-border)',
        top: 'var(--header-h)',
        height: 'calc(100vh - var(--header-h))',
      }}
    >
      {/* Logo at top — links Home (Today) */}
      <Link href="/today" className="mb-5 mt-1 transition-opacity hover:opacity-85">
        <MothershipLogo size={44} />
      </Link>

      {/* Nav items */}
      {sidebarItems.map((item) => {
        const active = pathname?.startsWith(item.href);
        const Icon = ICON_MAP[item.href] ?? Sun;
        const shortLabel = item.label.replace(' (Log)', '');

        return (
          <Link
            key={item.href}
            href={item.href as any}
            className="relative flex flex-col items-center gap-1 py-2 w-full px-2 transition-all duration-200"
          >
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-200"
              style={{ background: active ? 'var(--bg3)' : 'transparent' }}
            >
              <Icon
                className="w-5 h-5"
                style={{
                  color: active ? '#0470a0' : 'var(--sidebar-foreground)',
                  opacity: active ? 1 : 0.55,
                }}
              />
            </div>
            <span
              className="text-[10px] leading-tight"
              style={{ color: active ? '#0470a0' : 'var(--sidebar-foreground)', opacity: active ? 1 : 0.5 }}
            >
              {shortLabel}
            </span>
            {active && (
              <div
                className="absolute right-0 top-1/2 -translate-y-1/2 w-[3px] h-8 rounded-full"
                style={{ background: '#0470a0' }}
              />
            )}
          </Link>
        );
      })}
    </aside>
  );
}
