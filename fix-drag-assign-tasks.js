#!/usr/bin/env node
// fix-drag-assign-tasks.js
// 1. Top Priorities → 10 tasks sorted by dueAt (overdue first)
// 2. Drag-and-drop from Top Priorities into Timeline
// 3. Assign button on Top Priorities items → updates task-pool assignee
// 4. Assign API endpoint update to support ownerLogin

const fs = require('fs');
const path = require('path');
const ROOT = '/Users/claw/mothership-main';

let errors = 0;
function patch(filePath, label, oldStr, newStr) {
  const full = path.join(ROOT, filePath);
  let src = fs.readFileSync(full, 'utf8');
  if (src.includes(newStr.slice(0, 60))) {
    console.log(`✅ ${label}: already applied`);
    return;
  }
  if (!src.includes(oldStr.slice(0, 60))) {
    console.error(`❌ ${label}: target not found`);
    errors++;
    return;
  }
  src = src.replace(oldStr, newStr);
  fs.writeFileSync(full, src);
  console.log(`✅ ${label}`);
}

// ── 1. types.ts — add taskId + dueAt to V2DashboardPriorityItem ──────────────
patch(
  'lib/v2/types.ts',
  'types.ts: add taskId+dueAt to V2DashboardPriorityItem',
  `export type V2DashboardPriorityItem = {
  id: string;
  title: string;
  source: string;
  actionWebhook: string;
  assignedBot: string;
};`,
  `export type V2DashboardPriorityItem = {
  id: string;
  taskId?: string;
  title: string;
  source: string;
  actionWebhook: string;
  assignedBot: string;
  dueAt?: string | null;
};`
);

// ── 2. orchestrator.ts — 10 tasks sorted overdue-first ───────────────────────
patch(
  'lib/v2/orchestrator.ts',
  'orchestrator.ts: top priorities → 10 tasks, sorted overdue-first',
  `  const topPriorities: V2DashboardPriorityItem[] = tasksFeed.today
    .filter((item) => item.metadata.priority === 'critical' || item.metadata.priority === 'high' || item.status === 'Blocked')
    .slice(0, 5)
    .map((item) => {
      const action = upsertAction({
        dedupeKey: \`task:\${item.taskId}\`,
        title: item.title,
        source: \`From \${item.metadata.department}\`,
        bot: item.metadata.assignedBot,
        category: categoryFromRoute(routeForTask({ title: item.title, description: item.metadata.department })),
      });
      return {
        id: action.id,
        title: item.title,
        source: \`From \${item.metadata.department}\`,
        actionWebhook: \`/api/v2/actions/\${action.id}/approve\`,
        assignedBot: item.metadata.assignedBot,
      };
    });`,
  `  // Sort tasks: overdue first (past dueAt), then by dueAt ascending, then undated
  const sortedTasks = [...tasksFeed.today].sort((a, b) => {
    const now = Date.now();
    const aTime = a.metadata.timeframe && a.metadata.timeframe !== 'Today'
      ? new Date(a.metadata.timeframe).getTime() : null;
    const bTime = b.metadata.timeframe && b.metadata.timeframe !== 'Today'
      ? new Date(b.metadata.timeframe).getTime() : null;
    const aOverdue = aTime !== null && aTime < now;
    const bOverdue = bTime !== null && bTime < now;
    if (aOverdue && !bOverdue) return -1;
    if (!aOverdue && bOverdue) return 1;
    if (aTime !== null && bTime !== null) return aTime - bTime;
    if (aTime !== null) return -1;
    if (bTime !== null) return 1;
    return 0;
  });

  const topPriorities: V2DashboardPriorityItem[] = sortedTasks
    .slice(0, 10)
    .map((item) => {
      const action = upsertAction({
        dedupeKey: \`task:\${item.taskId}\`,
        title: item.title,
        source: \`From \${item.metadata.department}\`,
        bot: item.metadata.assignedBot,
        category: categoryFromRoute(routeForTask({ title: item.title, description: item.metadata.department })),
      });
      return {
        id: action.id,
        taskId: item.taskId,
        title: item.title,
        source: \`From \${item.metadata.department}\`,
        actionWebhook: \`/api/v2/actions/\${action.id}/approve\`,
        assignedBot: item.metadata.assignedBot,
        dueAt: item.metadata.timeframe !== 'Today' ? item.metadata.timeframe : null,
      };
    });`
);

