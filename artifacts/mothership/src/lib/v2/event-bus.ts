type BusEvent = {
  type: string;
  payload: unknown;
  createdAt: string;
};

type Listener = (event: BusEvent) => void;

const listeners = new Map<string, Set<Listener>>();

function channel(name: string) {
  if (!listeners.has(name)) {
    listeners.set(name, new Set());
  }
  return listeners.get(name)!;
}

export function publishV2Event(stream: string, type: string, payload: unknown) {
  const evt: BusEvent = {
    type,
    payload,
    createdAt: new Date().toISOString(),
  };
  for (const listener of channel(stream)) {
    listener(evt);
  }
}

export function createSseStream(stream: string) {
  const encoder = new TextEncoder();
  let keepAlive: NodeJS.Timeout | null = null;

  return new ReadableStream({
    start(controller) {
      const write = (event: BusEvent) => {
        const payload =
          event.payload && typeof event.payload === 'object'
            ? event.payload
            : { value: event.payload };
        controller.enqueue(
          encoder.encode(
            `event: ${event.type}\ndata: ${JSON.stringify({
              ...payload,
              createdAt: event.createdAt,
            })}\n\n`
          )
        );
      };

      const set = channel(stream);
      set.add(write);

      keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(`event: heartbeat\ndata: {}\n\n`));
      }, 15000);

      controller.enqueue(encoder.encode(`event: connected\ndata: {"stream":"${stream}"}\n\n`));

      return () => {
        if (keepAlive) clearInterval(keepAlive);
        set.delete(write);
      };
    },
    cancel() {
      if (keepAlive) clearInterval(keepAlive);
    },
  });
}

export function sseResponse(stream: string) {
  return new Response(createSseStream(stream), {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
