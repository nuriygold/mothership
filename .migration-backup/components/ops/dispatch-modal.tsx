'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { dispatchCampaign, opsTheme } from '@/lib/ops/client';
import type { Agent, ExecutionMode } from '@/lib/ops/types';

const ARTIFACT_OPTIONS = [
  'products.md',
  'creators.md',
  'ledger-diff.md',
  'release-notes.md',
  'action-log.md',
  'blockers.md',
];

export function DispatchModal({
  agents,
  onClose,
  onDispatched,
}: {
  agents: Agent[];
  onClose: () => void;
  onDispatched: () => void;
}) {
  const [name, setName] = useState('');
  const [objective, setObjective] = useState('');
  const [leadAgentId, setLeadAgentId] = useState(agents[0]?.id ?? '');
  const [requiredArtifacts, setRequiredArtifacts] = useState<string[]>(['action-log.md']);
  const [minimumBatchSize, setMinimumBatchSize] = useState(5);
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('STANDARD');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!leadAgentId && agents[0]) setLeadAgentId(agents[0].id);
  }, [agents, leadAgentId]);

  // Esc to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function toggleArtifact(name: string) {
    setRequiredArtifacts((prev) =>
      prev.includes(name) ? prev.filter((a) => a !== name) : [...prev, name]
    );
  }

  async function handleSubmit() {
    setError(null);
    if (!name.trim() || !objective.trim() || !leadAgentId) {
      setError('Name, objective, and lead agent are required.');
      return;
    }
    setSubmitting(true);
    try {
      await dispatchCampaign({
        name: name.trim(),
        objective: objective.trim(),
        leadAgentId,
        requiredArtifacts,
        minimumBatchSize,
        executionMode,
      });
      onDispatched();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dispatch failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(8px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 560,
          background: opsTheme.surface,
          border: `1px solid ${opsTheme.borderStrong}`,
          borderRadius: '16px 16px 0 0',
          padding: 20,
          maxHeight: '92vh',
          overflowY: 'auto',
          boxShadow: '0 -20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,255,156,0.1)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div>
            <div
              style={{
                fontFamily: opsTheme.mono,
                fontSize: 10,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: opsTheme.green,
              }}
            >
              › Dispatch
            </div>
            <h2
              style={{
                fontFamily: opsTheme.display,
                fontWeight: 700,
                fontSize: 22,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: opsTheme.text,
                margin: '4px 0 0',
              }}
            >
              New Campaign
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close dispatch"
            style={{
              background: 'transparent',
              border: `1px solid ${opsTheme.border}`,
              borderRadius: 8,
              padding: 6,
              color: opsTheme.textMuted,
              cursor: 'pointer',
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Campaign name">
            <Input value={name} onChange={(v) => setName(v)} placeholder="e.g. Shopify Audit" />
          </Field>

          <Field label="Objective">
            <textarea
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              rows={3}
              placeholder="What does this campaign accomplish?"
              style={textInputStyle({ multiline: true })}
            />
          </Field>

          <Field label="Lead agent">
            <select
              value={leadAgentId}
              onChange={(e) => setLeadAgentId(e.target.value)}
              style={textInputStyle({})}
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id} style={{ background: opsTheme.surface }}>
                  {a.name} · {a.domain}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Required artifacts">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {ARTIFACT_OPTIONS.map((opt) => {
                const active = requiredArtifacts.includes(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => toggleArtifact(opt)}
                    style={{
                      fontFamily: opsTheme.mono,
                      fontSize: 11,
                      padding: '5px 10px',
                      borderRadius: 6,
                      border: `1px solid ${active ? opsTheme.green : opsTheme.border}`,
                      background: active ? `${opsTheme.green}1a` : 'transparent',
                      color: active ? opsTheme.green : opsTheme.textMuted,
                      cursor: 'pointer',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Min batch size">
              <Input
                type="number"
                value={String(minimumBatchSize)}
                onChange={(v) => setMinimumBatchSize(Math.max(1, parseInt(v, 10) || 1))}
              />
            </Field>
            <Field label="Execution mode">
              <div style={{ display: 'flex', gap: 6 }}>
                <ModeButton
                  active={executionMode === 'STANDARD'}
                  onClick={() => setExecutionMode('STANDARD')}
                  label="Standard"
                />
                <ModeButton
                  active={executionMode === 'AGGRESSIVE'}
                  onClick={() => setExecutionMode('AGGRESSIVE')}
                  label="Aggressive"
                  warning
                />
              </div>
            </Field>
          </div>

          {executionMode === 'AGGRESSIVE' && (
            <div
              style={{
                fontFamily: opsTheme.mono,
                fontSize: 11,
                color: opsTheme.amber,
                background: 'rgba(255,181,71,0.06)',
                border: '1px solid rgba(255,181,71,0.25)',
                padding: 10,
                borderRadius: 8,
                lineHeight: 1.5,
              }}
            >
              Aggressive: no pause between batches, fallback enforced on every retry.
            </div>
          )}

          {error && (
            <div
              style={{
                fontFamily: opsTheme.mono,
                fontSize: 11,
                color: opsTheme.red,
                background: 'rgba(255,85,119,0.08)',
                border: '1px solid rgba(255,85,119,0.25)',
                padding: 10,
                borderRadius: 8,
              }}
            >
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              marginTop: 4,
              padding: '12px 16px',
              borderRadius: 8,
              border: `1px solid ${opsTheme.green}`,
              background: opsTheme.green,
              color: '#04140a',
              fontFamily: opsTheme.mono,
              fontWeight: 600,
              fontSize: 12,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              cursor: submitting ? 'wait' : 'pointer',
              opacity: submitting ? 0.7 : 1,
              boxShadow: `0 0 24px ${opsTheme.green}40`,
            }}
          >
            {submitting ? 'Dispatching…' : 'Start Campaign'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label
        style={{
          display: 'block',
          fontFamily: opsTheme.mono,
          fontSize: 10,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: opsTheme.textDim,
          marginBottom: 6,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function textInputStyle({ multiline }: { multiline?: boolean }): React.CSSProperties {
  return {
    width: '100%',
    background: opsTheme.bg,
    border: `1px solid ${opsTheme.border}`,
    borderRadius: 8,
    padding: '10px 12px',
    color: opsTheme.text,
    fontFamily: multiline ? opsTheme.body : opsTheme.mono,
    fontSize: 13,
    outline: 'none',
    resize: multiline ? 'vertical' : 'none',
  };
}

function Input({
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={textInputStyle({})}
    />
  );
}

function ModeButton({
  active,
  label,
  onClick,
  warning,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  warning?: boolean;
}) {
  const accent = warning ? opsTheme.amber : opsTheme.green;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: '8px 10px',
        borderRadius: 8,
        border: `1px solid ${active ? accent : opsTheme.border}`,
        background: active ? `${accent}1a` : 'transparent',
        color: active ? accent : opsTheme.textMuted,
        fontFamily: opsTheme.mono,
        fontSize: 11,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}
