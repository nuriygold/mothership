'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Send, Trash2, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardSubtitle, CardTitle } from '@/components/ui/card';
import { SlashCommandSheet } from '@/components/ui/slash-command-sheet';
import { REVENUE_STREAMS } from '@/lib/v2/revenue-streams';

const DISPATCH_COMMANDS = [
  { cmd: '/dispatch', args: '<title>', desc: 'Create a new dispatch campaign' },
  { cmd: '/add',      args: '<title>', desc: 'Add task to task pool' },
  { cmd: '/polo',     args: '<cmd>',   desc: 'Run a terminal command (restricted)' },
];

type CommandItem = {
  id: string;
  input: string;
  sourceChannel: string;
  status: string;
  run?: { type?: string } | null;
};

type DispatchTask = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: number;
  dependencies?: string[] | null;
  taskPoolIssueNumber?: number | null;
  taskPoolIssueUrl?: string | null;
  output?: string | null;
  reviewOutput?: string | null;
  errorMessage?: string | null;
  toolTurns?: number | null;
};

type DispatchPlan = {
  name: string;
  estimated_cost_cents?: number | null;
  estimated_duration_seconds?: number | null;
  tasks: Array<{
    key: string;
    title: string;
    description?: string | null;
    dependencies: string[];
  }>;
};

type DispatchCampaign = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  approvedPlanName?: string | null;
  latestPlan?: { plans?: DispatchPlan[] } | null;
  tasks: DispatchTask[];
  visionItemId?: string | null;
  projectId?: string | null;
  outputFolder?: string | null;
  assignedBotId?: string | null;
  revenueStream?: string | null;
  linkedTaskRef?: string | null;
};

async function fetchCommands(): Promise<CommandItem[]> {
  const res = await fetch('/api/commands');
  if (!res.ok) throw new Error('Failed to load commands');
  return res.json();
}

async function postCommand(payload: { input: string; sourceChannel: string; requestedById?: string | null }) {
  const res = await fetch('/api/commands', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { message?: string })?.message ?? 'Failed to post command');
  return body;
}

async function sendTelegram(payload: { text: string; botKey?: string }) {
  const res = await fetch('/api/telegram/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? 'Failed to send Telegram message');
  }
  return res.json();
}

async function dispatchOpenClaw(payload: { text: string; agentId?: string; sessionKey?: string }) {
  const res = await fetch('/api/openclaw/dispatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? 'Failed to dispatch to OpenClaw');
  }
  return res.json();
}

async function checkGateway() {
  const res = await fetch('/api/openclaw/health');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.reason ?? 'Gateway unreachable');
  }
  return res.json();
}

async function fetchDispatchCampaigns(): Promise<DispatchCampaign[]> {
  const res = await fetch('/api/dispatch/campaigns', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load dispatch campaigns');
  return res.json();
}

async function deleteDispatchCampaign(payload: { campaignId: string; reason: string }) {
  const res = await fetch(`/api/dispatch/campaigns/${payload.campaignId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: payload.reason }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { message?: string })?.message ?? 'Failed to delete campaign');
  return body;
}

async function trophyDispatchCampaign(payload: { campaignId: string }) {
  const res = await fetch(`/api/dispatch/campaigns/${payload.campaignId}/trophy`, {
    method: 'POST',
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { message?: string })?.message ?? 'Failed to trophy campaign');
  return body;
}

async function createDispatchCampaign(payload: {
  title: string;
  description?: string;
  projectId?: string;
  visionItemId?: string;
  outputFolder?: string;
  assignedBotId?: string;
  revenueStream?: string;
  linkedTaskRef?: string;
}) {
  const res = await fetch('/api/dispatch/campaigns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.message ?? 'Failed to create campaign');
  return body;
}

async function sendCampaignToBot(payload: { campaignId: string; botId: string; note?: string }) {
  const res = await fetch(`/api/dispatch/campaigns/${payload.campaignId}/send-to-bot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ botId: payload.botId, note: payload.note }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.message ?? 'Failed to send to bot');
  return body;
}

async function fetchProjects() {
  const res = await fetch('/api/projects', { cache: 'no-store' });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data as { id: string; title: string; color: string }[] : [];
}

async function fetchVisionPillars() {
  const res = await fetch('/api/v2/vision/pillars', { cache: 'no-store' });
  if (!res.ok) return [];
  const data = await res.json();
  return (data?.pillars ?? []) as { id: string; label: string; emoji?: string; items: { id: string; title: string }[] }[];
}

async function fetchOutputFolders() {
  const res = await fetch('/api/dispatch/output-folders', { cache: 'no-store' });
  if (!res.ok) return [];
  const data = await res.json();
  return (data?.folders ?? []) as string[];
}

async function createDispatchTask(payload: {
  campaignId: string;
  title: string;
  description?: string;
  priority?: number;
  dueDate?: string;
  assignee?: string;
}) {
  const res = await fetch(`/api/dispatch/campaigns/${payload.campaignId}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.message ?? 'Failed to create task');
  return body;
}

async function generateDispatchPlan(campaignId: string) {
  const res = await fetch(`/api/dispatch/campaigns/${campaignId}/plan`, {
    method: 'POST',
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.message ?? 'Failed to generate plan');
  return body;
}

async function approveDispatchPlan(payload: { campaignId: string; planName: string }) {
  const res = await fetch(`/api/dispatch/campaigns/${payload.campaignId}/plan/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ planName: payload.planName }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.message ?? 'Failed to approve plan');
  return body;
}

