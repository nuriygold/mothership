'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

type Status = 'idle' | 'connecting' | 'connected' | 'error';

interface Props {
  serverUrl: string;
  token: string;
  sessionId: string | null;
}

export default function TerminalView({ serverUrl, token, sessionId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [remoteSessionId, setRemoteSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      theme: {
        background: '#0b0f17',
        foreground: '#e0e6f0',
        cursor: '#38b8da',
        selectionBackground: 'rgba(56,184,218,0.3)',
        black: '#0b0f17',
        brightBlack: '#4a5270',
        red: '#ff6b6b',
        brightRed: '#ff8080',
        green: '#a8ff78',
        brightGreen: '#c5f5a0',
        yellow: '#ffd97d',
        brightYellow: '#ffe8a0',
        blue: '#38b8da',
        brightBlue: '#6fd3f0',
        magenta: '#c9a0dc',
        brightMagenta: '#dbbcee',
        cyan: '#7ee8e8',
        brightCyan: '#a0f0f0',
        white: '#e0e6f0',
        brightWhite: '#ffffff',
      },
      fontFamily: '"IBM Plex Mono", "Cascadia Code", monospace',
      fontSize: 14,
      lineHeight: 1.4,
      cursorBlink: true,
      scrollback: 10000,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    termRef.current = term;
    fitRef.current = fit;

    const ro = new ResizeObserver(() => { try { fit.fit(); } catch {} });
    if (containerRef.current) ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      term.dispose();
      wsRef.current?.close();
    };
  }, []);

  const connect = useCallback(() => {
    if (!serverUrl || !termRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus('connecting');
    setError(null);

    const params = new URLSearchParams();
    if (token) params.set('token', token);
    if (sessionId) params.set('sessionId', sessionId);

    let ws: WebSocket;
    try {
      ws = new WebSocket(`${serverUrl}/ws?${params}`);
    } catch {
      setError('Invalid server URL');
      setStatus('error');
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => setStatus('connected');

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string);
        if (msg.type === 'output') termRef.current?.write(msg.data as string);
        if (msg.type === 'connected') setRemoteSessionId(msg.sessionId as string);
        if (msg.type === 'exit') {
          termRef.current?.write('\r\n\x1b[33m[process exited]\x1b[0m\r\n');
          setStatus('idle');
        }
      } catch {}
    };

    ws.onerror = () => {
      setError(`Cannot reach ${serverUrl}`);
      setStatus('error');
    };

    ws.onclose = () => {
      setStatus((s) => (s === 'connected' ? 'idle' : s));
    };

    termRef.current.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'input', data }));
    });

    termRef.current.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'resize', cols, rows }));
    });
  }, [serverUrl, token, sessionId]);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    setStatus('idle');
    setRemoteSessionId(null);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{
        padding: '8px 16px',
        background: 'rgba(20,25,35,0.8)',
        borderBottom: '1px solid #1e2235',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexShrink: 0,
      }}>
        <div style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: status === 'connected' ? '#4ade80' : status === 'connecting' ? '#fbbf24' : status === 'error' ? '#f87171' : '#4a5270',
          flexShrink: 0,
        }} />
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', flex: 1, fontFamily: 'monospace' }}>
          {status === 'connected' && remoteSessionId ? `session: ${remoteSessionId}` :
           status === 'connecting' ? 'Connecting…' :
           status === 'error' ? (error ?? 'Connection error') :
           serverUrl || 'No server configured'}
        </span>
        {status !== 'connected' ? (
          <button
            onClick={connect}
            disabled={status === 'connecting' || !serverUrl}
            style={{
              background: status === 'connecting' ? 'rgba(255,255,255,0.1)' : '#38b8da',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              padding: '4px 12px',
              fontSize: 12,
              cursor: status === 'connecting' || !serverUrl ? 'default' : 'pointer',
              opacity: !serverUrl ? 0.4 : 1,
            }}
          >
            {status === 'connecting' ? 'Connecting…' : 'Connect'}
          </button>
        ) : (
          <button
            onClick={disconnect}
            style={{
              background: 'rgba(255,107,107,0.15)',
              color: '#ff6b6b',
              border: '1px solid rgba(255,107,107,0.3)',
              borderRadius: 6,
              padding: '4px 12px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Disconnect
          </button>
        )}
      </div>

      <div
        ref={containerRef}
        style={{ flex: 1, minHeight: 0, padding: '8px 4px', background: '#0b0f17' }}
      />
    </div>
  );
}
