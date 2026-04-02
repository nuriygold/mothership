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

export default function CommandCenterPage() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['commands'], queryFn: fetchCommands });
  const [input, setInput] = useState('');
  const [source, setSource] = useState('web');
  const [telegramMessage, setTelegramMessage] = useState('');
  const [telegramBot, setTelegramBot] = useState('bot2');

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
        <CardTitle>Telegram dispatch</CardTitle>
        <div className="mt-3 space-y-3">
          <textarea
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-white"
            rows={3}
            placeholder="Send a quick update or instruction to Telegram"
            value={telegramMessage}
            onChange={(e) => setTelegramMessage(e.target.value)}
          />
          <div className="flex items-center gap-3">
            <select
              className="rounded-md border border-border bg-surface px-2 text-sm"
              value={telegramBot}
              onChange={(e) => setTelegramBot(e.target.value)}
            >
              <option value="bot1">Bot 1</option>
              <option value="bot2">Bot 2 (default)</option>
              <option value="bot3">Bot 3</option>
            </select>
            <Button
              onClick={() => telegramMutation.mutate({ text: telegramMessage, botKey: telegramBot })}
              disabled={!telegramMessage || telegramMutation.isLoading}
            >
              Send
            </Button>
            {telegramMutation.isSuccess && (
              <p className="text-xs text-emerald-300">Sent to Telegram.</p>
            )}
            {telegramMutation.isError && (
              <p className="text-xs text-rose-400">Failed: {(telegramMutation.error as Error).message}</p>
            )}
          </div>
        </div>
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