async function updateDispatchCampaignState(payload: { campaignId: string; action: 'pause' | 'resume' }) {
  const res = await fetch(`/api/dispatch/campaigns/${payload.campaignId}/${payload.action}`, {
    method: 'POST',
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.message ?? `Failed to ${payload.action} campaign`);
  return body;
}

async function fetchDispatchProgress(campaignId: string) {
  const res = await fetch(`/api/dispatch/campaigns/${campaignId}/progress`, { cache: 'no-store' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.message ?? 'Failed to load progress');
  return body;
}

async function runDispatchCampaign(payload: {
  campaignId: string;
  mode: 'now' | 'queue' | 'schedule';
  scheduledAt?: string;
}) {
  const res = await fetch(`/api/dispatch/campaigns/${payload.campaignId}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: payload.mode, scheduledAt: payload.scheduledAt }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.message ?? `Failed to ${payload.mode} campaign`);
  return body;
}

async function fetchBotRecommendation(campaignId: string) {
  const res = await fetch(`/api/dispatch/campaigns/${campaignId}/recommend`, { cache: 'no-store' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.message ?? 'Failed to get recommendation');
  return body as { recommended: string; botName: string; breakdown: Record<string, number>; taskCount: number };
}

async function retryDispatchTask(payload: { campaignId: string; taskId: string; agentId?: string }) {
  const res = await fetch(`/api/dispatch/campaigns/${payload.campaignId}/tasks/${payload.taskId}/retry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId: payload.agentId }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.message ?? 'Failed to retry task');
  return body;
}

async function requestTaskReview(payload: { campaignId: string; taskId: string }) {
  const res = await fetch(`/api/dispatch/campaigns/${payload.campaignId}/tasks/${payload.taskId}/review`, {
    method: 'POST',
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.message ?? 'Failed to start review');
  return body;
}

async function replanDispatchTask(payload: { campaignId: string; taskId: string }) {
  const res = await fetch(`/api/dispatch/campaigns/${payload.campaignId}/tasks/${payload.taskId}/replan`, {
    method: 'POST',
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.message ?? 'Failed to re-plan task');
  return body;
}

function statusTone(status: string) {
  if (status === 'EXECUTING' || status === 'DONE' || status === 'COMPLETED') return 'bg-emerald-900/40 text-emerald-200';
  if (status === 'PAUSED' || status === 'FAILED') return 'bg-rose-900/40 text-rose-200';
  if (status === 'READY' || status === 'RUNNING') return 'bg-sky-900/40 text-sky-200';
  if (status === 'QUEUED') return 'bg-amber-900/40 text-amber-200';
  if (status === 'SCHEDULED') return 'bg-purple-900/40 text-purple-200';
  return 'bg-slate-800 text-slate-200';
}

function gatewayGuidance(errorMessage?: string) {
  if (!errorMessage) return null;
  const normalized = errorMessage.toLowerCase();

  if (normalized.includes('404') && normalized.includes('/v1/responses')) {
    return {
      title: 'Gateway is reachable, but the responses route is missing',
      steps: [
        'Set OPENCLAW_INFERENCE_GATEWAY to the inference service URL (not the health-only gateway).',
        'Confirm the configured endpoint exposes POST /v1/responses.',
        'Re-run "Check gateway" and then retry dispatch.',
      ],
    };
  }

  if (normalized.includes('gateway unreachable') || normalized.includes('timed out')) {
    return {
      title: 'Gateway cannot be reached from Mothership',
      steps: [
        'Check OPENCLAW_GATEWAY and OPENCLAW_API_TOKEN environment values.',
        'Verify the gateway /health endpoint is up from the same network.',
        'Retry once connectivity is restored.',
      ],
    };
  }

  return null;
}

type DispatchTaskRoute = 'dispatch' | 'ruby' | 'iceman' | 'finance';

type DispatchRouteDecision = {
  route: DispatchTaskRoute;
  reason: string;
};

function evaluateDispatchRoute(task?: string | null, source?: string | null): DispatchRouteDecision {
  const title = (task ?? '').trim().toLowerCase();
  const origin = (source ?? '').trim().toLowerCase();
  const haystack = `${title} ${origin}`.trim();

  if (!title) {
    return { route: 'dispatch', reason: 'No task provided to route.' };
  }

  if (haystack.match(/finance|financial|budget|cash.?flow|debt|credit|expense|invoice|bill|payable|subscription|net.?worth|liquidity|merchant|income/)) {
    return { route: 'finance', reason: 'Finance-heavy scope detected (money, bills, budget, or cash flow).' };
  }

  if (haystack.match(/campaign|dispatch|orchestrat|coordinate|roadmap|dependencies|multi.?step|backlog|execution plan|task pool/)) {
    return { route: 'dispatch', reason: 'Multi-step orchestration scope fits Dispatch campaign handling.' };
  }

  if (haystack.match(/code|debug|bug|fix|refactor|implement|terminal|cli|shell|script|build|deploy|compile|test suite|stack trace|repo|pull request|pr /)) {
    return { route: 'iceman', reason: 'Engineering execution scope detected (coding/debug/build work).' };
  }

  if (haystack.match(/email|reply|message|draft|copy|outreach|social|relationship|schedule|meeting|calendar|research|summarize|notes/)) {
    return { route: 'ruby', reason: 'Communication/research scope fits Ruby.' };
  }

  return { route: 'dispatch', reason: 'No specialized scope hit; keep task in Dispatch.' };
}

function DispatchPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['commands'], queryFn: fetchCommands });
  const gateway = useQuery({ queryKey: ['gateway'], queryFn: checkGateway, staleTime: 15_000 });
  const dispatchCampaignsQuery = useQuery({
    queryKey: ['dispatch-campaigns'],
    queryFn: fetchDispatchCampaigns,
    refetchInterval: (data) => {
      const hasPlanning = (data as DispatchCampaign[] | undefined)?.some((c) => c.status === 'PLANNING');
      return hasPlanning ? 3_000 : 15_000;
    },
  });
  const projectsQuery = useQuery({ queryKey: ['projects'], queryFn: fetchProjects, staleTime: 60_000 });
  const visionPillarsQuery = useQuery({ queryKey: ['vision-pillars'], queryFn: fetchVisionPillars, staleTime: 60_000 });
  const outputFoldersQuery = useQuery({ queryKey: ['output-folders'], queryFn: fetchOutputFolders, staleTime: 30_000 });

  const [input, setInput] = useState('');
  const [source, setSource] = useState('web');
  const [telegramMessage, setTelegramMessage] = useState('');
  const [telegramBot, setTelegramBot] = useState('bot2');
  const [ocText, setOcText] = useState('');
  const [ocAgent, setOcAgent] = useState('main');
  const [ocSession, setOcSession] = useState('');
  const [ocResult, setOcResult] = useState<string | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [campaignTitle, setCampaignTitle] = useState('');
  const [campaignDescription, setCampaignDescription] = useState('');
  const [showCampaignExtras, setShowCampaignExtras] = useState(false);
  const [campaignProjectId, setCampaignProjectId] = useState('');
  const [campaignVisionItemId, setCampaignVisionItemId] = useState('');
  const [campaignOutputFolder, setCampaignOutputFolder] = useState('');
  const [campaignAssignedBotId, setCampaignAssignedBotId] = useState('');
  const [campaignRevenueStream, setCampaignRevenueStream] = useState('');
  const [campaignLinkedTaskRef, setCampaignLinkedTaskRef] = useState('');
  const [sendToBotTarget, setSendToBotTarget] = useState<string | null>(null);
  const [sendToBotBotId, setSendToBotBotId] = useState('adrian');
  const [sendToBotNote, setSendToBotNote] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskPriority, setTaskPriority] = useState('3');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskAssignee, setTaskAssignee] = useState('');
  const [scheduleAt, setScheduleAt] = useState('');
  const [retryAgents, setRetryAgents] = useState<Record<string, string>>({});
  const [showNewCampaignForm, setShowNewCampaignForm] = useState(false);
  const [showManualTaskEntry, setShowManualTaskEntry] = useState(false);
  const [keepInDispatch, setKeepInDispatch] = useState(false);
  const campaignSectionRef = useRef<HTMLDivElement>(null);
  const incomingTask = searchParams?.get('task') ?? '';
  const incomingSource = searchParams?.get('source') ?? '';
  const routeDecision = useMemo(
    () => evaluateDispatchRoute(incomingTask, incomingSource),
    [incomingSource, incomingTask]
  );
  const shouldShowRoutingCard = Boolean(incomingTask) && routeDecision.route !== 'dispatch' && !keepInDispatch;

  useEffect(() => {
    setKeepInDispatch(false);
  }, [incomingSource, incomingTask]);

  // Pre-fill campaign from query params (e.g. dispatched from Today page)
  useEffect(() => {
    const task = searchParams?.get('task');
    const taskSource = searchParams?.get('source');
    if (!task || (!keepInDispatch && routeDecision.route !== 'dispatch')) {
      return;
    }
    if (task) {
      setCampaignTitle(task);
      if (taskSource) setCampaignDescription(`Task from: ${taskSource}`);
      setShowNewCampaignForm(true);
      setTimeout(() => {
        campaignSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    }
  }, [keepInDispatch, routeDecision.route, searchParams]);

  function handleRouteLaunch(route: Exclude<DispatchTaskRoute, 'dispatch'>) {
    if (route === 'ruby') {
      const params = new URLSearchParams();
      if (incomingTask) params.set('q', incomingTask);
      if (incomingSource) params.set('source', incomingSource);
      const query = params.toString();
      router.push(query ? `/ruby?${query}` : '/ruby');
      return;
    }

    if (route === 'finance') {
      const params = new URLSearchParams();
      if (incomingTask) params.set('task', incomingTask);
      if (incomingSource) params.set('source', incomingSource);
      const query = params.toString();
      router.push(query ? `/finance?${query}` : '/finance');
      return;
    }

    const params = new URLSearchParams();
    if (incomingTask) params.set('task', incomingTask);
    if (incomingSource) params.set('source', incomingSource);
    const query = params.toString();
    router.push((query ? `/iceman?${query}` : '/iceman') as any);
  }

  useEffect(() => {
    if (!selectedCampaignId && dispatchCampaignsQuery.data?.[0]?.id) {
      setSelectedCampaignId(dispatchCampaignsQuery.data[0].id);
    }
  }, [dispatchCampaignsQuery.data, selectedCampaignId]);

  const selectedCampaign = dispatchCampaignsQuery.data?.find((campaign) => campaign.id === selectedCampaignId);

  const progressQuery = useQuery({
    queryKey: ['dispatch-progress', selectedCampaignId],
    queryFn: () => fetchDispatchProgress(selectedCampaignId),
    enabled: Boolean(selectedCampaignId),
    refetchInterval: 15_000,
  });

  const mutation = useMutation({
    mutationFn: postCommand,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['commands'] });
      setInput('');
    },
  });

  const telegramMutation = useMutation({
    mutationFn: sendTelegram,
    onSuccess: () => setTelegramMessage(''),
  });

  const openClawMutation = useMutation({
    mutationFn: dispatchOpenClaw,
    onSuccess: (payload) => setOcResult(payload?.result?.output ?? 'Dispatched.'),
  });

  const gatewayMutation = useMutation({
    mutationFn: checkGateway,
  });
  const gatewayErrorText = (
    (gatewayMutation.error as Error | null)?.message
    ?? (gateway.error as Error | null)?.message
    ?? ''
  );
  const openClawErrorText = (openClawMutation.error as Error | null)?.message ?? '';
  const gatewayHelp = gatewayGuidance(openClawErrorText || gatewayErrorText);

  const createCampaignMutation = useMutation({
    mutationFn: createDispatchCampaign,
    onSuccess: async (payload) => {
      await qc.invalidateQueries({ queryKey: ['dispatch-campaigns'] });
      setCampaignTitle('');
      setCampaignDescription('');
      setCampaignProjectId('');
      setCampaignVisionItemId('');
      setCampaignOutputFolder('');
      setCampaignAssignedBotId('');
      setCampaignRevenueStream('');
      setCampaignLinkedTaskRef('');
      setShowCampaignExtras(false);
      if (payload?.campaign?.id) {
        setSelectedCampaignId(payload.campaign.id);
      }
    },
  });

  const deleteCampaignMutation = useMutation({
    mutationFn: deleteDispatchCampaign,
    onSuccess: async (_, vars) => {
      await qc.invalidateQueries({ queryKey: ['dispatch-campaigns'] });
      if (selectedCampaignId === vars.campaignId) setSelectedCampaignId('');
    },
  });

  const trophyCampaignMutation = useMutation({
    mutationFn: trophyDispatchCampaign,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['dispatch-campaigns'] });
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: createDispatchTask,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['dispatch-campaigns'] });
      await qc.invalidateQueries({ queryKey: ['dispatch-progress', selectedCampaignId] });
      setTaskTitle('');
      setTaskDescription('');
      setTaskPriority('3');
      setTaskDueDate('');
      setTaskAssignee('');
    },
  });

  const planMutation = useMutation({
    mutationFn: generateDispatchPlan,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['dispatch-campaigns'] });
      await qc.invalidateQueries({ queryKey: ['dispatch-progress', selectedCampaignId] });
    },
    onError: async () => {
      // Plan may have landed in DB even if the request timed out client-side — refetch to check.
      await qc.invalidateQueries({ queryKey: ['dispatch-campaigns'] });
    },
  });

  const approvePlanMutation = useMutation({
    mutationFn: approveDispatchPlan,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['dispatch-campaigns'] });
      await qc.invalidateQueries({ queryKey: ['dispatch-progress', selectedCampaignId] });
    },
  });

  const statusMutation = useMutation({
    mutationFn: updateDispatchCampaignState,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['dispatch-campaigns'] });
    },
  });

  const runMutation = useMutation({
    mutationFn: runDispatchCampaign,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['dispatch-campaigns'] });
      await qc.invalidateQueries({ queryKey: ['dispatch-progress', selectedCampaignId] });
    },
  });

  const recommendQuery = useQuery({
    queryKey: ['dispatch-recommend', selectedCampaignId],
    queryFn: () => fetchBotRecommendation(selectedCampaignId),
    enabled: Boolean(selectedCampaignId),
    staleTime: 60_000,
  });

  const retryTaskMutation = useMutation({
    mutationFn: retryDispatchTask,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['dispatch-campaigns'] });
      await qc.invalidateQueries({ queryKey: ['dispatch-progress', selectedCampaignId] });
    },
  });

  const reviewTaskMutation = useMutation({
    mutationFn: requestTaskReview,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['dispatch-campaigns'] });
    },
  });

  const replanTaskMutation = useMutation({
    mutationFn: replanDispatchTask,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['dispatch-campaigns'] });
      await qc.invalidateQueries({ queryKey: ['dispatch-progress', selectedCampaignId] });
    },
  });

  const sendToBotMutation = useMutation({
    mutationFn: sendCampaignToBot,
    onSuccess: () => {
      setSendToBotTarget(null);
      setSendToBotNote('');
    },
  });

  const availablePlans = selectedCampaign?.latestPlan?.plans ?? [];

  // Phase 4: step derived from campaign state
  const currentStep = selectedCampaign
    ? (['DONE', 'COMPLETED'].includes(selectedCampaign.status)
        ? 'done'
        : ['EXECUTING', 'RUNNING'].includes(selectedCampaign.status)
        ? 'running'
        : selectedCampaign.approvedPlanName
        ? 'execute'
        : availablePlans.length > 0
        ? 'approve'
        : 'plan')
    : null;

  const STEPS = ['plan', 'approve', 'execute', 'running', 'done'] as const;
  const STEP_LABELS: Record<string, string> = {
    plan: 'Generate plan', approve: 'Approve', execute: 'Execute', running: 'Running', done: 'Done',
  };

  // Phase 5: failed tasks float to top
  const TASK_STATUS_ORDER: Record<string, number> = {
    FAILED: 0, PAUSED: 1, EXECUTING: 2, RUNNING: 3, READY: 4, QUEUED: 5, DONE: 6, COMPLETED: 7,
  };
  const sortedTasks = selectedCampaign
    ? [...selectedCampaign.tasks].sort(
        (a, b) => (TASK_STATUS_ORDER[a.status] ?? 5) - (TASK_STATUS_ORDER[b.status] ?? 5)
      )
    : [];

  // Phase 2: status lane counts
  const campaigns = dispatchCampaignsQuery.data ?? [];
  const laneCounts = {
    planning: campaigns.filter((c) => !['EXECUTING', 'RUNNING', 'DONE', 'COMPLETED', 'FAILED'].includes(c.status)).length,
    running: campaigns.filter((c) => ['EXECUTING', 'RUNNING'].includes(c.status)).length,
    done: campaigns.filter((c) => ['DONE', 'COMPLETED'].includes(c.status)).length,
    failed: campaigns.filter((c) => c.status === 'FAILED').length,
  };

  return (
    <div className="space-y-4">
      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--foreground)' }}>Dispatch</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--foreground)', opacity: 0.45 }}>
            Orchestrate campaigns via Dispatch-Bot.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SlashCommandSheet commands={DISPATCH_COMMANDS} label="dispatch" />
          <button
            onClick={() => setShowNewCampaignForm((v) => !v)}
            className="rounded-full px-4 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80"
            style={{ background: 'var(--color-cyan)', color: '#0A0E1A' }}
          >
            {showNewCampaignForm ? 'Cancel' : '+ New campaign'}
          </button>
        </div>
      </div>

      {/* ── New campaign form (Phase 1 — collapsed behind button) ── */}
      {shouldShowRoutingCard && (
        <Card>
          <CardTitle>Scope routing</CardTitle>
          <CardSubtitle className="mt-1">
            Recommended route: <span className="font-semibold">{routeDecision.route.toUpperCase()}</span>
          </CardSubtitle>
          <p className="mt-2 text-xs" style={{ color: 'var(--foreground)', opacity: 0.55 }}>
            {routeDecision.reason}
          </p>
          <p className="mt-1 text-xs" style={{ color: 'var(--foreground)', opacity: 0.45 }}>
            Dispatch will not auto-launch Iceman. Use the route button to hand off manually.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              onClick={() => handleRouteLaunch(routeDecision.route as Exclude<DispatchTaskRoute, 'dispatch'>)}
              style={{ textTransform: 'capitalize' }}
            >
              Route to {routeDecision.route}
            </Button>
            <Button variant="outline" onClick={() => setKeepInDispatch(true)}>
              Keep in Dispatch
            </Button>
          </div>
        </Card>
      )}

      {showNewCampaignForm && (
        <Card>
          <div ref={campaignSectionRef}>
            <CardTitle>New campaign</CardTitle>
            <div className="mt-3 space-y-3">
              <input
                autoFocus
                className="w-full rounded-md border border-border bg-[var(--input-background)] px-3 py-2 text-sm text-slate-900"
                placeholder="Campaign title *"
                value={campaignTitle}
                onChange={(e) => setCampaignTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && campaignTitle && !campaignOutputFolder) {
                    createCampaignMutation.mutate({ title: campaignTitle, description: campaignDescription || undefined, projectId: campaignProjectId || undefined, visionItemId: campaignVisionItemId || undefined, outputFolder: campaignOutputFolder || undefined, assignedBotId: campaignAssignedBotId || undefined, revenueStream: campaignRevenueStream || undefined, linkedTaskRef: campaignLinkedTaskRef || undefined });
                  }
                }}
              />
              <textarea
                className="w-full rounded-md border border-border bg-[var(--input-background)] px-3 py-2 text-sm text-slate-900"
                rows={3}
                placeholder="Objective + resources: Figma links, repo URLs, docs, or any context the agent needs"
                value={campaignDescription}
                onChange={(e) => setCampaignDescription(e.target.value)}
              />

              {/* Optional settings toggle */}
              <button
                type="button"
                className="flex items-center gap-1.5 text-xs"
                style={{ color: 'var(--foreground)', opacity: 0.5 }}
                onClick={() => setShowCampaignExtras((v) => !v)}
              >
                <span>{showCampaignExtras ? '▲' : '▼'}</span>
                <span>Optional settings</span>
                {(campaignProjectId || campaignVisionItemId || campaignOutputFolder || campaignRevenueStream || campaignLinkedTaskRef) && (
                  <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold bg-sky-900/60 text-sky-300">
                    {[campaignProjectId, campaignVisionItemId, campaignOutputFolder, campaignRevenueStream, campaignLinkedTaskRef].filter(Boolean).length} set
                  </span>
                )}
              </button>

              {showCampaignExtras && (
                <div className="rounded-lg p-3 space-y-3" style={{ border: '1px solid var(--card-border)', background: 'var(--muted)' }}>
                  {/* Row 1: Output folder + Assigned bot */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium" style={{ color: 'var(--foreground)', opacity: 0.6 }}>
                        Output folder
                      </label>
                      <select
                        className="w-full rounded-md border border-border bg-[var(--input-background)] px-2 py-2 text-sm text-slate-900"
                        value={campaignOutputFolder}
                        onChange={(e) => {
                          setCampaignOutputFolder(e.target.value);
                          if (!e.target.value) setCampaignAssignedBotId('');
                        }}
                      >
                        <option value="">None</option>
                        {(outputFoldersQuery.data ?? []).map((f) => (
                          <option key={f} value={f}>{f.split('/').slice(-2).join('/')}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium" style={{ color: 'var(--foreground)', opacity: 0.6 }}>
                        Assigned bot{campaignOutputFolder ? ' *' : ''}
                      </label>
                      <select
                        className="w-full rounded-md border border-border bg-[var(--input-background)] px-2 py-2 text-sm text-slate-900"
                        value={campaignAssignedBotId}
                        onChange={(e) => setCampaignAssignedBotId(e.target.value)}
                        required={Boolean(campaignOutputFolder)}
                      >
                        <option value="">Auto-route</option>
                        <option value="adrian">Adrian · main</option>
                        <option value="ruby">Ruby · ruby</option>
                        <option value="emerald">Emerald · emerald</option>
                        <option value="adobe">Adobe Pettaway · adobe</option>
                        <option value="anchor">Anchor · anchor</option>
                      </select>
                    </div>
                  </div>

                  {/* Row 2: Revenue stream + Project */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium" style={{ color: 'var(--foreground)', opacity: 0.6 }}>Revenue stream</label>
                      <select
                        className="w-full rounded-md border border-border bg-[var(--input-background)] px-2 py-2 text-sm text-slate-900"
                        value={campaignRevenueStream}
                        onChange={(e) => setCampaignRevenueStream(e.target.value)}
                      >
                        <option value="">None</option>
                        {REVENUE_STREAMS.map((s) => (
                          <option key={s.key} value={s.key}>{s.displayName}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium" style={{ color: 'var(--foreground)', opacity: 0.6 }}>Project</label>
                      <select
                        className="w-full rounded-md border border-border bg-[var(--input-background)] px-2 py-2 text-sm text-slate-900"
                        value={campaignProjectId}
                        onChange={(e) => setCampaignProjectId(e.target.value)}
                      >
                        <option value="">None</option>
                        {(projectsQuery.data ?? []).map((p) => (
                          <option key={p.id} value={p.id}>{p.title}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Row 3: Vision item */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium" style={{ color: 'var(--foreground)', opacity: 0.6 }}>Vision board item</label>
                    <select
                      className="w-full rounded-md border border-border bg-[var(--input-background)] px-2 py-2 text-sm text-slate-900"
                      value={campaignVisionItemId}
                      onChange={(e) => setCampaignVisionItemId(e.target.value)}
                    >
                      <option value="">None</option>
                      {(visionPillarsQuery.data ?? []).map((pillar) =>
                        pillar.items.length > 0 ? (
                          <optgroup key={pillar.id} label={`${pillar.emoji ?? ''} ${pillar.label}`}>
                            {pillar.items.map((item) => (
                              <option key={item.id} value={item.id}>{item.title}</option>
                            ))}
                          </optgroup>
                        ) : null
                      )}
                    </select>
                  </div>

                  {/* Row 4: Linked task ref */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium" style={{ color: 'var(--foreground)', opacity: 0.6 }}>Linked task</label>
                    <input
                      className="w-full rounded-md border border-border bg-[var(--input-background)] px-3 py-2 text-sm text-slate-900"
                      placeholder="Task ID, title, or reference"
                      value={campaignLinkedTaskRef}
                      onChange={(e) => setCampaignLinkedTaskRef(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {campaignOutputFolder && !campaignAssignedBotId && (
                <p className="text-xs text-amber-400">An assigned bot is required when an output folder is set.</p>
              )}

              <div className="flex items-center gap-2">
                <Button
                  onClick={() =>
                    createCampaignMutation.mutate({
                      title: campaignTitle,
                      description: campaignDescription || undefined,
                      projectId: campaignProjectId || undefined,
                      visionItemId: campaignVisionItemId || undefined,
                      outputFolder: campaignOutputFolder || undefined,
                      assignedBotId: campaignAssignedBotId || undefined,
                      revenueStream: campaignRevenueStream || undefined,
                      linkedTaskRef: campaignLinkedTaskRef || undefined,
                    })
                  }
                  disabled={!campaignTitle || (Boolean(campaignOutputFolder) && !campaignAssignedBotId) || createCampaignMutation.isLoading}
                >
                  {createCampaignMutation.isLoading ? 'Creating...' : 'Create campaign'}
                </Button>
                <Button variant="outline" onClick={() => setShowNewCampaignForm(false)}>
                  Cancel
                </Button>
              </div>
              {createCampaignMutation.isError && (
                <p className="text-xs text-rose-400">{(createCampaignMutation.error as Error).message}</p>
              )}
              {createCampaignMutation.isSuccess && (
                <p className="text-xs text-emerald-400">Campaign created — select it below to plan and execute.</p>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* ── Phase 2: Status lane summary ── */}
      {campaigns.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Planning', count: laneCounts.planning, color: 'var(--color-sky)', textColor: 'var(--color-sky-text)' },
            { label: 'Running', count: laneCounts.running, color: 'var(--color-mint)', textColor: 'var(--color-mint-text)' },
            { label: 'Done', count: laneCounts.done, color: 'var(--color-cyan)', textColor: '#0A0E1A' },
            { label: 'Failed', count: laneCounts.failed, color: 'rgba(239,68,68,0.15)', textColor: '#fca5a5' },
          ].filter((l) => l.count > 0).map((lane) => (
            <div
              key={lane.label}
              className="rounded-full px-3 py-1 text-xs font-semibold"
              style={{ background: lane.color, color: lane.textColor }}
            >
              {lane.count} {lane.label}
            </div>
          ))}
        </div>
      )}

      {/* ── Phase 1 + 3: Campaign list ── */}
      {dispatchCampaignsQuery.isLoading && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-2xl animate-pulse" style={{ background: 'var(--muted)' }} />
          ))}
        </div>
      )}
      {!dispatchCampaignsQuery.isLoading && campaigns.length === 0 && (
        <div
          className="rounded-2xl flex flex-col items-center justify-center py-16 text-center"
          style={{ border: '2px dashed var(--card-border)' }}
        >
          <p className="text-sm font-medium" style={{ color: 'var(--foreground)', opacity: 0.5 }}>No campaigns yet</p>
          <p className="text-xs mt-1" style={{ color: 'var(--foreground)', opacity: 0.35 }}>
            Click &quot;+ New campaign&quot; to get started.
          </p>
        </div>
      )}
      {campaigns.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((campaign) => {
            const isSelected = selectedCampaignId === campaign.id;
            const failedCount = campaign.tasks.filter((t) => t.status === 'FAILED').length;
            const isDeleting = deleteCampaignMutation.isLoading && deleteCampaignMutation.variables?.campaignId === campaign.id;
            return (
              <div
                key={campaign.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedCampaignId(isSelected ? '' : campaign.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedCampaignId(isSelected ? '' : campaign.id);
                  }
                }}
                className="rounded-2xl p-4 text-left transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-1"
                style={{
                  background: isSelected ? 'var(--card)' : 'var(--muted)',
                  border: isSelected ? '2px solid var(--color-cyan)' : '1px solid var(--card-border)',
                  opacity: isDeleting ? 0.5 : 1,
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--foreground)' }}>
                    {campaign.title}
                  </p>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusTone(campaign.status)}`}>
                      {campaign.status}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        trophyCampaignMutation.mutate({ campaignId: campaign.id });
                      }}
                      disabled={trophyCampaignMutation.isLoading || campaign.status === 'COMPLETED'}
                      title={campaign.status === 'COMPLETED' ? 'Already in the Trophy Case' : 'Move to Trophy Case'}
                      aria-label="Move campaign to Trophy Case"
                      className="rounded-md p-1 transition-opacity hover:opacity-70 disabled:opacity-40"
                      style={{ background: 'transparent', color: '#b8902a' }}
                    >
                      <Trophy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSendToBotTarget(campaign.id);
                        setSendToBotBotId(campaign.assignedBotId ?? 'adrian');
                        setSendToBotNote('');
                      }}
                      title="Send campaign output to a bot"
                      aria-label="Send to bot"
                      className="rounded-md p-1 transition-opacity hover:opacity-70"
                      style={{ background: 'transparent', color: 'var(--foreground)', opacity: 0.5 }}
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const reason = window.prompt(
                          `Delete campaign "${campaign.title}"?\n\nWhy are you deleting it? (leave blank to skip)`,
                          '',
                        );
                        if (reason === null) return; // cancelled
                        deleteCampaignMutation.mutate({ campaignId: campaign.id, reason });
                      }}
                      disabled={isDeleting}
                      title="Delete campaign (logged to Activity)"
                      aria-label="Delete campaign"
                      className="rounded-md p-1 transition-opacity hover:opacity-70 disabled:opacity-40"
                      style={{ background: 'transparent', color: 'var(--foreground)', opacity: 0.5 }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {campaign.description && (
                  <p className="mt-1 text-xs line-clamp-1" style={{ color: 'var(--foreground)', opacity: 0.45 }}>
                    {campaign.description}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]" style={{ color: 'var(--foreground)', opacity: 0.4 }}>
                  <span>{campaign.tasks.length} task{campaign.tasks.length !== 1 ? 's' : ''}</span>
                  {campaign.approvedPlanName && <span>· Plan: {campaign.approvedPlanName}</span>}
                  {failedCount > 0 && (
                    <span className="text-rose-400 opacity-100">{failedCount} failed</span>
                  )}
                  {campaign.revenueStream && (
                    <span className="rounded-full px-1.5 py-0.5 opacity-100" style={{ background: 'rgba(0,217,255,0.1)', color: 'var(--color-cyan)' }}>
                      {REVENUE_STREAMS.find((s) => s.key === campaign.revenueStream)?.displayName ?? campaign.revenueStream}
                    </span>
                  )}
                  {campaign.visionItemId && (
                    <a
                      href="/vision"
                      onClick={(e) => e.stopPropagation()}
                      className="rounded-full px-1.5 py-0.5 font-medium hover:opacity-80 opacity-100"
                      style={{ background: '#E4E0FF', color: '#4A3DAA' }}
                    >
                      Vision ↗
                    </a>
                  )}
                  {campaign.outputFolder && (
                    <span className="rounded-full px-1.5 py-0.5 opacity-100" style={{ background: 'rgba(16,185,129,0.1)', color: '#6ee7b7' }}>
                      📁 {campaign.outputFolder.split('/').pop()}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Send to Bot modal ── */}
      {sendToBotTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setSendToBotTarget(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-5 space-y-4"
            style={{ background: 'var(--card)', border: '1px solid var(--card-border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Send campaign to bot</p>
            <div className="space-y-1">
              <label className="text-[11px]" style={{ color: 'var(--foreground)', opacity: 0.55 }}>Bot</label>
              <select
                className="w-full rounded-md border border-border bg-[var(--input-background)] px-2 py-2 text-sm text-slate-900"
                value={sendToBotBotId}
                onChange={(e) => setSendToBotBotId(e.target.value)}
              >
                <option value="adrian">Adrian · main</option>
                <option value="ruby">Ruby · ruby</option>
                <option value="emerald">Emerald · emerald</option>
                <option value="adobe">Adobe Pettaway · adobe</option>
                <option value="anchor">Anchor · anchor</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px]" style={{ color: 'var(--foreground)', opacity: 0.55 }}>Assignment note (optional)</label>
              <textarea
                className="w-full rounded-md border border-border bg-[var(--input-background)] px-3 py-2 text-sm text-slate-900"
                rows={3}
                placeholder="Instructions, context, or what to do with this output…"
                value={sendToBotNote}
                onChange={(e) => setSendToBotNote(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() =>
                  sendToBotMutation.mutate({ campaignId: sendToBotTarget, botId: sendToBotBotId, note: sendToBotNote || undefined })
                }
                disabled={sendToBotMutation.isLoading}
              >
                {sendToBotMutation.isLoading ? 'Sending…' : 'Send to bot'}
              </Button>
              <Button variant="outline" onClick={() => setSendToBotTarget(null)}>Cancel</Button>
            </div>
            {sendToBotMutation.isSuccess && (
              <p className="text-xs text-emerald-400">Dispatched to {sendToBotMutation.data?.botName ?? sendToBotBotId}.</p>
            )}
            {sendToBotMutation.isError && (
              <p className="text-xs text-rose-400">{(sendToBotMutation.error as Error).message}</p>
            )}
          </div>
        </div>
      )}

      {/* ── Phase 3: Campaign workspace ── */}
      {selectedCampaign && (
        <div className="space-y-3 border-t pt-4" style={{ borderColor: 'var(--card-border)' }}>

          {/* Workspace header + Phase 4 step indicator + progress */}
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-semibold" style={{ color: 'var(--foreground)' }}>
                    {selectedCampaign.title}
                  </h2>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusTone(selectedCampaign.status)}`}>
                    {selectedCampaign.status}
                  </span>
                </div>
                {selectedCampaign.description && (
                  <p className="mt-0.5 text-xs" style={{ color: 'var(--foreground)', opacity: 0.45 }}>
                    {selectedCampaign.description}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => planMutation.mutate(selectedCampaign.id)} disabled={planMutation.isLoading}>
                  {planMutation.isLoading ? 'Planning...' : 'Generate plan'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    statusMutation.mutate({
                      campaignId: selectedCampaign.id,
                      action: selectedCampaign.status === 'PAUSED' ? 'resume' : 'pause',
                    })
                  }
                  disabled={statusMutation.isLoading}
                >
                  {selectedCampaign.status === 'PAUSED' ? 'Resume' : 'Pause'}
                </Button>
                {selectedCampaign.tasks.some((t) => t.status === 'DONE') && (
                  <a
                    href={`/api/dispatch/campaigns/${selectedCampaign.id}/download`}
                    download
                    className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-70"
                    style={{ border: '1px solid var(--card-border)', color: 'var(--foreground)', opacity: 0.65 }}
                  >
                    <Download className="w-3 h-3" /> Download
                  </a>
                )}
              </div>
            </div>
            {planMutation.isError && (
              <p className="mt-2 text-xs text-rose-400">{(planMutation.error as Error).message}</p>
            )}

            {/* Phase 4: Step indicator */}
            <div className="mt-4 flex items-center gap-1 overflow-x-auto pb-1">
              {STEPS.map((step, i) => {
                const stepIdx = STEPS.indexOf(currentStep as typeof STEPS[number]);
                const isDone = i < stepIdx;
                const isCurrent = step === currentStep;
                return (
                  <div key={step} className="flex items-center gap-1 flex-shrink-0">
                    <div
                      className="rounded-full px-3 py-1 text-[11px] font-medium whitespace-nowrap"
                      style={{
                        background: isCurrent ? 'var(--color-cyan)' : isDone ? 'rgba(0,217,255,0.15)' : 'var(--muted)',
                        color: isCurrent ? '#0A0E1A' : isDone ? 'var(--color-cyan)' : 'var(--foreground)',
                        opacity: isCurrent || isDone ? 1 : 0.35,
                      }}
                    >
                      {isDone ? '✓ ' : ''}{STEP_LABELS[step]}
                    </div>
                    {i < STEPS.length - 1 && (
                      <div className="w-3 h-px flex-shrink-0" style={{ background: 'var(--card-border)' }} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Progress bar */}
            {selectedCampaign.tasks.length > 0 && (
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs mb-1.5" style={{ color: 'var(--foreground)', opacity: 0.55 }}>
                  <span>
                    {progressQuery.data?.completed ?? 0} of {progressQuery.data?.total ?? selectedCampaign.tasks.length} tasks complete
                  </span>
                  <span className="font-semibold">{progressQuery.data?.percent ?? 0}%</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--muted)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${progressQuery.data?.percent ?? 0}%`, background: 'var(--color-cyan)' }}
                  />
                </div>
                {progressQuery.data?.byStatus && Object.keys(progressQuery.data.byStatus).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {Object.entries(progressQuery.data.byStatus).map(([status, count]) => (
                      <span key={status} className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusTone(status)}`}>
                        {status}: {String(count)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* Bot recommendation */}
          {selectedCampaign.tasks.length > 0 && (
            <Card>
              <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Bot recommendation</p>
              {recommendQuery.isLoading && (
                <p className="mt-2 text-xs animate-pulse" style={{ color: 'var(--foreground)', opacity: 0.45 }}>Analyzing tasks…</p>
              )}
              {recommendQuery.isError && (
                <p className="mt-2 text-xs text-rose-400">{(recommendQuery.error as Error).message}</p>
              )}
              {recommendQuery.data && (
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: 'var(--foreground)', opacity: 0.45 }}>Best fit:</span>
                    <span className="rounded-full bg-sky-900/50 px-3 py-1 text-sm font-semibold text-sky-200">
                      {recommendQuery.data.botName}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(recommendQuery.data.breakdown).map(([bot, count]) => (
                      <span key={bot} className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">
                        {bot} ×{String(count)}
                      </span>
                    ))}
                  </div>
                  <span className="text-[11px] text-slate-500">
                    {recommendQuery.data.taskCount} task{recommendQuery.data.taskCount !== 1 ? 's' : ''}
                  </span>
                </div>
              )}
            </Card>
          )}

          {/* Plan options */}
          <Card>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Plan options</p>
              {selectedCampaign.approvedPlanName && (
                <span className="text-xs text-emerald-400">Active: {selectedCampaign.approvedPlanName}</span>
              )}
            </div>
            {planMutation.isLoading && (
              <p className="mt-2 text-xs animate-pulse" style={{ color: 'var(--foreground)', opacity: 0.45 }}>
                Generating plan options via OpenClaw…
              </p>
            )}
            {!availablePlans.length && !planMutation.isLoading && (
              <p className="mt-2 text-sm" style={{ color: 'var(--foreground)', opacity: 0.35 }}>
                No generated plans yet. Click &quot;Generate plan&quot; above.
              </p>
            )}
            <div className="mt-3 space-y-3">
              {availablePlans.map((plan) => (
                <div key={plan.name} className="rounded-xl p-3" style={{ border: '1px solid var(--card-border)', background: 'var(--muted)' }}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-100">{plan.name}</p>
                      <p className="text-xs text-slate-400">
                        {plan.tasks.length} tasks
                        {plan.estimated_duration_seconds
                          ? ` · ~${Math.round(plan.estimated_duration_seconds / 60)} min`
                          : ''}
                        {plan.estimated_cost_cents != null
                          ? ` · $${(plan.estimated_cost_cents / 100).toFixed(2)}`
                          : ''}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => approvePlanMutation.mutate({ campaignId: selectedCampaign.id, planName: plan.name })}
                      disabled={approvePlanMutation.isLoading}
                    >
                      {approvePlanMutation.isLoading ? 'Approving…' : 'Approve'}
                    </Button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {plan.tasks.map((task) => (
                      <div key={`${plan.name}-${task.key}`} className="rounded-lg px-3 py-2" style={{ border: '1px solid var(--card-border)' }}>
                        <p className="text-sm text-slate-100">{task.title}</p>
                        {task.description && <p className="text-xs text-slate-400">{task.description}</p>}
                        {task.dependencies.length > 0 && (
                          <p className="mt-1 text-[11px] text-slate-500">Depends on: {task.dependencies.join(', ')}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {approvePlanMutation.isSuccess && (
                <p className="text-xs text-emerald-400">Plan approved — use Execute below to run.</p>
              )}
              {approvePlanMutation.isError && (
                <p className="text-xs text-rose-400">{(approvePlanMutation.error as Error).message}</p>
              )}
            </div>
          </Card>

          {/* Execute */}
          <Card>
            <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Execute campaign</p>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--foreground)', opacity: 0.4 }}>
              Run all tasks now, queue for background, or schedule.
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-[11px]" style={{ color: 'var(--foreground)', opacity: 0.45 }}>Schedule date/time</label>
                <input
                  type="datetime-local"
                  className="rounded-md border border-border bg-[var(--input-background)] px-2 py-1 text-xs text-slate-900"
                  value={scheduleAt}
                  onChange={(e) => setScheduleAt(e.target.value)}
                />
              </div>
              <Button
                size="sm"
                onClick={() => runMutation.mutate({ campaignId: selectedCampaign.id, mode: 'now' })}
                disabled={runMutation.isLoading || !selectedCampaign.tasks.length}
              >
                {runMutation.isLoading && runMutation.variables?.mode === 'now' ? 'Starting…' : 'Run now'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => runMutation.mutate({ campaignId: selectedCampaign.id, mode: 'queue' })}
                disabled={runMutation.isLoading}
              >
                {runMutation.isLoading && runMutation.variables?.mode === 'queue' ? 'Queuing…' : 'Add to queue'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  runMutation.mutate({
                    campaignId: selectedCampaign.id,
                    mode: 'schedule',
                    scheduledAt: scheduleAt ? new Date(scheduleAt).toISOString() : undefined,
                  })
                }
                disabled={runMutation.isLoading || !scheduleAt}
              >
                {runMutation.isLoading && runMutation.variables?.mode === 'schedule' ? 'Scheduling…' : 'Schedule'}
              </Button>
            </div>
            {runMutation.isSuccess && (
              <p className="mt-2 text-xs text-emerald-400">
                {runMutation.variables?.mode === 'now'
                  ? 'Execution started — tasks are running in the background.'
                  : runMutation.variables?.mode === 'queue'
                  ? 'Campaign added to queue.'
                  : 'Campaign scheduled.'}
              </p>
            )}
            {runMutation.isError && (
              <p className="mt-2 text-xs text-rose-400">{(runMutation.error as Error).message}</p>
            )}
          </Card>

          {/* Phase 5: Task list — FAILED first */}
          <Card>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Tasks</p>
              {selectedCampaign.tasks.length > 0 && (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                  style={{ background: 'var(--muted)', color: 'var(--foreground)', opacity: 0.6 }}
                >
                  {selectedCampaign.tasks.length}
                </span>
              )}
            </div>
            {!selectedCampaign.tasks.length ? (
              <p className="mt-2 text-sm" style={{ color: 'var(--foreground)', opacity: 0.35 }}>
                No tasks yet. Approve a generated plan or add tasks manually below.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {sortedTasks.map((task) => {
                  const isFailed = task.status === 'FAILED';
                  const isDone = task.status === 'DONE' || task.status === 'COMPLETED';
                  const retryAgent = retryAgents[task.id] ?? 'main';
                  const isRetrying = retryTaskMutation.isLoading &&
                    (retryTaskMutation.variables as { taskId: string } | undefined)?.taskId === task.id;
                  const isReplanning = replanTaskMutation.isLoading &&
                    (replanTaskMutation.variables as { taskId: string } | undefined)?.taskId === task.id;
                  const isReviewing = reviewTaskMutation.isLoading &&
                    (reviewTaskMutation.variables as { taskId: string } | undefined)?.taskId === task.id;
                  return (
                    <div
                      key={task.id}
                      className="rounded-xl px-3 py-2"
                      style={{
                        border: isFailed ? '1px solid rgba(239,68,68,0.4)' : '1px solid var(--card-border)',
                        background: isFailed ? 'rgba(239,68,68,0.06)' : 'var(--muted)',
                        opacity: isDone ? 0.55 : 1,
                      }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm text-slate-100">{task.title}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold flex-shrink-0 ${statusTone(task.status)}`}>
                          {task.status}
                        </span>
                      </div>
                      {task.description && (
                        <p className="mt-1 text-xs text-slate-400">{task.description}</p>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                        <span>Priority {task.priority}</span>
                        {task.dependencies?.length ? <span>· Depends on {task.dependencies.join(', ')}</span> : null}
                        {task.toolTurns != null ? <span>· {task.toolTurns} tool turns</span> : null}
                        {task.taskPoolIssueUrl && (
                          <a
                            href={task.taskPoolIssueUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded bg-slate-800 px-1.5 py-0.5 text-sky-400 hover:text-sky-300"
                          >
                            #{task.taskPoolIssueNumber} ↗
                          </a>
                        )}
                      </div>

                      {isFailed && (
                        <div className="mt-2 rounded-lg p-2 space-y-2" style={{ border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)' }}>
                          {task.errorMessage && (
                            <p className="text-[11px] text-rose-300">{task.errorMessage}</p>
                          )}
                          <div className="flex flex-wrap items-center gap-2">
                            <select
                              className="rounded-md border border-border bg-[var(--input-background)] px-2 py-1 text-xs text-slate-900"
                              value={retryAgent}
                              onChange={(e) => setRetryAgents((prev) => ({ ...prev, [task.id]: e.target.value }))}
                            >
                              <option value="main">Adrian · main</option>
                              <option value="ruby">Ruby · ruby</option>
                              <option value="emerald">Emerald · emerald</option>
                              <option value="adobe">Adobe · adobe</option>
                            </select>
                            <Button
                              size="sm"
                              onClick={() =>
                                retryTaskMutation.mutate({ campaignId: selectedCampaignId, taskId: task.id, agentId: retryAgent })
                              }
                              disabled={isRetrying || isReplanning}
                            >
                              {isRetrying ? 'Retrying…' : 'Retry task'}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => replanTaskMutation.mutate({ campaignId: selectedCampaignId, taskId: task.id })}
                              disabled={isReplanning || isRetrying}
                            >
                              {isReplanning ? 'Re-planning…' : 'Re-plan task'}
                            </Button>
                          </div>
                          {retryTaskMutation.isError &&
                            (retryTaskMutation.variables as { taskId: string } | undefined)?.taskId === task.id && (
                              <p className="text-[11px] text-rose-400">{(retryTaskMutation.error as Error).message}</p>
                            )}
                          {replanTaskMutation.isError &&
                            (replanTaskMutation.variables as { taskId: string } | undefined)?.taskId === task.id && (
                              <p className="text-[11px] text-rose-400">{(replanTaskMutation.error as Error).message}</p>
                            )}
                        </div>
                      )}

                      {task.output && (
                        <details className="mt-2">
                          <summary className="flex items-center justify-between cursor-pointer text-[11px] text-slate-400 hover:text-slate-300">
                            <span>View agent output</span>
                            <a
                              href={`/api/dispatch/campaigns/${selectedCampaign.id}/download?task=${task.id}`}
                              download
                              onClick={(e) => e.stopPropagation()}
                              className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] hover:opacity-80"
                              style={{ background: 'var(--muted)', color: 'var(--foreground)', opacity: 0.6 }}
                            >
                              <Download className="w-2.5 h-2.5" /> .md
                            </a>
                          </summary>
                          <pre className="mt-2 whitespace-pre-wrap rounded-lg p-2 text-[11px] text-slate-300" style={{ border: '1px solid var(--card-border)', background: 'var(--background)' }}>
                            {task.output}
                          </pre>
                        </details>
                      )}
                      {isDone && task.output && !task.reviewOutput && (
                        <div className="mt-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => reviewTaskMutation.mutate({ campaignId: selectedCampaignId, taskId: task.id })}
                            disabled={isReviewing}
                          >
                            {isReviewing ? 'Requesting review…' : 'Request Emerald review'}
                          </Button>
                          {reviewTaskMutation.isError &&
                            (reviewTaskMutation.variables as { taskId: string } | undefined)?.taskId === task.id && (
                              <p className="mt-1 text-[11px] text-rose-400">{(reviewTaskMutation.error as Error).message}</p>
                            )}
                        </div>
                      )}
                      {task.reviewOutput && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-[11px] text-sky-500 hover:text-sky-400">
                            Emerald review
                          </summary>
                          <pre className="mt-2 whitespace-pre-wrap rounded-lg border border-sky-900/40 bg-sky-950/30 p-2 text-[11px] text-sky-200">
                            {task.reviewOutput}
                          </pre>
                        </details>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Manual task entry (collapsed) */}
          <Card>
            <button
              className="flex items-center justify-between w-full text-left"
              onClick={() => setShowManualTaskEntry((v) => !v)}
            >
              <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Add task manually</p>
              <span className="text-[11px]" style={{ color: 'var(--foreground)', opacity: 0.35 }}>
                {showManualTaskEntry ? '▲' : '▼'}
              </span>
            </button>
            {showManualTaskEntry && (
              <div className="mt-3 space-y-3">
                <input
                  className="w-full rounded-md border border-border bg-[var(--input-background)] px-3 py-2 text-sm text-slate-900"
                  placeholder="Task title *"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                />
                <textarea
                  className="w-full rounded-md border border-border bg-[var(--input-background)] px-3 py-2 text-sm text-slate-900"
                  rows={2}
                  placeholder="Task description"
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                />
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400">Priority (1 = highest)</label>
                    <select
                      className="w-full rounded-md border border-border bg-[var(--input-background)] px-2 py-2 text-sm text-slate-900"
                      value={taskPriority}
                      onChange={(e) => setTaskPriority(e.target.value)}
                    >
                      <option value="1">1 — Critical</option>
                      <option value="2">2 — High</option>
                      <option value="3">3 — Medium</option>
                      <option value="4">4 — Low</option>
                      <option value="5">5 — Backlog</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400">Due date</label>
                    <input
                      type="date"
                      className="w-full rounded-md border border-border bg-[var(--input-background)] px-2 py-2 text-sm text-slate-900"
                      value={taskDueDate}
                      onChange={(e) => setTaskDueDate(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">Assignee (bot or person)</label>
                  <input
                    className="w-full rounded-md border border-border bg-[var(--input-background)] px-3 py-2 text-sm text-slate-900"
                    placeholder="e.g. Ruby, Adrian, Emerald"
                    value={taskAssignee}
                    onChange={(e) => setTaskAssignee(e.target.value)}
                  />
                </div>
                <Button
                  onClick={() =>
                    createTaskMutation.mutate({
                      campaignId: selectedCampaign.id,
                      title: taskTitle,
                      description: taskDescription || undefined,
                      priority: taskPriority ? Number(taskPriority) : undefined,
                      dueDate: taskDueDate || undefined,
                      assignee: taskAssignee || undefined,
                    })
                  }
                  disabled={!taskTitle || createTaskMutation.isLoading}
                >
                  {createTaskMutation.isLoading ? 'Adding...' : 'Add task'}
                </Button>
                {createTaskMutation.isError && (
                  <p className="text-xs text-rose-400">{(createTaskMutation.error as Error).message}</p>
                )}
                {createTaskMutation.isSuccess && (
                  <p className="text-xs text-emerald-400">Task added.</p>
                )}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ── Advanced tools (collapsed) ── */}
      <details>
        <summary
          className="cursor-pointer list-none py-2 text-sm"
          style={{ color: 'var(--foreground)', opacity: 0.4 }}
        >
          ▸ Advanced tools &nbsp;
          <span className="text-[11px]">(Command input · Telegram · OpenClaw · Recent commands)</span>
        </summary>

        <div className="mt-2 space-y-3">
          <Card>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Command input</CardTitle>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-400">Gateway</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    gateway.data?.ok ? 'bg-emerald-900/50 text-emerald-200' : 'bg-rose-900/50 text-rose-200'
                  }`}
                >
                  {gateway.isFetching ? 'Checking...' : gateway.data?.ok ? 'Reachable' : 'Unreachable'}
                </span>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <input
                className="w-full rounded-md border border-border bg-[var(--input-background)] px-3 py-2 text-sm text-slate-900"
                placeholder="Send instruction to Dispatch-Bot"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && input && mutation.mutate({ input, sourceChannel: source })}
              />
              <select
                className="rounded-md border border-border bg-[var(--input-background)] px-2 text-sm"
                value={source}
                onChange={(e) => setSource(e.target.value)}
              >
                <option value="web">web</option>
                <option value="telegram">telegram</option>
                <option value="api">api</option>
              </select>
              <Button
                onClick={() => mutation.mutate({ input, sourceChannel: source })}
                disabled={!input || mutation.isLoading}
              >
                Submit
              </Button>
            </div>
            {mutation.isSuccess && <p className="mt-2 text-xs text-emerald-300">Command accepted and logged.</p>}
            {mutation.isError && <p className="mt-2 text-xs text-rose-400">{(mutation.error as Error).message}</p>}
          </Card>

          <Card>
            <CardTitle>Telegram dispatch</CardTitle>
            <div className="mt-3 space-y-3">
              <textarea
                className="w-full rounded-md border border-border bg-[var(--input-background)] px-3 py-2 text-sm text-slate-900"
                rows={3}
                placeholder="Send a quick update or instruction to Telegram"
                value={telegramMessage}
                onChange={(e) => setTelegramMessage(e.target.value)}
              />
              <div className="flex items-center gap-3">
                <select
                  className="rounded-md border border-border bg-[var(--input-background)] px-2 text-sm"
                  value={telegramBot}
                  onChange={(e) => setTelegramBot(e.target.value)}
                >
                  <option value="bot1">Bot 1</option>
                  <option value="bot2">Bot 2 (default)</option>
                  <option value="bot3">Bot 3</option>
                  <option value="botAdobe">Adobe Bot</option>
                </select>
                <Button
                  onClick={() => telegramMutation.mutate({ text: telegramMessage, botKey: telegramBot })}
                  disabled={!telegramMessage || telegramMutation.isLoading}
                >
                  Send
                </Button>
                {telegramMutation.isSuccess && <p className="text-xs text-emerald-300">Sent.</p>}
                {telegramMutation.isError && (
                  <p className="text-xs text-rose-400">Failed: {(telegramMutation.error as Error).message}</p>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <CardTitle>OpenClaw dispatch</CardTitle>
            <div className="mt-3 space-y-3">
              {gatewayHelp && (
                <div className="rounded-md border border-amber-500/40 bg-amber-950/30 p-3 text-xs text-amber-100">
                  <p className="font-semibold">{gatewayHelp.title}</p>
                  <ul className="mt-1 list-disc pl-4 space-y-0.5">
                    {gatewayHelp.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ul>
                </div>
              )}
              <textarea
                className="w-full rounded-md border border-border bg-[var(--input-background)] px-3 py-2 text-sm text-slate-900"
                rows={3}
                placeholder="Send instruction to OpenClaw agents"
                value={ocText}
                onChange={(e) => setOcText(e.target.value)}
              />
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <select
                  className="rounded-md border border-border bg-[var(--input-background)] px-2 py-1"
                  value={ocAgent}
                  onChange={(e) => setOcAgent(e.target.value)}
                >
                  <option value="main">Adrian · main</option>
                  <option value="ruby">Ruby · ruby</option>
                  <option value="emerald">Emerald · emerald</option>
                  <option value="adobe">Adobe Pettaway · adobe</option>
                  <option value="anchor">Anchor · anchor</option>
                </select>
                <input
                  className="w-48 rounded-md border border-border bg-[var(--input-background)] px-2 py-1 text-xs text-slate-900"
                  placeholder="Session key (optional)"
                  value={ocSession}
                  onChange={(e) => setOcSession(e.target.value)}
                />
                <Button
                  onClick={() =>
                    openClawMutation.mutate({ text: ocText, agentId: ocAgent, sessionKey: ocSession || undefined })
                  }
                  disabled={!ocText || openClawMutation.isLoading || gateway.isError}
                >
                  Dispatch
                </Button>
                {openClawMutation.isError && (
                  <p className="text-xs text-rose-400">Failed: {(openClawMutation.error as Error).message}</p>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-300">
                <Button variant="outline" size="sm" onClick={() => gatewayMutation.mutate()} disabled={gatewayMutation.isLoading}>
                  Check gateway
                </Button>
                {gatewayMutation.isSuccess && <span className="text-emerald-300">Gateway OK</span>}
                {gatewayMutation.isError && (
                  <span className="text-rose-300">Gateway error: {(gatewayMutation.error as Error).message}</span>
                )}
              </div>
              {ocResult && (
                <pre className="whitespace-pre-wrap rounded-md border border-border bg-panel p-3 text-xs text-slate-200">
                  {ocResult}
                </pre>
              )}
            </div>
          </Card>

          <Card>
            <CardTitle>Recent commands</CardTitle>
            <div className="mt-3 space-y-3">
              {(data ?? []).map((cmd) => (
                <div key={cmd.id} className="rounded-lg border border-border p-3">
                  <p className="text-sm text-slate-900">{cmd.input}</p>
                  <p className="text-xs text-slate-400">{cmd.sourceChannel} · {cmd.status}</p>
                  {cmd.run && <p className="text-xs text-slate-500">Run: {cmd.run.type}</p>}
                </div>
              ))}
              {!data?.length && <p className="text-sm text-slate-500">No recent commands.</p>}
            </div>
          </Card>
        </div>
      </details>
    </div>
  );
}

export default function DispatchPage() {
  return (
    <Suspense fallback={
      <div className="space-y-3 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-2xl" style={{ background: 'var(--muted)' }} />
        ))}
      </div>
    }>
      <DispatchPageInner />
    </Suspense>
  );
}
