import fs from 'node:fs/promises';
import path from 'node:path';
import type { UiWatchdogRun } from './types';

export const UI_WATCHDOG_DIR = path.resolve(process.cwd(), 'runtime/ui-watchdog');

export async function ensureUiWatchdogDir() {
  await fs.mkdir(UI_WATCHDOG_DIR, { recursive: true });
}

export async function writeUiWatchdogRun(run: UiWatchdogRun) {
  await ensureUiWatchdogDir();
  const runDir = path.join(UI_WATCHDOG_DIR, run.runId);
  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(path.join(runDir, 'summary.json'), JSON.stringify(run, null, 2));
  await fs.writeFile(path.join(UI_WATCHDOG_DIR, 'latest.json'), JSON.stringify(run, null, 2));
  return { runDir, latestPath: path.join(UI_WATCHDOG_DIR, 'latest.json') };
}

export async function readLatestUiWatchdogRun(): Promise<UiWatchdogRun | null> {
  try {
    const raw = await fs.readFile(path.join(UI_WATCHDOG_DIR, 'latest.json'), 'utf8');
    return JSON.parse(raw) as UiWatchdogRun;
  } catch {
    return null;
  }
}
