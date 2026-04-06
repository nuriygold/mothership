import { cn } from '@/components/lib/utils';
import type { CSSProperties } from 'react';

export function Card({
  className,
  style,
  children,
}: {
  className?: string;
  style?: CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('card p-4', className)} style={style}>
      {children}
    </div>
  );
}

export function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
      {children}
    </h3>
  );
}

export function CardSubtitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
      {children}
    </p>
  );
}
