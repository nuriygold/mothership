'use client';

import { useState, useMemo, useCallback } from 'react';
import useSWR from 'swr';
import {
  ChevronDown,
  ChevronRight,
  Plus,
  ArrowUpDown,
  ExternalLink,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  Ban,
} from 'lucide-react';
import { Card, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

// ─── Types ───────────────────────────────────────────────────────────────────

type TaskStatus = 'PLANNED' | 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED' | 'CANCELED';
type CampaignStatus = 'DRAFT' | 'PLANNING' | 'READY' | 'EXECUTING' | 'DONE' | 'PAUSED' | 'FAILED';

interface DispatchTask {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: number;
  agentId: string | null;
  errorMessage: string | null;
  taskPoolIssueUrl: string | null;
  completedAt: string | null;
  startedAt: string | null;
  createdAt: string;
}

interface Campaign {
  id: string;
  title: string;
  description: string | null;
  status: CampaignStatus;
  approvedPlanName: string | null;
  visionItemId: string | null;
  createdAt: string;
  updatedAt: string;
  tasks: DispatchTask[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const BUCKET_ORDER: TaskStatus[] = ['RUNNING', 'FAILED', 'QUEUED', 'PLANNED', 'DONE', 'CANCELED'];

const BUCKET_META: Record<TaskStatus, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  RUNNING:  { label: 'Running',  icon: Loader2,       color: '#00D9FF', bg: 'rgba(0,217,255,0.08)' },
  FAILED:   { label: 'Failed',   icon: AlertCircle,   color: '#FF5C5C', bg: 'rgba(255,92,92,0.08)' },
  QUEUED:   { label: 'Queued',   icon: Clock,         color: '#FFB800', bg: 'rgba(255,184,0,0.08)'  },
  PLANNED:  { label: 'Planned',  icon: Clock,         color: '#8A8FA8', bg: 'rgba(138,143,168,0.08)'},
  DONE:     { label: 'Done',     icon: CheckCircle2,  color: '#4CAF83', bg: 'rgba(76,175,131,0.08)' },
  CANCELED: { label: 'Canceled', icon: Ban,           color: '#666',    bg: 'rgba(100,100,100,0.06)'},
};

const CAMPAIGN_STATUS_TONE: Record<CampaignStatus, string> = {
  DRAFT:     'bg-slate-100 text-slate-500',
  PLANNING:  'bg-amber-50 text-amber-600',
  READY:     'bg-blue-50 text-blue-600',
  EXECUTING: 'bg-cyan-50 text-cyan-700',
  DONE:      'bg-green-50 text-green-700',
  PAUSED:    'bg-orange-50 text-orange-600',
  FAILED:    'bg-red-50 text-red-600',
};

type SortKey = 'updatedAt' | 'createdAt' | 'title' | 'taskCount' | 'failed';

const SORT_OPTIONS: { label: string; value: SortKey }[] = [
  { label: 'Last updated',  value: 'updatedAt'  },
  { label: 'Created',       value: 'createdAt'  },
  { label: 'Name A→Z',      value: 'title'      },
  { label: 'Task count',    value: 'taskCount'  },
  { label: 'Most failed',   value: 'failed'     },
];

// ─── Fetcher ──────────────────────────────────────────────────────────────────

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message ?? 'Failed to load');
  return json;
};

// ─── Task card ────────────────────────────────────────────────────────────────

