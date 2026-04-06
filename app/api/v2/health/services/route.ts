import { NextResponse } from 'next/server';
import { checkGateway } from '@/lib/services/openclaw';
import { getEmailSummary } from '@/lib/services/email';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

async function checkRuby(): Promise<{ ok: boolean; reason?: string }> {
  try {
    const count = await prisma.task.count();
    return { ok: true, reason: `${count} tasks tracked in DB` };
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
  const repo = process.env.GITHUB_TASK_REPO ?? process.env.GITHUB_REPO;
  if (!token) return { ok: false, reason: 'GITHUB_TOKEN not configured' };
  try {
    const url = repo ? `https://api.github.com/repos/${repo}` : 'https://api.github.com/user';
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'Mothership/1.0' },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { ok: false, reason: `GitHub API returned ${res.status}` };
    return { ok: true, reason: repo ? `Repo ${repo} accessible` : 'Authenticated' };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

async function checkZoho(): Promise<{ ok: boolean; reason?: string }> {
  const user = process.env.ZOHO_EMAIL_USER ?? process.env.ZOHO_IMAP_USER;
  const pass = process.env.ZOHO_EMAIL_PASS ?? process.env.ZOHO_IMAP_PASS ?? process.env.ZOHO_APP_PASSWORD;
  if (!user || !pass) return { ok: false, reason: 'ZOHO_EMAIL_USER or ZOHO_EMAIL_PASS not configured' };
  // Credentials present — mark as configured (IMAP test requires a network TCP call, not safe in serverless)
  return { ok: true, reason: `Configured for ${user}` };
}

async function checkGmail(): Promise<{ ok: boolean; reason?: string }> {
  try {
    const summary = await getEmailSummary();
    if (summary.connected) return { ok: true, reason: 'OAuth token valid, inbox reachable' };
    return { ok: false, reason: summary.note ?? 'Gmail OAuth token invalid or expired' };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
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
