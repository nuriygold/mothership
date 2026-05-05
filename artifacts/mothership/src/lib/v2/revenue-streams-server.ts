// Server-only — uses fs. Do not import from client components.
import { promises as fs } from 'fs';
import path from 'path';
import { REVENUE_STREAMS, type RevenueStreamDef } from './revenue-streams';

export const OPENCLAW_STREAMS_PATH = '/Users/claw/.openclaw/workspace/revenue_streams';

// Known folder→key mappings to preserve existing DB records
const FOLDER_KEY_MAP: Record<string, string> = {
  Shopify: 'shopify',
  TikTok: 'tiktok',
  NuriyProduct: 'nuriy-product',
  Truckstop: 'truckstop',
  Notary: 'notary',
};

const LEAD_MAP: Record<string, RevenueStreamDef['leadBotKey']> = {
  shopify: 'adrian',
  tiktok: 'ruby',
  'nuriy-product': 'emerald',
  truckstop: 'adrian',
  notary: 'adobe',
};

const LEAD_DISPLAY: Record<RevenueStreamDef['leadBotKey'], string> = {
  adrian: 'Drake',
  ruby: 'Drizzy',
  emerald: 'Champagne Papi',
  adobe: 'Aubrey Graham',
  anchor: '6 God',
};

function folderToKey(name: string): string {
  return FOLDER_KEY_MAP[name] ?? name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

function folderToDisplay(name: string): string {
  return name.replace(/([a-z])([A-Z])/g, '$1 $2');
}

export type StreamDef = RevenueStreamDef & { folderName: string };

export type StreamSnapshot = {
  status: string | null;
  mtd: string | null;
  ytd: string | null;
  note: string | null;
  updated: string | null;
};

/*
 * Expected live-snapshot.md frontmatter format (bots write this):
 *
 * ---
 * status: active
 * mtd: $4,200
 * ytd: $38,500
 * note: Q2 campaign running, 3 orders pending
 * updated: 2026-04-23
 * ---
 *
 * Everything below the closing --- is free-form markdown content.
 */
function parseFrontmatter(content: string): Omit<StreamSnapshot, 'updated'> & { updated: string | null } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return { status: null, mtd: null, ytd: null, note: null, updated: null };
  const fields: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    fields[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }
  return {
    status: fields.status ?? null,
    mtd: fields.mtd ?? null,
    ytd: fields.ytd ?? null,
    note: fields.note ?? null,
    updated: fields.updated ?? null,
  };
}

export async function getStreamDefs(): Promise<StreamDef[]> {
  try {
    const entries = await fs.readdir(OPENCLAW_STREAMS_PATH, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory());
    if (dirs.length === 0) return REVENUE_STREAMS.map((s) => ({ ...s, folderName: s.displayName }));
    return dirs.map((dir) => {
      const key = folderToKey(dir.name);
      const leadBotKey = LEAD_MAP[key] ?? 'anchor';
      return {
        key,
        displayName: folderToDisplay(dir.name),
        leadBotKey,
        leadDisplay: LEAD_DISPLAY[leadBotKey],
        sopPath: path.join(OPENCLAW_STREAMS_PATH, dir.name, 'README.md'),
        reportPrompt: `Generate a brief revenue report for the ${folderToDisplay(dir.name)} stream: current status, recent performance, and any operational issues or opportunities.`,
        statusPrompt: `What is the current status of the ${folderToDisplay(dir.name)} revenue stream? Any pending actions or issues that need attention?`,
        folderName: dir.name,
      };
    });
  } catch {
    return REVENUE_STREAMS.map((s) => ({ ...s, folderName: s.displayName }));
  }
}

export async function readSnapshot(folderName: string): Promise<StreamSnapshot> {
  const snapshotPath = path.join(OPENCLAW_STREAMS_PATH, folderName, 'live-snapshot.md');
  try {
    const [content, stat] = await Promise.all([
      fs.readFile(snapshotPath, 'utf-8'),
      fs.stat(snapshotPath),
    ]);
    const parsed = parseFrontmatter(content);
    return {
      ...parsed,
      updated: parsed.updated ?? stat.mtime.toISOString(),
    };
  } catch {
    return { status: null, mtd: null, ytd: null, note: null, updated: null };
  }
}

export async function streamDefByKey(key: string): Promise<StreamDef | undefined> {
  const defs = await getStreamDefs();
  return defs.find((d) => d.key === key);
}
