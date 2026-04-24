import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { dispatchCampaigns, dispatchTasks } from '@/lib/db/schema';
import { writeCampaignOutput, getCampaignOutputDir, zipCampaignOutputDir, campaignOutputDirName } from '@/lib/services/campaign-output';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dispatch/campaigns/[id]/download
 *   ?task=<taskId>   → serves that task's .md file as plain text
 *   (no query)       → ensures output dir exists, then serves a zip
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get('task');

    const [campaign] = await db
      .select()
      .from(dispatchCampaigns)
      .where(eq(dispatchCampaigns.id, params.id))
      .limit(1);
    if (!campaign) {
      return NextResponse.json({ ok: false, message: 'Campaign not found' }, { status: 404 });
    }

    const tasks = await db
      .select()
      .from(dispatchTasks)
      .where(eq(dispatchTasks.campaignId, campaign.id))
      .orderBy(asc(dispatchTasks.priority), asc(dispatchTasks.createdAt));

    // Ensure the output dir is written
    let outputDir = await getCampaignOutputDir(params.id);
    if (!outputDir) {
      outputDir = await writeCampaignOutput(params.id);
    }
    if (!outputDir) {
      return NextResponse.json({ ok: false, message: 'Could not write output files' }, { status: 500 });
    }

    // Single task .md download
    if (taskId) {
      const taskIndex = tasks.findIndex((t) => t.id === taskId);
      if (taskIndex === -1) {
        return NextResponse.json({ ok: false, message: 'Task not found' }, { status: 404 });
      }
      const task = tasks[taskIndex];
      const slug = task.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
      const filename = `${String(taskIndex + 1).padStart(2, '0')}-${slug}.md`;
      const filePath = path.join(outputDir, filename);
      if (!fs.existsSync(filePath)) {
        return NextResponse.json({ ok: false, message: 'File not found' }, { status: 404 });
      }
      const content = fs.readFileSync(filePath, 'utf-8');
      return new Response(content, {
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    // Full campaign zip
    const zipBuf = zipCampaignOutputDir(outputDir);
    if (!zipBuf) {
      return NextResponse.json({ ok: false, message: 'Failed to create zip archive' }, { status: 500 });
    }
    const zipName = `${campaignOutputDirName(campaign.title, campaign.createdAt)}.zip`;
    return new Response(new Uint8Array(zipBuf), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${zipName}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
