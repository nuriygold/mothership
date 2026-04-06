#!/usr/bin/env node
// fix-focus-scroll.js
// Fix 1: Focus block detection for single-event days
// Fix 2: Auto-scroll to NOW line fires on nowIndex, not data

const fs = require('fs');
const path = require('path');

const ROOT = '/Users/claw/mothership-main';

// ── Fix 1: orchestrator.ts ────────────────────────────────────────────────────
const orchPath = path.join(ROOT, 'lib/v2/orchestrator.ts');
let orch = fs.readFileSync(orchPath, 'utf8');

const OLD_FOCUS = `  // 3. Detect focus blocks (gaps > 30 min between calendar events)
  if (calEvents.length >= 2) {
    const sorted = [...calEvents].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    for (let i = 0; i < sorted.length - 1; i++) {
      const endCurrent = sorted[i].endDate ?? sorted[i].startDate;
      const startNext = sorted[i + 1].startDate;
      const gapMs = new Date(startNext).getTime() - new Date(endCurrent).getTime();
      const gapMin = gapMs / 60000;
      if (gapMin >= 30) {
        const focusStart = new Date(endCurrent);
        const gapHours = Math.floor(gapMin / 60);
        const gapRemMin = Math.round(gapMin % 60);
        const durationLabel = gapHours > 0
          ? \`\${gapHours}h\${gapRemMin > 0 ? \` \${gapRemMin}m\` : ''}\`
          : \`\${gapRemMin}m\`;
        items.push({
          time: focusStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
          title: \`Focus Block — \${durationLabel} available\`,
          iconType: 'focus',
          status: now > new Date(startNext) ? 'done' : now >= focusStart ? 'current' : 'upcoming',
          type: 'focus-block',
          startDate: focusStart.toISOString(),
          endDate: startNext,
          isDraggable: false,
        });
      }
    }
  }`;

const NEW_FOCUS = `  // 3. Detect focus blocks (gaps > 30 min between calendar events, or after a single event through end of day)
  if (calEvents.length >= 1) {
    const tzLabel2 = process.env.APP_TIMEZONE || 'America/New_York';
    const localDateStr2 = now.toLocaleDateString('en-CA', { timeZone: tzLabel2 });
    const endOfDay = new Date(\`\${localDateStr2}T23:59:59\`);

    const sorted = [...calEvents].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

    // Check gaps between consecutive events
    for (let i = 0; i < sorted.length - 1; i++) {
      const endCurrent = sorted[i].endDate ?? sorted[i].startDate;
      const startNext = sorted[i + 1].startDate;
      const gapMs = new Date(startNext).getTime() - new Date(endCurrent).getTime();
      const gapMin = gapMs / 60000;
      if (gapMin >= 30) {
        const focusStart = new Date(endCurrent);
        const gapHours = Math.floor(gapMin / 60);
        const gapRemMin = Math.round(gapMin % 60);
        const durationLabel = gapHours > 0
          ? \`\${gapHours}h\${gapRemMin > 0 ? \` \${gapRemMin}m\` : ''}\`
          : \`\${gapRemMin}m\`;
        items.push({
          time: focusStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tzLabel2 }),
          title: \`Focus Block — \${durationLabel} available\`,
          iconType: 'focus',
          status: now > new Date(startNext) ? 'done' : now >= focusStart ? 'current' : 'upcoming',
          type: 'focus-block',
          startDate: focusStart.toISOString(),
          endDate: startNext,
          isDraggable: false,
        });
      }
    }

    // Check gap after the last event through end of day
    const lastEvent = sorted[sorted.length - 1];
    const lastEnd = lastEvent.endDate ?? lastEvent.startDate;
    const gapAfterMs = endOfDay.getTime() - new Date(lastEnd).getTime();
    const gapAfterMin = gapAfterMs / 60000;
    if (gapAfterMin >= 30) {
      const focusStart = new Date(lastEnd);
      const gapHours = Math.floor(gapAfterMin / 60);
      const gapRemMin = Math.round(gapAfterMin % 60);
      const durationLabel = gapHours > 0
        ? \`\${gapHours}h\${gapRemMin > 0 ? \` \${gapRemMin}m\` : ''}\`
        : \`\${gapRemMin}m\`;
      items.push({
        time: focusStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tzLabel2 }),
        title: \`Focus Block — \${durationLabel} available\`,
        iconType: 'focus',
        status: now > endOfDay ? 'done' : now >= focusStart ? 'current' : 'upcoming',
        type: 'focus-block',
        startDate: focusStart.toISOString(),
        endDate: endOfDay.toISOString(),
        isDraggable: false,
      });
    }
  }`;

if (!orch.includes(OLD_FOCUS)) {
  console.error('❌ orchestrator.ts: focus block target not found — check for prior edits');
  process.exit(1);
}
orch = orch.replace(OLD_FOCUS, NEW_FOCUS);
fs.writeFileSync(orchPath, orch);
console.log('✅ orchestrator.ts: focus block detection updated');

// ── Fix 2: page.tsx auto-scroll ───────────────────────────────────────────────
const pagePath = path.join(ROOT, 'app/today/page.tsx');
let page = fs.readFileSync(pagePath, 'utf8');

const OLD_SCROLL = `  // Auto-scroll to now-line on load
  useEffect(() => {
    if (nowRef.current) nowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [data]);`;

const NEW_SCROLL = `  // Auto-scroll to now-line on load (depends on nowIndex so it fires when position is known)
  useEffect(() => {
    if (nowRef.current) nowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [nowIndex]);`;

if (!page.includes(OLD_SCROLL)) {
  console.error('❌ page.tsx: auto-scroll target not found — check for prior edits');
  process.exit(1);
}
page = page.replace(OLD_SCROLL, NEW_SCROLL);
fs.writeFileSync(pagePath, page);
console.log('✅ page.tsx: auto-scroll dependency updated to [nowIndex]');

console.log('\nDone. Run: git add -A && git commit -m "Fix focus blocks for single-event days + auto-scroll to NOW" && git push');