// ── 3. tasks/[id]/route.ts — add assign action ───────────────────────────────
patch(
  'app/api/v2/tasks/[id]/route.ts',
  'tasks/[id]/route.ts: add assign action',
  `import { ensureV2Authorized } from '@/lib/v2/auth';
import { mutateTaskFromAction } from '@/lib/v2/orchestrator';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const authError = ensureV2Authorized(req);
  if (authError) return authError;

  try {
    const body = (await req.json()) as { action?: 'start' | 'defer' | 'complete' | 'unblock' };
    if (!body.action) {
      return Response.json(
        { error: { code: 'VALIDATION_ERROR', message: 'action is required' } },
        { status: 400 }
      );
    }

    await mutateTaskFromAction(params.id, body.action);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      {
        error: {
          code: 'TASK_MUTATION_FAILED',
          message: error instanceof Error ? error.message : 'Task update failed',
        },
      },
      { status: 500 }
    );
  }
}`,
  `import { ensureV2Authorized } from '@/lib/v2/auth';
import { mutateTaskFromAction } from '@/lib/v2/orchestrator';
import { updateTask } from '@/lib/services/tasks';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const authError = ensureV2Authorized(req);
  if (authError) return authError;

  try {
    const body = (await req.json()) as {
      action?: 'start' | 'defer' | 'complete' | 'unblock' | 'assign';
      ownerLogin?: string;
    };
    if (!body.action) {
      return Response.json(
        { error: { code: 'VALIDATION_ERROR', message: 'action is required' } },
        { status: 400 }
      );
    }

    if (body.action === 'assign') {
      if (!body.ownerLogin) {
        return Response.json(
          { error: { code: 'VALIDATION_ERROR', message: 'ownerLogin is required for assign' } },
          { status: 400 }
        );
      }
      await updateTask({ id: params.id, ownerLogin: body.ownerLogin });
      return Response.json({ ok: true });
    }

    await mutateTaskFromAction(params.id, body.action);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      {
        error: {
          code: 'TASK_MUTATION_FAILED',
          message: error instanceof Error ? error.message : 'Task update failed',
        },
      },
      { status: 500 }
    );
  }
}`
);

// ── 4. page.tsx — drag-drop wiring + assign on priority items ────────────────
// 4a. Add draggedItem state
patch(
  'app/today/page.tsx',
  'page.tsx: add draggedItem state',
  `  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [droppedTasks, setDroppedTasks] = useState<V2DashboardTimelineItem[]>([]);`,
  `  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [droppedTasks, setDroppedTasks] = useState<V2DashboardTimelineItem[]>([]);
  const draggedItemRef = useRef<{ taskId: string; title: string; assignedBot: string } | null>(null);`
);

// 4b. Add handleAssignTask that calls the API
patch(
  'app/today/page.tsx',
  'page.tsx: add handleAssignTask',
  `  // ── Assign To → Reassign bot ──
  const handleAssign = useCallback(async (taskId: string, taskTitle: string, newBot: string) => {
    const botKey = BOT_TELEGRAM_KEY[newBot] ?? 'bot2';
    try {
      await fetch('/api/telegram/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: \`📌 New assignment: \${taskTitle}\\nPlease pick this up.\`, botKey }),
      });
      setToastMsg(\`"\${taskTitle}" assigned to \${newBot}\`);
    } catch { setToastMsg('Assignment failed'); }
    void mutate();
  }, [mutate]);`,
  `  // ── Assign To → Reassign bot (timeline items, Telegram only) ──
  const handleAssign = useCallback(async (taskId: string, taskTitle: string, newBot: string) => {
    const botKey = BOT_TELEGRAM_KEY[newBot] ?? 'bot2';
    try {
      await fetch('/api/telegram/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: \`📌 New assignment: \${taskTitle}\\nPlease pick this up.\`, botKey }),
      });
      setToastMsg(\`"\${taskTitle}" assigned to \${newBot}\`);
    } catch { setToastMsg('Assignment failed'); }
    void mutate();
  }, [mutate]);

  // ── Assign task-pool issue to bot (updates GitHub assignee) ──
  const handleAssignTask = useCallback(async (taskId: string, taskTitle: string, newBot: string) => {
    const ownerLogin = newBot.toLowerCase() === 'adobe' ? 'adobepettaway'
      : newBot.toLowerCase() === 'adrian' ? 'nuriygold'
      : newBot.toLowerCase();
    try {
      await fetch(\`/api/v2/tasks/\${taskId}\`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'assign', ownerLogin }),
      });
      const botKey = BOT_TELEGRAM_KEY[newBot] ?? 'bot2';
      await fetch('/api/telegram/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: \`📌 Assigned to you: \${taskTitle}\`, botKey }),
      }).catch(() => {});
      setToastMsg(\`"\${taskTitle}" assigned to \${newBot}\`);
    } catch { setToastMsg('Assignment failed'); }
    void mutate();
  }, [mutate]);`
);