function TaskCard({ task, onRetry }: { task: DispatchTask; onRetry?: (id: string) => void }) {
  const meta = BUCKET_META[task.status];
  const Icon = meta.icon;

  return (
    <div
      className="rounded-lg px-2.5 py-2 text-xs"
      style={{ background: meta.bg, border: `1px solid ${meta.color}20` }}
    >
      <div className="flex items-start gap-1.5">
        <Icon
          className="mt-0.5 flex-shrink-0 w-3 h-3"
          style={{
            color: meta.color,
            animation: task.status === 'RUNNING' ? 'spin 1.5s linear infinite' : undefined,
          }}
        />
        <p className="flex-1 leading-snug font-medium" style={{ color: 'var(--foreground)' }}>
          {task.title}
        </p>
        {task.taskPoolIssueUrl && (
          <a
            href={task.taskPoolIssueUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex-shrink-0"
          >
            <ExternalLink className="w-3 h-3 opacity-40 hover:opacity-80" />
          </a>
        )}
      </div>

      {task.errorMessage && (
        <p className="mt-1 text-[10px] leading-snug opacity-70 pl-4.5" style={{ color: '#FF8080' }}>
          {task.errorMessage}
        </p>
      )}

      {task.status === 'FAILED' && onRetry && (
        <button
          type="button"
          onClick={() => onRetry(task.id)}
          className="mt-1.5 ml-4.5 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold transition-opacity hover:opacity-80"
          style={{ background: 'rgba(255,92,92,0.15)', color: '#FF8080' }}
        >
          <RotateCcw className="w-2.5 h-2.5" />
          Retry
        </button>
      )}
    </div>
  );
}

// ─── Bucket column ────────────────────────────────────────────────────────────

function BucketColumn({
  status,
  tasks,
  onRetry,
}: {
  status: TaskStatus;
  tasks: DispatchTask[];
  onRetry?: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const meta = BUCKET_META[status];
  const Icon = meta.icon;

  if (tasks.length === 0) return null;

  return (
    <div className="min-w-[180px] flex-1">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center gap-1.5 mb-2 group"
      >
        <Icon className="w-3 h-3 flex-shrink-0" style={{ color: meta.color }} />
        <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: meta.color }}>
          {meta.label}
        </span>
        <span
          className="ml-1 rounded-full px-1.5 py-0 text-[10px] font-semibold"
          style={{ background: meta.bg, color: meta.color }}
        >
          {tasks.length}
        </span>
        {collapsed
          ? <ChevronRight className="w-3 h-3 ml-auto opacity-40" />
          : <ChevronDown className="w-3 h-3 ml-auto opacity-40" />
        }
      </button>

      {!collapsed && (
        <div className="space-y-1.5">
          {tasks.map((t) => (
            <TaskCard key={t.id} task={t} onRetry={onRetry} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Project row ──────────────────────────────────────────────────────────────

function ProjectRow({
  campaign,
  onRetry,
  defaultExpanded,
}: {
  campaign: Campaign;
  onRetry: (campaignId: string, taskId: string) => void;
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const tasksByBucket = useMemo(() => {
    const map = new Map<TaskStatus, DispatchTask[]>();
    for (const status of BUCKET_ORDER) map.set(status, []);
    for (const task of campaign.tasks) {
      map.get(task.status)?.push(task);
    }
    return map;
  }, [campaign.tasks]);

  const activeBuckets = BUCKET_ORDER.filter((s) => (tasksByBucket.get(s)?.length ?? 0) > 0);
  const failedCount = tasksByBucket.get('FAILED')?.length ?? 0;
  const runningCount = tasksByBucket.get('RUNNING')?.length ?? 0;
  const doneCount = tasksByBucket.get('DONE')?.length ?? 0;
  const total = campaign.tasks.length;

  const progress = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  return (
    <Card>
      {/* Project header */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-start gap-3 text-left"
      >
        <div className="flex-shrink-0 mt-0.5 text-slate-400">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>{campaign.title}</CardTitle>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${CAMPAIGN_STATUS_TONE[campaign.status]}`}>
              {campaign.status}
            </span>
            {campaign.approvedPlanName && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-indigo-50 text-indigo-600">
                {campaign.approvedPlanName}
              </span>
            )}
            {campaign.visionItemId && (
              <a
                href="/vision"
                onClick={(e) => e.stopPropagation()}
                className="rounded-full px-2 py-0.5 text-[10px] font-medium transition-opacity hover:opacity-80"
                style={{ background: '#E4E0FF', color: '#4A3DAA' }}
              >
                Vision ↗
              </a>
            )}
          </div>

          {campaign.description && (
            <p className="mt-0.5 text-xs text-slate-500 truncate">{campaign.description}</p>
          )}

          {/* Mini stats row */}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
            <span>{total} tasks</span>
            {runningCount > 0 && <span style={{ color: '#00D9FF' }}>{runningCount} running</span>}
            {failedCount > 0 && <span style={{ color: '#FF5C5C' }}>{failedCount} failed</span>}
            {total > 0 && (
              <span style={{ color: '#4CAF83' }}>{progress}% done</span>
            )}
          </div>

          {/* Progress bar */}
          {total > 0 && (
            <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ background: 'var(--muted)' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${progress}%`, background: '#4CAF83' }}
              />
            </div>
          )}
        </div>

        <a
          href={`/dispatch?campaign=${campaign.id}`}
          onClick={(e) => e.stopPropagation()}
          className="flex-shrink-0 flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 transition-colors mt-0.5"
        >
          Open <ExternalLink className="w-3 h-3" />
        </a>
      </button>

      {/* Bucket columns */}
      {expanded && activeBuckets.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-4 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
          {activeBuckets.map((status) => (
            <BucketColumn
              key={status}
              status={status}
              tasks={tasksByBucket.get(status) ?? []}
              onRetry={(taskId) => onRetry(campaign.id, taskId)}
            />
          ))}
        </div>
      )}

      {expanded && activeBuckets.length === 0 && (
        <p className="mt-4 text-xs text-slate-400 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
          No tasks yet. Go to Dispatch to add tasks to this project.
        </p>
      )}
    </Card>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const { data: campaigns, isLoading, error, mutate } = useSWR<Campaign[]>(
    '/api/dispatch/campaigns',
    fetcher,
    { refreshInterval: 15_000 }
  );

  const [sortKey, setSortKey] = useState<SortKey>('updatedAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | 'ALL'>('ALL');
  const [showSortMenu, setShowSortMenu] = useState(false);

  const sorted = useMemo(() => {
    if (!campaigns) return [];
    let list = statusFilter === 'ALL' ? campaigns : campaigns.filter((c) => c.status === statusFilter);

    list = [...list].sort((a, b) => {
      let val = 0;
      if (sortKey === 'title') {
        val = a.title.localeCompare(b.title);
      } else if (sortKey === 'taskCount') {
        val = a.tasks.length - b.tasks.length;
      } else if (sortKey === 'failed') {
        val = a.tasks.filter((t) => t.status === 'FAILED').length - b.tasks.filter((t) => t.status === 'FAILED').length;
      } else {
        val = new Date(a[sortKey]).getTime() - new Date(b[sortKey]).getTime();
      }
      return sortDir === 'desc' ? -val : val;
    });

    return list;
  }, [campaigns, sortKey, sortDir, statusFilter]);

  const handleSort = useCallback((key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
    setShowSortMenu(false);
  }, [sortKey]);

  const handleRetry = useCallback(async (campaignId: string, taskId: string) => {
    const res = await fetch(`/api/dispatch/campaigns/${campaignId}/tasks/${taskId}/retry`, { method: 'POST' });
    if (res.ok) mutate();
  }, [mutate]);

  const allStatuses: CampaignStatus[] = ['DRAFT', 'PLANNING', 'READY', 'EXECUTING', 'PAUSED', 'DONE', 'FAILED'];
  const currentSortLabel = SORT_OPTIONS.find((o) => o.value === sortKey)?.label ?? 'Sort';

  const totalTasks = campaigns?.reduce((s, c) => s + c.tasks.length, 0) ?? 0;
  const failedTotal = campaigns?.reduce((s, c) => s + c.tasks.filter((t) => t.status === 'FAILED').length, 0) ?? 0;
  const runningTotal = campaigns?.reduce((s, c) => s + c.tasks.filter((t) => t.status === 'RUNNING').length, 0) ?? 0;
  const doneTotal = campaigns?.reduce((s, c) => s + c.tasks.filter((t) => t.status === 'DONE').length, 0) ?? 0;

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>Projects</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {campaigns?.length ?? 0} projects · {totalTasks} tasks
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Summary badges */}
          {runningTotal > 0 && (
            <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: 'rgba(0,217,255,0.1)', color: '#00D9FF' }}>
              {runningTotal} running
            </span>
          )}
          {failedTotal > 0 && (
            <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: 'rgba(255,92,92,0.1)', color: '#FF5C5C' }}>
              {failedTotal} failed
            </span>
          )}
          {doneTotal > 0 && (
            <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: 'rgba(76,175,131,0.1)', color: '#4CAF83' }}>
              {doneTotal} done
            </span>
          )}

          {/* Sort button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowSortMenu((s) => !s)}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-80"
              style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              {currentSortLabel}
              {sortDir === 'asc' ? ' ↑' : ' ↓'}
            </button>
            {showSortMenu && (
              <div
                className="absolute right-0 top-9 z-50 rounded-xl border p-1 shadow-lg w-44"
                style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
              >
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSort(opt.value)}
                    className="w-full rounded-lg px-3 py-1.5 text-left text-xs transition-colors hover:bg-slate-100"
                    style={{ fontWeight: opt.value === sortKey ? 600 : 400, color: 'var(--foreground)' }}
                  >
                    {opt.label} {opt.value === sortKey && (sortDir === 'asc' ? '↑' : '↓')}
                  </button>
                ))}
              </div>
            )}
          </div>

          <a href="/dispatch?new=1">
            <Button>
              <Plus className="w-3.5 h-3.5" /> New project
            </Button>
          </a>
        </div>
      </div>

      {/* Status filter strip */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
        <button
          type="button"
          onClick={() => setStatusFilter('ALL')}
          className={`rounded-full px-3 py-1 text-xs font-semibold flex-shrink-0 transition-colors ${
            statusFilter === 'ALL' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500'
          }`}
        >
          All ({campaigns?.length ?? 0})
        </button>
        {allStatuses.map((s) => {
          const count = campaigns?.filter((c) => c.status === s).length ?? 0;
          if (count === 0) return null;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`rounded-full px-3 py-1 text-xs font-semibold flex-shrink-0 transition-colors ${
                statusFilter === s ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500'
              }`}
            >
              {s[0] + s.slice(1).toLowerCase()} ({count})
            </button>
          );
        })}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-2xl" style={{ background: 'var(--muted)' }} />
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <Card>
          <p className="text-sm text-rose-400">Failed to load projects: {error.message}</p>
        </Card>
      )}

      {/* Empty */}
      {!isLoading && !error && sorted.length === 0 && (
        <Card>
          <p className="text-sm text-slate-500">
            {statusFilter !== 'ALL' ? 'No projects match this filter.' : 'No projects yet.'}
            {statusFilter === 'ALL' && (
              <> <a href="/dispatch?new=1" className="underline">Create your first project →</a></>
            )}
          </p>
        </Card>
      )}

      {/* Project list */}
      <div className="space-y-3">
        {sorted.map((campaign, i) => (
          <ProjectRow
            key={campaign.id}
            campaign={campaign}
            onRetry={handleRetry}
            defaultExpanded={i === 0}
          />
        ))}
      </div>
    </div>
  );
}
