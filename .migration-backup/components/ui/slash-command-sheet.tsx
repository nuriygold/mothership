'use client';

import { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';

export type SlashCommand = {
  cmd: string;
  args?: string;
  desc: string;
};

type Props = {
  commands: SlashCommand[];
  label?: string;
};

export function SlashCommandSheet({ commands, label = 'Commands' }: Props) {
  const [open, setOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (sheetRef.current && !sheetRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  return (
    <div className="relative" ref={sheetRef}>
      {/* Trigger pill */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Show slash commands"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          padding: '4px 11px 4px 9px',
          borderRadius: '999px',
          fontSize: '12px',
          fontWeight: 600,
          letterSpacing: '0.01em',
          cursor: 'pointer',
          border: '1.5px solid rgba(0,0,0,0.1)',
          background: open
            ? 'var(--color-lemon, #fef08a)'
            : 'rgba(255,255,255,0.65)',
          color: 'var(--foreground)',
          backdropFilter: 'blur(6px)',
          boxShadow: open
            ? '0 4px 14px rgba(0,0,0,0.13)'
            : '0 1px 4px rgba(0,0,0,0.08)',
          transition: 'all 0.18s ease',
          userSelect: 'none',
        }}
      >
        {/* Terminal icon inline SVG */}
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ opacity: 0.75 }}
        >
          <polyline points="4 17 10 11 4 5" />
          <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
        /{label}
      </button>

      {/* Sticky-note sheet */}
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 10px)',
            right: 0,
            zIndex: 50,
            width: '300px',
            background: 'var(--color-lemon, #fef08a)',
            borderRadius: '4px 16px 16px 16px',
            boxShadow: '4px 6px 24px rgba(0,0,0,0.18), 0 1px 0 rgba(0,0,0,0.05) inset',
            padding: '16px 18px 18px',
            transform: 'rotate(0.4deg)',
            transformOrigin: 'top right',
            border: '1px solid rgba(0,0,0,0.07)',
          }}
        >
          {/* Tape strip at top */}
          <div
            style={{
              position: 'absolute',
              top: '-10px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '48px',
              height: '20px',
              background: 'rgba(255,255,255,0.55)',
              borderRadius: '3px',
              border: '1px solid rgba(0,0,0,0.08)',
              backdropFilter: 'blur(2px)',
            }}
          />

          {/* Header row */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '12px',
            }}
          >
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'rgba(0,0,0,0.5)',
              }}
            >
              Telegram Commands
            </span>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                background: 'rgba(0,0,0,0.1)',
                border: 'none',
                cursor: 'pointer',
                color: 'rgba(0,0,0,0.5)',
                flexShrink: 0,
              }}
            >
              <X size={11} />
            </button>
          </div>

          {/* Command list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {commands.map((c) => (
              <div
                key={c.cmd + (c.args ?? '')}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: '8px',
                  padding: '6px 8px',
                  borderRadius: '8px',
                  background: 'rgba(255,255,255,0.4)',
                  border: '1px solid rgba(0,0,0,0.05)',
                }}
              >
                <code
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    fontFamily: '"SF Mono", "Fira Code", ui-monospace, monospace',
                    color: 'rgba(0,0,0,0.75)',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  {c.cmd}
                  {c.args && (
                    <span
                      style={{
                        fontWeight: 400,
                        opacity: 0.6,
                        fontSize: '10px',
                      }}
                    >
                      {' '}
                      {c.args}
                    </span>
                  )}
                </code>
                <span
                  style={{
                    fontSize: '11px',
                    color: 'rgba(0,0,0,0.55)',
                    lineHeight: 1.4,
                  }}
                >
                  {c.desc}
                </span>
              </div>
            ))}
          </div>

          {/* Bottom note */}
          <p
            style={{
              fontSize: '10px',
              color: 'rgba(0,0,0,0.38)',
              marginTop: '10px',
              textAlign: 'center',
              fontStyle: 'italic',
            }}
          >
            Send these in Telegram to control Mothership
          </p>
        </div>
      )}
    </div>
  );
}
