import type { NextApiRequest, NextApiResponse } from 'next';
import type { Server as HTTPServer } from 'http';
import type { Socket } from 'net';
import { WebSocketServer, WebSocket } from 'ws';

type SocketWithServer = Socket & {
  server: HTTPServer & { _voiceWss?: WebSocketServer };
};

export const config = { api: { bodyParser: false } };

function buildAzureWsUrl(endpoint: string, deployment: string) {
  const base = endpoint.replace(/^https?:\/\//, '').replace(/\/$/, '');
  // AZURE_OPENAI_REALTIME_WS_PATH overrides the path if VoiceLive uses a different URL structure.
  // Default matches Azure AI Speech VoiceLive (cognitiveservices.azure.com) and Azure OpenAI Realtime.
  const path = (process.env.AZURE_OPENAI_REALTIME_WS_PATH ?? 'openai/realtime').replace(/^\//, '');
  return `wss://${base}/${path}?api-version=2024-10-01-preview&deployment=${encodeURIComponent(deployment)}`;
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const endpoint = process.env.AZURE_OPENAI_REALTIME_ENDPOINT;
  const key = process.env.AZURE_OPENAI_REALTIME_KEY;
  const deployment = process.env.AZURE_OPENAI_REALTIME_DEPLOYMENT ?? 'gpt-4o-realtime-preview';

  const socket = res.socket as SocketWithServer;

  if (!socket?.server) {
    res.status(500).end('No server');
    return;
  }

  if (!endpoint || !key) {
    res.status(503).end('AZURE_OPENAI_REALTIME_ENDPOINT and AZURE_OPENAI_REALTIME_KEY not configured');
    return;
  }

  // Only attach the WSS once per server instance
  if (!socket.server._voiceWss) {
    const wss = new WebSocketServer({ noServer: true });
    socket.server._voiceWss = wss;

    socket.server.on('upgrade', (request, sock, head) => {
      if (new URL(request.url ?? '', 'http://x').pathname === '/api/voice/realtime') {
        wss.handleUpgrade(request, sock, head, (client) => {
          wss.emit('connection', client);
        });
      }
    });

    wss.on('connection', (clientWs) => {
      const azureUrl = buildAzureWsUrl(endpoint, deployment);

      const azureWs = new WebSocket(azureUrl, {
        headers: { 'api-key': key },
      });

      azureWs.on('message', (data) => {
        if (clientWs.readyState === WebSocket.OPEN) clientWs.send(data);
      });

      clientWs.on('message', (data) => {
        if (azureWs.readyState === WebSocket.OPEN) azureWs.send(data);
      });

      azureWs.on('error', (err) => {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({ type: 'error', error: { message: err.message } }));
        }
        clientWs.close(1011);
      });

      const teardown = () => {
        if (azureWs.readyState < WebSocket.CLOSING) azureWs.close();
        if (clientWs.readyState < WebSocket.CLOSING) clientWs.close();
      };

      azureWs.on('close', teardown);
      clientWs.on('close', teardown);
    });
  }

  res.end();
}
