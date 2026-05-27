import type { UiWatchdogRun } from './types';
import { readLatestUiWatchdogRun } from './store';

export async function getUiWatchdogState(): Promise<UiWatchdogRun | null> {
  return readLatestUiWatchdogRun();
}
