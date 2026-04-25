'use client';

import { useState } from 'react';
import { FileText, Folder, X } from 'lucide-react';
import { formatBytes, formatRelative, opsTheme } from '@/lib/ops/client';
import type { CampaignArtifact } from '@/lib/ops/types';
import { OpsCard, OpsHeading } from './ops-shell';

export function ArtifactPanel({ artifacts }: { artifacts: CampaignArtifact[] }) {
  const [preview, setPreview] = useState<CampaignArtifact | null>(null);

  return (
    <>
      <OpsCard>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Folder size={14} style={{ color: opsTheme.green }} />
          <OpsHeading level={3}>Artifacts</OpsHeading>
          <span
            style={{
              fontFamily: opsTheme.mono,
              fontSize: 10,
              color: opsTheme.textDim,
              marginLeft: 'auto',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}
          >
            {artifacts.length} files
          </span>
        </div>

        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {artifacts.length === 0 && (
            <div style={{ fontFamily: opsTheme.mono, fontSize: 11, color: opsTheme.textDim, padding: 8 }}>
              No artifacts yet.
            </div>
          )}
          {artifacts.map((art) => (
            <button
              key={art.name}
              type="button"
              onClick={() => setPreview(art)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 10px',
                borderRadius: 8,
                background: 'rgba(255,255,255,0.02)',
                border: `1px solid ${opsTheme.border}`,
                cursor: 'pointer',
                textAlign: 'left',
                color: opsTheme.text,
                fontFamily: opsTheme.body,
                width: '100%',
              }}
            >
              <FileText size={14} style={{ color: opsTheme.blue, flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12, color: opsTheme.text }}>{art.name}</div>
                <div
                  style={{
                    fontFamily: opsTheme.mono,
                    fontSize: 10,
                    color: opsTheme.textDim,
                    marginTop: 2,
                    letterSpacing: '0.06em',
                  }}
                >
                  {formatBytes(art.size)}
                  {typeof art.rows === 'number' && ` · ${art.rows.toLocaleString()} rows`}
                  {' · '}
                  {formatRelative(art.updatedAt)}
                </div>
              </div>
              <span
                style={{
                  fontFamily: opsTheme.mono,
                  fontSize: 10,
                  color: opsTheme.green,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                }}
              >
                Open
              </span>
            </button>
          ))}
        </div>
      </OpsCard>

      {preview && <ArtifactPreviewModal artifact={preview} onClose={() => setPreview(null)} />}
    </>
  );
}

function ArtifactPreviewModal({ artifact, onClose }: { artifact: CampaignArtifact; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Preview ${artifact.name}`}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.78)',
        backdropFilter: 'blur(8px)',
        zIndex: 110,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 720,
          maxHeight: '88vh',
          background: opsTheme.surface,
          border: `1px solid ${opsTheme.borderStrong}`,
          borderRadius: 12,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${opsTheme.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <FileText size={14} style={{ color: opsTheme.blue }} />
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontFamily: opsTheme.mono,
                  fontSize: 12,
                  color: opsTheme.text,
                  fontWeight: 500,
                }}
              >
                {artifact.name}
              </div>
              <div
                style={{
                  fontFamily: opsTheme.mono,
                  fontSize: 10,
                  color: opsTheme.textDim,
                  letterSpacing: '0.06em',
                }}
              >
                {formatBytes(artifact.size)} · updated {formatRelative(artifact.updatedAt)}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close preview"
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
        <pre
          style={{
            margin: 0,
            padding: 16,
            overflow: 'auto',
            background: opsTheme.bg,
            color: opsTheme.text,
            fontFamily: opsTheme.mono,
            fontSize: 12,
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            flex: 1,
          }}
        >
          {artifact.preview}
        </pre>
      </div>
    </div>
  );
}