// 4c. Wire drag-start on priority items and drop on timeline
patch(
  'app/today/page.tsx',
  'page.tsx: wire drag on priority items + drop into timeline',
  `              {availablePriorities.map((item) => {
                const borderColor = BOT_BORDER[item.assignedBot] ?? BOT_BORDER.default;
                const botC = BOT_COLORS[item.assignedBot];
                return (
                  <div key={item.id} className="flex items-center justify-between rounded-xl p-3 group"
                    style={{ border: '1px solid var(--border)', background: 'var(--input-background)', borderLeft: \`3px solid \${borderColor}\` }}>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--foreground)' }}>{item.title}</p>
                      <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{item.source}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {botC && (
                        <button onClick={() => handleBotTelegram(item.assignedBot, item.title)}
                          className="rounded-full px-2 py-0.5 text-[10px] font-medium hover:opacity-80 cursor-pointer"
                          style={{ background: botC.bg, color: botC.text }}
                          title={\`Message \${item.assignedBot} on Telegram\`}>
                          {item.assignedBot}
                        </button>
                      )}
                      <button className="rounded-full px-3 py-1.5 text-xs font-semibold hover:opacity-85"
                        style={{ background: 'var(--color-cyan)', color: '#0A0E1A' }}
                        onClick={async () => { await fetch(item.actionWebhook, { method: 'POST' }); void mutate(); }}>
                        Take Action
                      </button>
                    </div>
                  </div>
                );
              })}`,
  `              {availablePriorities.map((item) => {
                const borderColor = BOT_BORDER[item.assignedBot] ?? BOT_BORDER.default;
                const botC = BOT_COLORS[item.assignedBot];
                const isOverdue = item.dueAt && new Date(item.dueAt).getTime() < Date.now();
                return (
                  <div key={item.id}
                    draggable
                    onDragStart={() => {
                      draggedItemRef.current = {
                        taskId: item.taskId ?? item.id,
                        title: item.title,
                        assignedBot: item.assignedBot,
                      };
                    }}
                    onDragEnd={() => { draggedItemRef.current = null; }}
                    className="flex items-center justify-between rounded-xl p-3 group cursor-grab active:cursor-grabbing"
                    style={{
                      border: isOverdue ? '1.5px solid var(--color-peach-text)' : '1px solid var(--border)',
                      background: 'var(--input-background)',
                      borderLeft: \`3px solid \${borderColor}\`,
                    }}>
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <GripVertical className="w-3.5 h-3.5 flex-shrink-0 opacity-30 group-hover:opacity-60" style={{ color: 'var(--muted-foreground)' }} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--foreground)' }}>{item.title}</p>
                        <p className="text-xs" style={{ color: isOverdue ? 'var(--color-peach-text)' : 'var(--muted-foreground)' }}>
                          {isOverdue ? \`⚠ Overdue · \${item.source}\` : item.source}
                          {item.dueAt && !isOverdue && \` · Due \${new Date(item.dueAt).toLocaleDateString()}\`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {botC && (
                        <button onClick={() => handleBotTelegram(item.assignedBot, item.title)}
                          className="rounded-full px-2 py-0.5 text-[10px] font-medium hover:opacity-80 cursor-pointer"
                          style={{ background: botC.bg, color: botC.text }}
                          title={\`Message \${item.assignedBot} on Telegram\`}>
                          {item.assignedBot}
                        </button>
                      )}
                      {item.taskId && (
                        <AssignToDropdown
                          currentBot={item.assignedBot}
                          taskTitle={item.title}
                          onAssign={(bot) => handleAssignTask(item.taskId!, item.title, bot)}
                        />
                      )}
                      <button className="rounded-full px-3 py-1.5 text-xs font-semibold hover:opacity-85"
                        style={{ background: 'var(--color-cyan)', color: '#0A0E1A' }}
                        onClick={async () => { await fetch(item.actionWebhook, { method: 'POST' }); void mutate(); }}>
                        Act
                      </button>
                    </div>
                  </div>
                );
              })}`
);

