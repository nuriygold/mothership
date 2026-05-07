import type { V2ErrorResponse } from './types.js';


type NodeEnvLike = Record<string, string | undefined>;
declare const process: { env: NodeEnvLike };

function jsonError(code: string, message: string, status: number) {
  return Response.json(
    {
      error: { code, message },
    } satisfies V2ErrorResponse,
    { status }
  );
}

export function ensureV2Authorized(req: Request) {
  const requiredKey = process.env.MOTHERSHIP_V2_API_KEY;
  if (!requiredKey) {
    return null;
  }

  const providedKey = req.headers.get('x-mothership-v2-key');
  if (!providedKey || providedKey !== requiredKey) {
    return jsonError('UNAUTHORIZED', 'Missing or invalid API key.', 401);
  }

  return null;
}

export function withErrorEnvelope<TArgs extends unknown[]>(handler: (...args: TArgs) => Promise<Response>) {
  return async (...args: TArgs) => {
    try {
      return await handler(...args);
    } catch (error) {
      return jsonError(
        'INTERNAL_ERROR',
        error instanceof Error ? error.message : 'Unexpected error',
        500
      );
    }
  };
}

