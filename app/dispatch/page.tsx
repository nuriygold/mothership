'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardSubtitle, CardTitle } from '@/components/ui/card';

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
  return res.json();
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

async function transcribeAzure(audio: Blob) {
  const res = await fetch('/api/voice/stt', {
    method: 'POST',
    headers: { 'Content-Type': audio.type || 'audio/ogg' },
    body: audio,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? 'STT failed');
  }
  return res.json();
}

async function fetchDispatchCampaigns(): Promise<DispatchCampaign[]> {
  const res = await fetch('/api/dispatch/campaigns', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load dispatch campaigns');
  return res.json();
}

async function createDispatchCampaign(payload: { title: string; description?: string }) {
  const res = await fetch('/api/dispatch/campaigns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.message ?? 'Failed to create campaign');
  return body;
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
  const body = await res.json();
  if (!res.ok) throw new Error(body?.message ?? 'Failed to load progress');
  return body;
}

function statusTone(status: string) {
  if (status === 'EXECUTING' || status === 'DONE') return 'bg-emerald-900/40 text-emerald-200';
  if (status === 'PAUSED' || status === 'FAILED') return 'bg-rose-900/40 text-rose-200';
  if (status === 'READY' || status === 'RUNNING') return 'bg-sky-900/40 text-sky-200';
  return 'bg-slate-800 text-slate-200';
}

function getSupportedMimeType(): string {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4',
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

function DispatchPageInner() {
  const searchParams = useSearchParams();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['commands'], queryFn: fetchCommands });
  const gateway = useQuery({ queryKey: ['gateway'], queryFn: checkGateway, staleTime: 15_000 });
  const dispatchCampaignsQuery = useQuery({
    queryKey: ['dispatch-campaigns'],
    queryFn: fetchDispatchCampaigns,
    refetchInterval: 15_000,
  });

  const [input, setInput] = useState('');
  const [source, setSource] = useState('web');
  const [telegramMessage, setTelegramMessage] = useState('');
  const [telegramBot, setTelegramBot] = useState('bot2');
  const [ocText, setOcText] = useState('');
  const [ocAgent, setOcAgent] = useState('main');
  const [ocSession, setOcSession] = useState('');
  const [ocResult, setOcResult] = useState<string | null>(null);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceStatus, setVoiceStatus] = useState<string>('');
  const [voiceError, setVoiceError] = useState<string>('');
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [campaignTitle, setCampaignTitle] = useState('');
  const [campaignDescription, setCampaignDescription] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskPriority, setTaskPriority] = useState('3');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskAssignee, setTaskAssignee] = useState('');
  const campaignSectionRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Pre-fill campaign from query params (e.g. dispatched from Today page)
  useEffect(() => {
    const task = searchParams?.get('task');
    const taskSource = searchParams?.get('source');
    if (task) {
      setCampaignTitle(task);
      if (taskSource) {
        setCampaignDescription(`Task from: ${taskSource}`);
      }
      setTimeout(() => {
        campaignSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    }
  }, [searchParams]);

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

  const sttMutation = useMutation({
    mutationFn: transcribeAzure,
  });

  const ttsMutation = useMutation({
    mutationFn: async (text: string) => {
      const res = await fetch('/api/voice/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? 'TTS failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (audioRef.current) {
        audioRef.current.src = url;
        await audioRef.current.play();
      }
      return true;
    },
    onError: (err: Error) => {
      setVoiceError(err?.message ?? 'TTS error');
      setVoiceStatus('Error');
    },
  });

  const gatewayMutation = useMutation({
    mutationFn: checkGateway,
  });

  const createCampaignMutation = useMutation({
    mutationFn: createDispatchCampaign,
    onSuccess: async (payload) => {
      await qc.invalidateQueries({ queryKey: ['dispatch-campaigns'] });
      setCampaignTitle('');
      setCampaignDescription('');
      if (payload?.campaign?.id) {
        setSelectedCampaignId(payload.campaign.id);
      }
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

  const startRecording = async () => {
    setVoiceTranscript('');
    setVoiceError('');
    setVoiceStatus('Requesting mic...');
    audioChunksRef.current = [];

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      const isDenied = name === 'NotAllowedError' || name === 'PermissionDeniedError';
      setVoiceStatus(isDenied ? 'Permission denied' : 'Mic error');
      setVoiceError(err instanceof Error ? err.message : String(err));
      throw err;
    }

    const mime = getSupportedMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch (err) {
      stream.getTracks().forEach((t) => t.stop());
      const msg = err instanceof Error ? err.message : String(err);
      setVoiceStatus('Recorder error');
      setVoiceError(msg);
      throw err;
    }

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) audioChunksRef.current.push(event.data);
    };
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      setVoiceStatus('Transcribing...');
      const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
      try {
        const stt = await sttMutation.mutateAsync(blob as Blob);
        const text = stt?.text ?? '';
        setVoiceTranscript(text);
        if (text) {
          setVoiceStatus('Dispatching...');
          openClawMutation.mutate(
            { text, agentId: ocAgent },
            {
              onSuccess: (payload) => {
                const output = payload?.result?.output ?? 'Dispatched.';
                setOcResult(output);
                setVoiceStatus('Speaking...');
                ttsMutation.mutate(output, { onSettled: () => setVoiceStatus('Idle') });
              },
              onError: () => setVoiceStatus('Error'),
            }
          );
        } else {
          setVoiceStatus('No transcript');
        }
      } catch (err) {
        setVoiceStatus('STT error');
        setVoiceError((err as Error)?.message ?? 'STT error');
      }
    };
    mediaRecorderRef.current = recorder;
    recorder.start();
    setVoiceListening(true);
    setVoiceStatus('Listening...');
  };

  const stopRecording = () => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') {
      rec.stop();
    }
    setVoiceListening(false);
  };

  const toggleVoice = () => {
    if (voiceListening) {
      stopRecording();
    } else {
      startRecording().catch(() => {
        // Error already handled inside startRecording
      });
    }
  };

  const availablePlans = selectedCampaign?.latestPlan?.plans ?? [];

  return (
    <div className="space-y-4">
      <div ref={campaignSectionRef}>
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Dispatch campaigns</CardTitle>
              <CardSubtitle>Create and orchestrate dispatch campaigns via Dispatch-Bot.</CardSubtitle>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400">Campaigns</span>
              <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-slate-200">
                {dispatchCampaignsQuery.data?.length ?? 0}
              </span>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_1.4fr]">
            <div className="space-y-3">
              <input
                className="w-full rounded-md border border-border bg-[var(--input-background)] px-3 py-2 text-sm text-slate-900"
                placeholder="New campaign title"
                value={campaignTitle}
                onChange={(e) => setCampaignTitle(e.target.value)}
              />
              <textarea
                className="w-full rounded-md border border-border bg-[var(--input-background)] px-3 py-2 text-sm text-slate-900"
                rows={4}
                placeholder="Campaign objective, context, constraints"
                value={campaignDescription}
                onChange={(e) => setCampaignDescription(e.target.value)}
              />
              <Button
                onClick={() =>
                  createCampaignMutation.mutate({ title: campaignTitle, description: campaignDescription || undefined })
                }
                disabled={!campaignTitle || createCampaignMutation.isLoading}
              >
                {createCampaignMutation.isLoading ? 'Creating...' : 'Create dispatch campaign'}
              </Button>
              {createCampaignMutation.isError && (
                <p className="text-xs text-rose-400">{(createCampaignMutation.error as Error).message}</p>
              )}
              {createCampaignMutation.isSuccess && (
                <p className="text-xs text-emerald-400">Campaign created — select it from the list to plan and execute.</p>
              )}
            </div>

            <div className="space-y-3">
              {dispatchCampaignsQuery.isLoading && (
                <p className="text-sm text-slate-400">Loading campaigns…</p>
              )}
              {(dispatchCampaignsQuery.data ?? []).map((campaign) => (
                <button
                  key={campaign.id}
                  type="button"
                  onClick={() => setSelectedCampaignId(campaign.id)}
                  className={`w-full rounded-lg border p-3 text-left transition ${
                    selectedCampaignId === campaign.id ? 'border-[var(--primary)] bg-panel' : 'border-border bg-transparent'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{campaign.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{campaign.description || 'No description yet.'}</p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusTone(campaign.status)}`}>
                      {campaign.status}
                    </span>
                  </div>
                  <div className="mt-2 flex gap-4 text-xs text-slate-500">
                    <span>{campaign.tasks.length} tasks</span>
                    <span>{campaign.approvedPlanName ? `Approved: ${campaign.approvedPlanName}` : 'No approved plan'}</span>
                  </div>
                </button>
              ))}
              {!dispatchCampaignsQuery.isLoading && !dispatchCampaignsQuery.data?.length && (
                <p className="rounded-lg border border-dashed border-border p-4 text-sm text-slate-500">
                  No dispatch campaigns yet. Create one to start planning and task orchestration.
                </p>
              )}
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>{selectedCampaign?.title || 'Select a dispatch campaign'}</CardTitle>
            <CardSubtitle>
              {selectedCampaign?.description || 'Plan with OpenClaw, approve a task graph, or add tasks manually.'}
            </CardSubtitle>
          </div>
          {selectedCampaign && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={() => planMutation.mutate(selectedCampaign.id)}
                disabled={planMutation.isLoading}
              >
                {planMutation.isLoading ? 'Planning...' : 'Generate plan options'}
              </Button>
              {planMutation.isError && (
                <p className="text-xs text-rose-400">{(planMutation.error as Error).message}</p>
              )}
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
                {selectedCampaign.status === 'PAUSED' ? 'Resume campaign' : 'Pause campaign'}
              </Button>
            </div>
          )}
        </div>

        {selectedCampaign ? (
          <div className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-4">
              <div className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-900">Plan options</p>
                  {selectedCampaign.approvedPlanName && (
                    <span className="text-xs text-emerald-400">Live plan: {selectedCampaign.approvedPlanName}</span>
                  )}
                </div>
                {planMutation.isLoading && (
                  <p className="mt-2 text-xs text-slate-400 animate-pulse">Generating plan options via OpenClaw…</p>
                )}
                <div className="mt-3 space-y-3">
                  {availablePlans.map((plan) => (
                    <div key={plan.name} className="rounded-lg border border-border bg-panel p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-100">{plan.name}</p>
                          <p className="text-xs text-slate-400">
                            {plan.tasks.length} tasks
                            {plan.estimated_duration_seconds
                              ? ` • ~${Math.round(plan.estimated_duration_seconds / 60)} min`
                              : ''}
                            {plan.estimated_cost_cents !== undefined && plan.estimated_cost_cents !== null
                              ? ` • $${(plan.estimated_cost_cents / 100).toFixed(2)}`
                              : ''}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          onClick={() =>
                            approvePlanMutation.mutate({
                              campaignId: selectedCampaign.id,
                              planName: plan.name,
                            })
                          }
                          disabled={approvePlanMutation.isLoading}
                        >
                          {approvePlanMutation.isLoading ? 'Approving…' : 'Approve'}
                        </Button>
                      </div>
                      <div className="mt-3 space-y-2">
                        {plan.tasks.map((task) => (
                          <div key={`${plan.name}-${task.key}`} className="rounded-md border border-border px-3 py-2">
                            <p className="text-sm text-slate-100">{task.title}</p>
                            <p className="text-xs text-slate-400">{task.description || 'No task description.'}</p>
                            <p className="mt-1 text-[11px] text-slate-500">
                              {task.dependencies.length ? `Depends on: ${task.dependencies.join(', ')}` : 'No dependencies'}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {!availablePlans.length && !planMutation.isLoading && (
                    <p className="text-sm text-slate-500">No generated plans yet. Click &quot;Generate plan options&quot; to create options.</p>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-border p-3">
                <p className="text-sm font-semibold text-slate-900">Manual task entry</p>
                <p className="mt-1 text-xs text-slate-500">Add a task directly to this campaign&apos;s task pool.</p>
                <div className="mt-3 space-y-3">
                  <input
                    className="w-full rounded-md border border-border bg-[var(--input-background)] px-3 py-2 text-sm text-slate-900"
                    placeholder="Task title *"
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                  />
                  <textarea
                    className="w-full rounded-md border border-border bg-[var(--input-background)] px-3 py-2 text-sm text-slate-900"
                    rows={3}
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
                    {createTaskMutation.isLoading ? 'Adding...' : 'Add task to campaign'}
                  </Button>
                  {createTaskMutation.isError && (
                    <p className="text-xs text-rose-400">{(createTaskMutation.error as Error).message}</p>
                  )}
                  {createTaskMutation.isSuccess && (
                    <p className="text-xs text-emerald-400">Task added to campaign.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-lg border border-border p-3">
                <p className="text-sm font-semibold text-slate-900">Progress</p>
                <p className="mt-2 text-3xl font-semibold text-slate-100">{progressQuery.data?.percent ?? 0}%</p>
                <p className="text-xs text-slate-400">
                  {progressQuery.data?.completed ?? 0} of {progressQuery.data?.total ?? selectedCampaign.tasks.length} tasks complete
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {Object.entries(progressQuery.data?.byStatus ?? {}).map(([status, count]) => (
                    <span key={status} className="rounded-full bg-slate-800 px-2 py-1 text-[11px] text-slate-200">
                      {status}: {String(count)}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-border p-3">
                <p className="text-sm font-semibold text-slate-900">Campaign tasks</p>
                <div className="mt-3 space-y-2">
                  {selectedCampaign.tasks.map((task) => (
                    <div key={task.id} className="rounded-md border border-border px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm text-slate-100">{task.title}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusTone(task.status)}`}>
                          {task.status}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">{task.description || 'No task description.'}</p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Priority {task.priority}
                        {task.dependencies?.length ? ` • Depends on ${task.dependencies.join(', ')}` : ''}
                      </p>
                    </div>
                  ))}
                  {!selectedCampaign.tasks.length && (
                    <p className="text-sm text-slate-500">No tasks yet. Approve a generated plan or add tasks manually.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">Pick a campaign to inspect plans, tasks, and execution state.</p>
        )}
      </Card>

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
          <Button onClick={() => mutation.mutate({ input, sourceChannel: source })} disabled={!input || mutation.isLoading}>
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
            {telegramMutation.isSuccess && <p className="text-xs text-emerald-300">Sent to Telegram.</p>}
            {telegramMutation.isError && (
              <p className="text-xs text-rose-400">Failed: {(telegramMutation.error as Error).message}</p>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle>OpenClaw dispatch</CardTitle>
        <div className="mt-3 space-y-3">
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
              <option value="main">Adrian · main · GPT-5.3 Chat</option>
              <option value="ruby">Ruby · ruby · GPT-5.3 Chat</option>
              <option value="emerald">Emerald · emerald · GPT-5.3 Chat</option>
              <option value="adobe">Adobe Pettaway · adobe · Gemini 2.5 Flash</option>
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
              disabled={!ocText || openClawMutation.isLoading}
            >
              Dispatch
            </Button>
            {openClawMutation.isError && (
              <p className="text-xs text-rose-400">Failed: {(openClawMutation.error as Error).message}</p>
            )}
          </div>
          <div className="mt-3 flex items-center gap-3 text-xs text-slate-300">
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
        <CardTitle>Voice (Jarvis)</CardTitle>
        <div className="mt-3 space-y-3 text-sm text-slate-200">
          <div className="flex items-center gap-3 flex-wrap">
            <Button onClick={toggleVoice} variant={voiceListening ? 'outline' : 'default'}>
              {voiceListening ? 'Stop Listening' : 'Push to Talk'}
            </Button>
            <select
              className="rounded-md border border-border bg-[var(--input-background)] px-2 py-1 text-xs"
              value={ocAgent}
              onChange={(e) => setOcAgent(e.target.value)}
            >
              <option value="main">Adrian · main</option>
              <option value="ruby">Ruby · ruby</option>
              <option value="emerald">Emerald · emerald</option>
              <option value="adobe">Adobe Pettaway · adobe</option>
            </select>
            <span className="text-xs text-slate-400">{voiceStatus || 'Idle'}</span>
            {voiceError && <span className="text-xs text-rose-400">{voiceError}</span>}
            {(voiceError || voiceStatus?.startsWith('Error') || voiceStatus === 'STT error' || voiceStatus === 'Permission denied') && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setVoiceError('');
                  setVoiceStatus('');
                  startRecording().catch(() => {
                    // Error handled inside startRecording
                  });
                }}
              >
                Retry
              </Button>
            )}
          </div>
          {voiceStatus === 'Permission denied' && (
            <p className="text-xs text-amber-400 rounded-md border border-amber-800/40 bg-amber-900/20 px-3 py-2">
              Microphone access was denied. Check your browser settings and allow microphone access for this site, then retry.
            </p>
          )}
          <div className="min-h-[48px] rounded-md border border-border bg-panel px-3 py-2 text-xs text-slate-100">
            {voiceTranscript || 'Transcript will appear here.'}
          </div>
          {ocResult && (
            <pre className="whitespace-pre-wrap rounded-md border border-border bg-panel p-3 text-xs text-slate-200">
              {ocResult}
            </pre>
          )}
          <audio ref={audioRef} hidden />
          {ttsMutation.isError && <p className="text-xs text-rose-400">TTS failed: {(ttsMutation.error as Error).message}</p>}
        </div>
      </Card>

      <Card>
        <CardTitle>Recent commands</CardTitle>
        <div className="mt-3 space-y-3">
          {(data ?? []).map((cmd) => (
            <div key={cmd.id} className="rounded-lg border border-border p-3">
              <p className="text-sm text-slate-900">{cmd.input}</p>
              <p className="text-xs text-slate-400">
                {cmd.sourceChannel} • {cmd.status}
              </p>
              {cmd.run && <p className="text-xs text-slate-500">Run: {cmd.run.type}</p>}
            </div>
          ))}
          {!data?.length && (
            <p className="text-sm text-slate-500">No recent commands.</p>
          )}
        </div>
      </Card>
    </div>
  );
}

export default function DispatchPage() {
  return (
    <Suspense>
      <DispatchPageInner />
    </Suspense>
  );
}
