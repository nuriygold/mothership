import { Separator } from '@radix-ui/react-separator';

export function Header() {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-[#0d1017]/90 px-8 py-4 backdrop-blur">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">OpenClaw Control Plane</p>
        <p className="text-lg font-semibold text-white">Mothership</p>
      </div>
      <div className="flex items-center gap-3 text-xs text-slate-400">
        <div className="h-2 w-2 rounded-full bg-emerald-400" />
        <span>Systems nominal</span>
      </div>
    </header>
  );
}
