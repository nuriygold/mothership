'use client';

import { useEffect, useState, useMemo } from 'react';
import useSWR from 'swr';
import {
  Plus, Palette, Cpu, TrendingUp, Home, User, Folder,
  X, Sparkles, ExternalLink,
} from 'lucide-react';
import { broadcastProjectsUpdated, onProjectsUpdated } from '@/lib/projects/project-sync';

// ─── Types ───────────────────────────────────────────────────────────────────

type ProjectColor = 'pink' | 'cyan' | 'mint' | 'lemon' | 'lavender' | 'peach' | 'sky';
type ProjectIcon = 'palette' | 'cpu' | 'trending' | 'home' | 'user' | 'folder';

interface ProjectCampaign {
  id: string;
  title: string;
  status: string;
  tasks: { status: string }[];
}

interface Project {
  id: string;
  title: string;
  description: string | null;
  color: ProjectColor;
  icon: ProjectIcon;
  sortOrder: number;
  isDefault: boolean;
  campaigns: ProjectCampaign[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const COLOR_MAP: Record<ProjectColor, { bg: string; text: string; border: string; glow: string }> = {
  pink:     { bg: 'var(--color-pink)',     text: 'var(--color-pink-text)',     border: 'rgba(236,72,153,0.25)',  glow: 'rgba(236,72,153,0.08)' },
  cyan:     { bg: 'var(--color-cyan)',     text: '#0A0E1A',                   border: 'rgba(0,217,255,0.35)',   glow: 'rgba(0,217,255,0.08)' },
  mint:     { bg: 'var(--color-mint)',     text: 'var(--color-mint-text)',     border: 'rgba(52,211,153,0.25)',  glow: 'rgba(52,211,153,0.08)' },
  lemon:    { bg: 'var(--color-lemon)',    text: 'var(--color-lemon-text)',    border: 'rgba(253,224,71,0.35)',  glow: 'rgba(253,224,71,0.08)' },
  lavender: { bg: 'var(--color-lavender)', text: 'var(--color-lavender-text)', border: 'rgba(139,92,246,0.25)', glow: 'rgba(139,92,246,0.08)' },
  peach:    { bg: 'var(--color-peach)',    text: 'var(--color-peach-text)',    border: 'rgba(251,146,60,0.25)', glow: 'rgba(251,146,60,0.08)' },
  sky:      { bg: 'var(--color-sky)',      text: 'var(--color-sky-text)',      border: 'rgba(56,189,248,0.25)', glow: 'rgba(56,189,248,0.08)' },
};

const ICON_MAP: Record<ProjectIcon, React.ElementType> = {
  palette:  Palette,
  cpu:      Cpu,
  trending: TrendingUp,
  home:     Home,
  user:     User,
  folder:   Folder,
};

const ALL_COLORS: { value: ProjectColor; label: string }[] = [
  { value: 'pink', label: 'Pink' }, { value: 'cyan', label: 'Cyan' },
  { value: 'mint', label: 'Mint' }, { value: 'lemon', label: 'Lemon' },
  { value: 'lavender', label: 'Lavender' }, { value: 'peach', label: 'Peach' },
  { value: 'sky', label: 'Sky' },
];

const ALL_ICONS: { value: ProjectIcon; label: string }[] = [
  { value: 'palette', label: 'Palette' }, { value: 'cpu', label: 'CPU' },
  { value: 'trending', label: 'Trending' }, { value: 'home', label: 'Home' },
  { value: 'user', label: 'Person' }, { value: 'folder', label: 'Folder' },
];

const CAMPAIGN_STATUS_DOT: Record<string, string> = {
  EXECUTING: '#00D9FF', READY: '#4CAF83', PLANNING: '#FFB800',
  PAUSED: '#FF9500', FAILED: '#FF5C5C', DONE: '#4CAF83', DRAFT: '#8A8FA8',
};

// ─── Fetcher ─────────────────────────────────────────────────────────────────

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? 'Failed');
  return json;
};

// ─── New Project Modal ────────────────────────────────────────────────────────

function NewProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState<ProjectColor>('lavender');
  const [icon, setIcon] = useState<ProjectIcon>('folder');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate() {
    const t = title.trim();
    if (!t) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: t, description: description.trim() || undefined, color, icon }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? 'Failed to create');
      broadcastProjectsUpdated();
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
      setSaving(false);
    }
  }

  const scheme = COLOR_MAP[color];
  const Icon = ICON_MAP[icon];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="w-full max-w-md rounded-3xl p-6 shadow-2xl" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: scheme.bg, border: `1px solid ${scheme.border}` }}>
            <Icon className="w-6 h-6" style={{ color: scheme.text }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>{title || 'New Project'}</p>
            <p className="text-xs truncate" style={{ color: 'var(--muted-foreground)' }}>{description || 'No description'}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-full hover:opacity-70">
            <X className="w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />
          </button>
        </div>

        <div className="space-y-3">
          <input
            autoFocus
            className="w-full rounded-xl border px-3 py-2.5 text-sm"
            style={{ borderColor: 'var(--border)', background: 'var(--input-background)', color: 'var(--foreground)' }}
            placeholder="Project name"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleCreate()}
          />
          <textarea
            className="w-full rounded-xl border px-3 py-2.5 text-sm resize-none"
            style={{ borderColor: 'var(--border)', background: 'var(--input-background)', color: 'var(--foreground)' }}
            placeholder="What is this project? (optional)"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--muted-foreground)' }}>Color</p>
            <div className="flex gap-2 flex-wrap">
              {ALL_COLORS.map((c) => (
                <button key={c.value} type="button" onClick={() => setColor(c.value)}
                  className="w-7 h-7 rounded-full transition-transform hover:scale-110"
                  style={{ background: COLOR_MAP[c.value].bg, outline: color === c.value ? '2px solid var(--foreground)' : 'none', outlineOffset: '2px' }}
                  title={c.label} />
              ))}
            </div>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--muted-foreground)' }}>Icon</p>
            <div className="flex gap-2 flex-wrap">
              {ALL_ICONS.map((ic) => {
                const Ic = ICON_MAP[ic.value];
                return (
                  <button key={ic.value} type="button" onClick={() => setIcon(ic.value)}
                    className="w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:scale-105"
                    style={{ background: icon === ic.value ? scheme.bg : 'var(--muted)', border: icon === ic.value ? `1.5px solid ${scheme.border}` : '1.5px solid transparent' }}
                    title={ic.label}>
                    <Ic className="w-4 h-4" style={{ color: icon === ic.value ? scheme.text : 'var(--muted-foreground)' }} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {error && <p className="mt-3 text-xs text-rose-400">{error}</p>}
        <button type="button" onClick={() => void handleCreate()} disabled={!title.trim() || saving}
          className="mt-4 w-full rounded-xl py-2.5 text-sm font-semibold transition-opacity hover:opacity-80 disabled:opacity-40"
          style={{ background: scheme.bg, color: scheme.text }}>
          {saving ? 'Creating…' : 'Create project'}
        </button>
      </div>
    </div>
  );
}

// ─── Assign Campaign Modal ────────────────────────────────────────────────────

function AssignCampaignModal({
  project, allCampaigns, onClose, onAssigned,
}: {
  project: Project;
  allCampaigns: { id: string; title: string; projectId: string | null }[];
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [search, setSearch] = useState('');
  const [assigning, setAssigning] = useState<string | null>(null);

  const scheme = COLOR_MAP[project.color as ProjectColor] ?? COLOR_MAP.lavender;
  const unassigned = allCampaigns.filter(
    (c) => !c.projectId && c.title.toLowerCase().includes(search.toLowerCase())
  );

  async function assign(campaignId: string) {
    setAssigning(campaignId);
    const res = await fetch(`/api/projects/${project.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignCampaignId: campaignId }),
    });
    if (!res.ok) {
      setAssigning(null);
      return;
    }
    broadcastProjectsUpdated();
    onAssigned();
    setAssigning(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="w-full max-w-md rounded-3xl p-5 shadow-2xl" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-4">
          <p className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>Add campaign → {project.title}</p>
          <button type="button" onClick={onClose}><X className="w-4 h-4 opacity-50" /></button>
        </div>
        <input autoFocus
          className="w-full rounded-xl border px-3 py-2 text-sm mb-3"
          style={{ borderColor: 'var(--border)', background: 'var(--input-background)', color: 'var(--foreground)' }}
          placeholder="Search campaigns…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {unassigned.length === 0 && (
          <p className="text-xs text-center py-4" style={{ color: 'var(--muted-foreground)' }}>
            {search ? 'No matching unassigned campaigns' : 'All campaigns already assigned'}
          </p>
        )}
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {unassigned.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-xl px-3 py-2" style={{ background: 'var(--muted)' }}>
              <p className="text-sm truncate flex-1" style={{ color: 'var(--foreground)' }}>{c.title}</p>
              <button type="button" onClick={() => void assign(c.id)} disabled={assigning === c.id}
                className="ml-3 rounded-lg px-2.5 py-1 text-[11px] font-semibold flex-shrink-0 transition-opacity hover:opacity-80"
                style={{ background: scheme.bg, color: scheme.text }}>
                {assigning === c.id ? '…' : 'Add'}
              </button>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <a href="/dispatch?new=1" className="flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-70"
            style={{ color: 'var(--muted-foreground)' }}>
            <Plus className="w-3.5 h-3.5" /> Create new campaign in Dispatch
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── Project Bucket Card ──────────────────────────────────────────────────────

function ProjectCard({ project, onAddCampaign }: { project: Project; onAddCampaign: () => void }) {
  const scheme = COLOR_MAP[project.color as ProjectColor] ?? COLOR_MAP.lavender;
  const Icon = ICON_MAP[project.icon as ProjectIcon] ?? Folder;

  const totalTasks = project.campaigns.reduce((s, c) => s + c.tasks.length, 0);
  const runningTasks = project.campaigns.reduce((s, c) => s + c.tasks.filter((t) => t.status === 'RUNNING').length, 0);
  const failedTasks  = project.campaigns.reduce((s, c) => s + c.tasks.filter((t) => t.status === 'FAILED').length, 0);
  const doneTasks    = project.campaigns.reduce((s, c) => s + c.tasks.filter((t) => t.status === 'DONE').length, 0);
  const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const activeCampaigns = project.campaigns.filter((c) => c.status !== 'DONE' && c.status !== 'DRAFT');
  const preview = project.campaigns.slice(0, 3);

  return (
    <div className="rounded-3xl flex flex-col transition-all hover:scale-[1.01]"
      style={{ background: `linear-gradient(135deg, ${scheme.glow} 0%, var(--card) 55%)`, border: `1.5px solid ${scheme.border}`, boxShadow: `0 4px 24px ${scheme.glow}` }}>

      <div className="p-5 flex-1">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: scheme.bg, border: `1px solid ${scheme.border}` }}>
              <Icon className="w-5 h-5" style={{ color: scheme.text }} />
            </div>
            <div>
              <h3 className="font-semibold text-sm leading-tight" style={{ color: 'var(--foreground)' }}>{project.title}</h3>
              {project.description && (
                <p className="text-[11px] mt-0.5 leading-snug" style={{ color: 'var(--muted-foreground)' }}>{project.description}</p>
              )}
            </div>
          </div>
          <span className="text-2xl font-bold flex-shrink-0 ml-2 leading-none" style={{ color: scheme.text }}>
            {project.campaigns.length}
          </span>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3 mb-3 text-[11px] flex-wrap">
          <span style={{ color: 'var(--muted-foreground)' }}>{totalTasks} tasks</span>
          {runningTasks > 0 && <span style={{ color: '#00D9FF' }}>● {runningTasks} running</span>}
          {failedTasks > 0  && <span style={{ color: '#FF5C5C' }}>● {failedTasks} failed</span>}
          {activeCampaigns.length > 0 && <span style={{ color: scheme.text }}>● {activeCampaigns.length} active</span>}
        </div>

        {/* Progress bar */}
        {totalTasks > 0 && (
          <div className="mb-3">
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.08)' }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: scheme.text }} />
            </div>
            <p className="text-[10px] mt-1" style={{ color: 'var(--muted-foreground)' }}>{progress}% complete</p>
          </div>
        )}

        {/* Campaign preview */}
        {preview.length > 0 ? (
          <div className="space-y-1.5">
            {preview.map((c) => (
              <div key={c.id} className="flex items-center gap-2 rounded-xl px-2.5 py-1.5"
                style={{ background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.06)' }}>
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: CAMPAIGN_STATUS_DOT[c.status] ?? '#8A8FA8' }} />
                <p className="text-[11px] truncate flex-1" style={{ color: 'var(--foreground)' }}>{c.title}</p>
                <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--muted-foreground)' }}>{c.tasks.length}t</span>
              </div>
            ))}
            {project.campaigns.length > 3 && (
              <p className="text-[10px] pl-2" style={{ color: 'var(--muted-foreground)' }}>+{project.campaigns.length - 3} more</p>
            )}
          </div>
        ) : (
          <div className="rounded-xl border-2 border-dashed p-3 text-center" style={{ borderColor: scheme.border }}>
            <p className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>No campaigns yet</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 pb-4 flex items-center gap-2">
        <button type="button" onClick={onAddCampaign}
          className="flex-1 rounded-xl py-2 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-opacity hover:opacity-80"
          style={{ background: scheme.bg, color: scheme.text }}>
          <Plus className="w-3.5 h-3.5" /> Add campaign
        </button>
        <a href="/dispatch" className="rounded-xl p-2 transition-opacity hover:opacity-70" style={{ background: 'rgba(0,0,0,0.06)' }} title="Open Dispatch">
          <ExternalLink className="w-3.5 h-3.5" style={{ color: 'var(--muted-foreground)' }} />
        </a>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const { data: projects, isLoading, error, mutate } = useSWR<Project[]>('/api/projects', fetcher, { refreshInterval: 20_000 });
  const { data: allCampaignsRaw } = useSWR<{ id: string; title: string; projectId: string | null }[]>('/api/dispatch/campaigns', fetcher, { refreshInterval: 20_000 });

  const [showNew, setShowNew] = useState(false);
  const [assignTo, setAssignTo] = useState<Project | null>(null);

  const totalCampaigns = projects?.reduce((s, p) => s + p.campaigns.length, 0) ?? 0;
  const unassigned = (allCampaignsRaw ?? []).filter((c) => !c.projectId).length;

  useEffect(() => onProjectsUpdated(() => {
    void mutate();
  }), [mutate]);

  return (
    <>
      {showNew && <NewProjectModal onClose={() => setShowNew(false)} onCreated={() => void mutate()} />}
      {assignTo && (
        <AssignCampaignModal
          project={assignTo}
          allCampaigns={allCampaignsRaw ?? []}
          onClose={() => setAssignTo(null)}
          onAssigned={() => { void mutate(); setAssignTo(null); }}
        />
      )}

      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>Projects</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
              {projects?.length ?? 0} projects · {totalCampaigns} campaigns
              {unassigned > 0 && (
                <span className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                  style={{ background: 'rgba(255,184,0,0.15)', color: '#FFB800' }}>
                  {unassigned} unassigned
                </span>
              )}
            </p>
          </div>
          <button type="button" onClick={() => setShowNew(true)}
            className="flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition-opacity hover:opacity-80"
            style={{ background: 'var(--color-cyan)', color: '#0A0E1A' }}>
            <Plus className="w-4 h-4" /> New project
          </button>
        </div>

        {isLoading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1,2,3,4,5].map((i) => <div key={i} className="rounded-3xl h-64 animate-pulse" style={{ background: 'var(--muted)' }} />)}
          </div>
        )}

        {error && (
          <div className="rounded-2xl p-4 text-sm" style={{ background: 'rgba(255,92,92,0.1)', color: '#FF8080' }}>
            Failed to load projects: {error.message}
          </div>
        )}

        {!isLoading && !error && projects && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} onAddCampaign={() => setAssignTo(project)} />
            ))}
          </div>
        )}

        {unassigned > 0 && !isLoading && (
          <div className="rounded-2xl p-4 flex items-center gap-3"
            style={{ background: 'rgba(255,184,0,0.08)', border: '1px solid rgba(255,184,0,0.2)' }}>
            <Sparkles className="w-4 h-4 flex-shrink-0" style={{ color: '#FFB800' }} />
            <div className="flex-1">
              <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                {unassigned} campaign{unassigned !== 1 ? 's' : ''} not assigned to any project
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                Click &ldquo;Add campaign&rdquo; on any project card to organize them.
              </p>
            </div>
            <a href="/dispatch" className="flex-shrink-0 rounded-xl px-3 py-1.5 text-[11px] font-semibold transition-opacity hover:opacity-80"
              style={{ background: 'rgba(255,184,0,0.15)', color: '#FFB800' }}>
              View in Dispatch
            </a>
          </div>
        )}
      </div>
    </>
  );
}
