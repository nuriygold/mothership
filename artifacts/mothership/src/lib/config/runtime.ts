import os from 'node:os';
import path from 'node:path';
import { DEFAULT_APP_TIMEZONE } from '@/lib/constants/time';

export const DEFAULT_OPENCLAW_STREAMS_PATH = path.join(
  os.homedir(),
  '.openclaw',
  'workspace',
  'revenue_streams',
);

export function getAppTimezone(): string {
  return process.env.APP_TIMEZONE?.trim() || DEFAULT_APP_TIMEZONE;
}

export function getOpenClawStreamsPath(): string {
  return process.env.OPENCLAW_STREAMS_PATH?.trim() || DEFAULT_OPENCLAW_STREAMS_PATH;
}
