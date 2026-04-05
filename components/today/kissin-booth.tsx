'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Card, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

async function fetchCommands() {
  const res = await fetch('/api/commands');
  return res.json();
}

async function postCommand(payload: { input: string; sourceChannel: string }) {
  const res = await fetch('/api/commands', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? 'Failed to send command');
  }

  return res.json();
}

export function KissinBooth() {
  const [prompt, setPrompt] = useState('');
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ['booth-commands'], queryFn: fetchCommands });

  const mutation = useMutation({
    mutationFn: postCommand,
    onSuccess: () => {
      setPrompt('');
      queryClient.invalidateQueries({ queryKey: ['booth-commands'] });
    },
  });

  const commands = (data ?? []) as Array<{ id: string; input: string; status: string; sourceChannel: string }>;

  return (
    <Card>
      <CardTitle>The Kissin&apos; Booth</CardTitle>
      <p className="mt-1 text-xs text-slate-500">Chat interface for quick dispatches to your operations layer.</p>

      <div className="mt-3 flex gap-2">
        <input
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          className="w-full rounded-md border border-border bg-[var(--input-background)] px-3 py-2 text-sm text-slate-900"
          placeholder="Ask Mothership to do something now..."
        />
        <Button
          onClick={() => mutation.mutate({ input: prompt, sourceChannel: 'today-booth' })}
          disabled={!prompt.trim() || mutation.isLoading}
        >
          Send
        </Button>
      </div>

      {mutation.isError && (
        <p className="mt-2 text-xs text-rose-500">{String(mutation.error)}</p>
      )}

      <div className="mt-3 space-y-2">
        {commands.slice(0, 3).map((command) => (
          <div key={command.id} className="rounded-lg border border-border bg-[var(--input-background)] p-2">
            <p className="truncate text-xs font-semibold text-slate-800">{command.input}</p>
            <p className="text-[11px] text-slate-500">
              {command.sourceChannel} • {command.status}
            </p>
          </div>
        ))}
        {commands.length === 0 && <p className="text-xs text-slate-500">No booth activity yet.</p>}
      </div>
    </Card>
  );
}
