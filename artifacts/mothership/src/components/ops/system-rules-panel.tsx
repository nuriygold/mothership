
import { useState } from 'react';
import { Settings2 } from 'lucide-react';
import { opsTheme, patchSystemRules } from '@/lib/ops/client';
import type { SystemRules } from '@/lib/ops/types';
import { OpsCard, OpsHeading, OpsLabel } from './ops-shell';

export function SystemRulesPanel({
  rules,
  mutable,
  onUpdated,
}: {
  rules: SystemRules | null;
  mutable: boolean;
  onUpdated: (next: SystemRules) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function update(patch: Partial<SystemRules>) {
    if (busy || !mutable) return;
    setBusy(true);
    setError(null);
    try {
      const next = await patchSystemRules(patch);
      onUpdated(next.rules);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update rules');
    } finally {
      setBusy(false);
    }
  }

  if (!rules) {
    return (
      <OpsCard>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Settings2 size={14} style={{ color: opsTheme.green }} />
          <OpsHeading level={3}>System Rules</OpsHeading>
        </div>
        <div style={{ fontFamily: opsTheme.mono, fontSize: 11, color: opsTheme.textDim, marginTop: 12 }}>
          Loading…
        </div>
      </OpsCard>
    );
  }

  return (
    <OpsCard>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Settings2 size={14} style={{ color: opsTheme.green }} />
        <OpsHeading level={3}>System Rules</OpsHeading>
      </div>
      <OpsLabel style={{ marginTop: 4 }}>Live policy · backend-driven</OpsLabel>
      {!mutable ? (
        <div style={{ fontFamily: opsTheme.mono, fontSize: 11, color: opsTheme.amber, marginTop: 12 }}>
          Volatile system rules are disabled until durable persistence is implemented.
        </div>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 12 }}>
        <Toggle
          label="Execution Mode"
          value={rules.executionMode}
          onChange={(v) => update({ executionMode: v })}
          disabled={busy || !mutable}
        />
        <Toggle
          label="Fallback Enforcement"
          value={rules.fallbackEnforcement}
          onChange={(v) => update({ fallbackEnforcement: v })}
          disabled={busy || !mutable}
        />
        <NumberRow
          label="Batch Minimum"
          value={rules.batchMinimum}
          unit="rows"
          onChange={(v) => update({ batchMinimum: v })}
          disabled={busy || !mutable}
          min={1}
        />
        <NumberRow
          label="Watchdog Interval"
          value={rules.watchdogIntervalMinutes}
          unit="min"
          onChange={(v) => update({ watchdogIntervalMinutes: v })}
          disabled={busy || !mutable}
          min={1}
        />
        <NumberRow
          label="Blocker Threshold"
          value={rules.blockerThreshold}
          unit="attempts"
          onChange={(v) => update({ blockerThreshold: v })}
          disabled={busy || !mutable}
          min={1}
        />
      </div>
      {error ? (
        <div style={{ fontFamily: opsTheme.mono, fontSize: 11, color: opsTheme.red, marginTop: 12 }}>
          {error}
        </div>
      ) : null}
    </OpsCard>
  );
}

function Toggle({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 0',
        borderBottom: `1px solid ${opsTheme.border}`,
      }}
    >
      <span
        style={{
          fontFamily: opsTheme.body,
          fontSize: 12,
          color: opsTheme.text,
        }}
      >
        {label}
      </span>
      <button
        type="button"
        onClick={() => onChange(!value)}
        disabled={disabled}
        aria-pressed={value}
        aria-label={`Toggle ${label}`}
        style={{
          width: 40,
          height: 22,
          borderRadius: 999,
          border: `1px solid ${value ? opsTheme.green : opsTheme.border}`,
          background: value ? `${opsTheme.green}30` : 'rgba(255,255,255,0.04)',
          position: 'relative',
          cursor: disabled ? 'wait' : 'pointer',
          transition: 'all 160ms ease',
          padding: 0,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: value ? 20 : 2,
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: value ? opsTheme.green : opsTheme.textMuted,
            boxShadow: value ? `0 0 12px ${opsTheme.green}` : 'none',
            transition: 'left 160ms ease, background 160ms ease',
          }}
        />
      </button>
    </div>
  );
}

function NumberRow({
  label,
  value,
  unit,
  onChange,
  disabled,
  min = 1,
}: {
  label: string;
  value: number;
  unit?: string;
  onChange: (v: number) => void;
  disabled?: boolean;
  min?: number;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 0',
        borderBottom: `1px solid ${opsTheme.border}`,
      }}
    >
      <span style={{ fontFamily: opsTheme.body, fontSize: 12, color: opsTheme.text }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          type="button"
          aria-label={`Decrement ${label}`}
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={disabled}
          style={stepBtnStyle()}
        >
          −
        </button>
        <span
          style={{
            fontFamily: opsTheme.mono,
            fontSize: 12,
            color: opsTheme.green,
            minWidth: 36,
            textAlign: 'center',
            letterSpacing: '0.04em',
          }}
        >
          {value}
          {unit && <span style={{ color: opsTheme.textDim, marginLeft: 4, fontSize: 10 }}>{unit}</span>}
        </span>
        <button
          type="button"
          aria-label={`Increment ${label}`}
          onClick={() => onChange(value + 1)}
          disabled={disabled}
          style={stepBtnStyle()}
        >
          +
        </button>
      </div>
    </div>
  );
}

function stepBtnStyle(): React.CSSProperties {
  return {
    width: 24,
    height: 24,
    borderRadius: 6,
    border: `1px solid ${opsTheme.border}`,
    background: 'transparent',
    color: opsTheme.text,
    cursor: 'pointer',
    fontFamily: opsTheme.mono,
    fontSize: 14,
    lineHeight: 1,
    padding: 0,
  };
}
