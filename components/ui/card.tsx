import { cn } from '@/components/lib/utils';

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('card border border-border bg-surface/80 p-4', className)}>{children}</div>;
}

export function CardTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold text-white">{children}</h3>;
}

export function CardSubtitle({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-slate-400">{children}</p>;
}