// 4d. Wire drop handler on timeline entries
patch(
  'app/today/page.tsx',
  'page.tsx: wire drop onto timeline entries',
  `              {timeline.map((entry, idx) => {
                const isCurrent = entry.status === 'current';
                const isDone = entry.status === 'done';
                const isFocus = entry.type === 'focus-block';
                const isTask = entry.type === 'task';
                const botColors = entry.assignedBot ? BOT_COLORS[entry.assignedBot] : null;
                return (
                  <div key={\`\${entry.time}-\${entry.title}-\${idx}\`}>
                    {idx === nowIndex && <div ref={nowRef}><NowLine /></div>}
                    <div className="rounded-xl p-3 transition-all group"`,
  `              {timeline.map((entry, idx) => {
                const isCurrent = entry.status === 'current';
                const isDone = entry.status === 'done';
                const isFocus = entry.type === 'focus-block';
                const isTask = entry.type === 'task';
                const botColors = entry.assignedBot ? BOT_COLORS[entry.assignedBot] : null;
                return (
                  <div key={\`\${entry.time}-\${entry.title}-\${idx}\`}
                    onDragOver={(e) => { e.preventDefault(); setDragOverIdx(idx); }}
                    onDragLeave={() => setDragOverIdx(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOverIdx(null);
                      const dragged = draggedItemRef.current;
                      if (!dragged) return;
                      const dropTime = entry.startDate
                        ? new Date(entry.startDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                        : entry.time;
                      const newItem: V2DashboardTimelineItem = {
                        time: dropTime,
                        title: dragged.title,
                        iconType: 'clock',
                        status: 'upcoming',
                        type: 'task',
                        taskId: dragged.taskId,
                        assignedBot: dragged.assignedBot,
                        startDate: entry.startDate,
                        isDraggable: true,
                      };
                      setDroppedTasks((prev) => {
                        const filtered = prev.filter((t) => t.taskId !== dragged.taskId);
                        return [...filtered, newItem];
                      });
                      setToastMsg(\`"\${dragged.title}" added to timeline\`);
                      draggedItemRef.current = null;
                    }}>
                    {dragOverIdx === idx && (
                      <div className="h-1 rounded-full mx-2 mb-1" style={{ background: 'var(--color-cyan)', opacity: 0.7 }} />
                    )}
                    {idx === nowIndex && <div ref={nowRef}><NowLine /></div>}
                    <div className="rounded-xl p-3 transition-all group"`
);

// 4e. Merge droppedTasks into the timeline display
patch(
  'app/today/page.tsx',
  'page.tsx: merge droppedTasks into timeline',
  `  const feed = data;
  const priorities = feed?.topPriorities ?? [];
  const availablePriorities = priorities;
  const serverTimeline = feed?.timeline ?? [];

  // Apply completedIds overlay
  const timeline = useMemo(() => {
    return serverTimeline.map((item) => {
      if (item.taskId && completedIds.has(item.taskId)) {
        return { ...item, status: 'done' as const, iconType: 'check' as const };
      }
      return item;
    });
  }, [serverTimeline, completedIds]);`,
  `  const feed = data;
  const priorities = feed?.topPriorities ?? [];
  const availablePriorities = priorities;
  const serverTimeline = feed?.timeline ?? [];

  // Merge server timeline + locally dropped tasks, sorted by startDate
  const mergedTimeline = useMemo(() => {
    const serverIds = new Set(serverTimeline.map((t) => t.taskId).filter(Boolean));
    const newDropped = droppedTasks.filter((t) => !serverIds.has(t.taskId));
    return [...serverTimeline, ...newDropped].sort((a, b) => {
      const aT = a.startDate ? new Date(a.startDate).getTime() : 0;
      const bT = b.startDate ? new Date(b.startDate).getTime() : 0;
      return aT - bT;
    });
  }, [serverTimeline, droppedTasks]);

  // Apply completedIds overlay
  const timeline = useMemo(() => {
    return mergedTimeline.map((item) => {
      if (item.taskId && completedIds.has(item.taskId)) {
        return { ...item, status: 'done' as const, iconType: 'check' as const };
      }
      return item;
    });
  }, [mergedTimeline, completedIds]);`
);

if (errors > 0) {
  console.error(`\n${errors} patch(es) failed. Check above for details.`);
  process.exit(1);
}

console.log('\nAll patches applied. Run:\n  git add -A && git commit -m "Drag-drop tasks to timeline, assign button, 10 tasks sorted by due date" && git push');
