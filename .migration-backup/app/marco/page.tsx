'use client';

export default function MarcoPage() {
  return (
    <div
      className="h-[calc(100vh-7rem)] rounded-xl overflow-hidden"
      style={{ border: '1px solid var(--border)' }}
    >
      <iframe
        src="https://marco.nuriy.com"
        className="w-full h-full"
        title="Marco Console"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}
