'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Home,
  ListChecks,
  Bot,
  Mail,
  DollarSign,
  Activity,
  Sparkles,
  Send,
  Telescope,
  FolderKanban,
  Trophy,
  ChevronLeft,
  ChevronRight,
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
  '/ruby': Sparkles,
  '/vision': Telescope,
  '/dispatch': Send,
  '/projects': FolderKanban,
  '/trophy':   Trophy,
};

const COLLAPSED_KEY = 'mothership-sidebar-collapsed';

export function Sidebar({ items }: { items: SidebarItem[] }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Load persisted collapse state
  useEffect(() => {
    try {
      const stored = localStorage.getItem(COLLAPSED_KEY);
      if (stored === 'true') setCollapsed(true);
    } catch { /* ignore */ }
    setMounted(true);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(COLLAPSED_KEY, String(next)); } catch { /* ignore */ }
      return next;
    });
  };

  // Don't flash wrong state before hydration
  const sidebarWidth = !mounted ? 80 : collapsed ? 64 : 80;
  const expandedWidth = 148;
  const finalWidth = !mounted ? sidebarWidth : collapsed ? 64 : expandedWidth;

  return (
    <aside
      className="hidden md:flex flex-shrink-0 flex-col items-center py-5 gap-1 border-r"
      style={{
        background: 'var(--sidebar)',
        borderColor: 'var(--sidebar-border)',
        minHeight: '100vh',
        width: finalWidth,
        transition: 'width 0.2s ease',
        overflow: 'hidden',
      }}
    >
      {/* Logo at top — links to Dispatch */}
      <Link href="/dispatch" className="mb-5 mt-1 transition-opacity hover:opacity-85 flex-shrink-0">
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
            className="relative flex items-center gap-2 py-2 w-full px-2 transition-all duration-200"
            style={{ justifyContent: collapsed ? 'center' : 'flex-start' }}
          >
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center transition-all duration-200 flex-shrink-0"
              style={{ background: active ? 'var(--color-cyan)' : 'transparent', minWidth: 40 }}
            >
              <Icon
                className="w-5 h-5"
                style={{
                  color: active ? '#0A0E1A' : 'var(--sidebar-foreground)',
                  opacity: active ? 1 : 0.55,
                }}
              />
            </div>
            {!collapsed && (
              <span
                className="text-[11px] leading-tight truncate"
                style={{ color: 'var(--sidebar-foreground)', opacity: active ? 1 : 0.5, whiteSpace: 'nowrap' }}
              >
                {shortLabel}
              </span>
            )}
            {active && (
              <div
                className="absolute right-0 top-1/2 -translate-y-1/2 w-[3px] h-8 rounded-full flex-shrink-0"
                style={{ background: 'var(--color-cyan)' }}
              />
            )}
          </Link>
        );
      })}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Collapse/expand toggle */}
      <button
        type="button"
        onClick={toggleCollapsed}
        className="mb-2 rounded-xl flex items-center justify-center transition-all hover:opacity-80"
        style={{
          width: 40,
          height: 40,
          background: 'rgba(0,217,255,0.08)',
          border: '1px solid rgba(0,217,255,0.15)',
          color: 'var(--sidebar-foreground)',
          cursor: 'pointer',
        }}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed
          ? <ChevronRight className="w-4 h-4" style={{ opacity: 0.6 }} />
          : <ChevronLeft className="w-4 h-4" style={{ opacity: 0.6 }} />
        }
      </button>
    </aside>
  );
}
