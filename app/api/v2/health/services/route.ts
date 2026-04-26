import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { tasks } from '@/lib/db/schema';
import { checkGateway } from '@/lib/services/openclaw';
import { checkGmailConnectivity, checkZohoConnectivity } from '@/lib/services/email';

export const dynamic = 'force-dynamic';

async function checkRuby(): Promise<{ ok: boolean; reason?: string }> {
  try {
    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(tasks);
    return { ok: true, reason: `${Number(count)} tasks tracked in DB` };
  } catch (err) {
    return { ok: false, reason: `DB unreachable: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function checkTelegram(): Promise<{ ok: boolean; reason?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, reason: 'TELEGRAM_BOT_TOKEN not configured' };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { ok: false, reason: `API returned ${res.status}` };
    const data = await res.json();
    return { ok: data.ok === true, reason: data.ok ? `Bot: @${data.result?.username}` : data.description };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

async function checkGitHub(): Promise<{ ok: boolean; reason?: string }> {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.TASK_POOL_REPO_OWNER ?? 'nuriygold';
  const repoName = process.env.TASK_POOL_REPO_NAME ?? 'task-pool';
  const repo = `${owner}/${repoName}`;
  if (!token) return { ok: false, reason: 'GITHUB_TOKEN not configured' };
  try {
    const url = `https://api.github.com/repos/${repo}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'Mothership/1.0' },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { ok: false, reason: `GitHub API returned ${res.status}` };
    return { ok: true, reason: `Repo ${repo} accessible` };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

async function checkZoho(): Promise<{ ok: boolean; reason?: string }> {
  const status = await checkZohoConnectivity();
  return { ok: status.connected, reason: status.note };
}

async function checkGmail(): Promise<{ ok: boolean; reason?: string }> {
  const status = await checkGmailConnectivity();
  return { ok: status.connected, reason: status.note };
}

export async function GET() {
  const [gateway, ruby, telegram, github, zoho, gmail] = await Promise.allSettled([
    checkGateway(),
    checkRuby(),
    checkTelegram(),
    checkGitHub(),
    checkZoho(),
    checkGmail(),
  ]);

  const resolve = (r: PromiseSettledResult<{ ok: boolean; reason?: string }>) =>
    r.status === 'fulfilled' ? r.value : { ok: false, reason: r.reason?.message ?? 'Check failed' };

  return NextResponse.json({
    gateway: resolve(gateway),
    ruby:    resolve(ruby),
    telegram: resolve(telegram),
    github:  resolve(github),
    zoho:    resolve(zoho),
    gmail:   resolve(gmail),
  });
}
