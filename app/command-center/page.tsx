'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Card, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

async function fetchCommands() {
  const res = await fetch('/api/commands');
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

export default function CommandCenterPage() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['commands'], queryFn: fetchCommands });
  const [input, setInput] = useState('');
  const [source, setSource] = useState('web');

  const mutation = useMutation({
    mutationFn: postCommand,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['commands'] });
      setInput('');
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle>Command input</CardTitle>
        <div className="mt-3 flex gap-2">
          <input
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-white"
            placeholder="Send instruction to OpenClaw/Dispatch-Bot bridge"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <select
            className="rounded-md border border-border bg-surface px-2 text-sm"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          >
            <option value="web">web</option>
            <option value="telegram">telegram</option>
            <option value="api">api</option>
          </select>
          <Button onClick={() => mutation.mutate({ input, sourceChannel: source })} disabled={!input}>Submit</Button>
        </div>
        {mutation.isSuccess && (
          <p className="mt-2 text-xs text-emerald-300">Command accepted and logged.</p>
        )}
      </Card>

      <Card>
        <CardTitle>Recent commands</CardTitle>
        <div className="mt-3 space-y-3">
          {(data ?? []).map((cmd: any) => (
            <div key={cmd.id} className="rounded-lg border border-border p-3">
              <p className="text-sm text-white">{cmd.input}</p>
              <p className="text-xs text-slate-400">{cmd.sourceChannel} • {cmd.status}</p>
              {cmd.run && <p className="text-xs text-slate-500">Run: {cmd.run.type}</p>}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
