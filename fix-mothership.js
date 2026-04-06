// Run this FROM /Users/claw/mothership-main:
//   node fix-mothership.js
//
// Then: git add -A && git commit -m "Fix timezone drift and surface calendar errors" && git push origin main

const fs = require('fs');

// ── 1. lib/services/calendar.ts ─────────────────────────────────────────────
let cal = fs.readFileSync('lib/services/calendar.ts', 'utf8');

cal = cal.replace(
  'function isCalendarConfigured(): boolean {',
  'export function isCalendarConfigured(): boolean {'
);

cal = cal.replace(
  'export async function fetchTodayCalendarEvents(): Promise<CalendarEvent[]> {',
  'export async function fetchTodayCalendarEvents(): Promise<{ events: CalendarEvent[]; error?: string }> {'
);

cal = cal.replace(
  '  if (!isCalendarConfigured()) {\n    return [];\n  }',
  [
    '  if (!isCalendarConfigured()) {',
    "    const missing = [",
    "      !process.env.GOOGLE_CLIENT_ID && 'GOOGLE_CLIENT_ID',",
    "      !process.env.GOOGLE_CLIENT_SECRET && 'GOOGLE_CLIENT_SECRET',",
    "      !process.env.GOOGLE_REFRESH_TOKEN && 'GOOGLE_REFRESH_TOKEN',",
    '    ].filter(Boolean);',
    '    return { events: [], error: `Missing env vars: ${missing.join(", ")}` };',
    '  }',
  ].join('\n')
);

cal = cal.replace('    return items', '    const events = items');
cal = cal.replace('      });\n  } catch', '      });\n    return { events };\n  } catch');

// Add message variable if not present
if (!cal.includes('const message = err instanceof Error')) {
  cal = cal.replace(
    '    console.error(\n',
    '    const message = err instanceof Error ? err.message : String(err);\n    console.error(\n'
  );
  cal = cal.replace(
    'message: err instanceof Error ? err.message : String(err),',
    'message,'
  );
}

cal = cal.replace(
  '    return [];\n  }\n}',
  '    return { events: [], error: message };\n  }\n}'
);

fs.writeFileSync('lib/services/calendar.ts', cal);
console.log('checkmark lib/services/calendar.ts');

// ── 2. app/api/v2/calendar/events/route.ts ──────────────────────────────────
let route = fs.readFileSync('app/api/v2/calendar/events/route.ts', 'utf8');

route = route.replace(
  "import { fetchTodayCalendarEvents } from '@/lib/services/calendar';",
  "import { fetchTodayCalendarEvents, isCalendarConfigured } from '@/lib/services/calendar';"
);

route = route.replace(
  "export async function GET() {\n  const events = await fetchTodayCalendarEvents();\n  return NextResponse.json({ events, configured: !!(process.env.GOOGLE_CLIENT_ID) });\n}",
  [
    'export async function GET() {',
    '  const configured = isCalendarConfigured();',
    '  const { events, error } = await fetchTodayCalendarEvents();',
    '  return NextResponse.json({ events, configured, ...(error ? { error } : {}) });',
    '}',
  ].join('\n')
);

fs.writeFileSync('app/api/v2/calendar/events/route.ts', route);
console.log('checkmark app/api/v2/calendar/events/route.ts');

// ── 3. lib/v2/orchestrator.ts ────────────────────────────────────────────────
let orch = fs.readFileSync('lib/v2/orchestrator.ts', 'utf8');

orch = orch.replace(
  'const calEvents = await fetchTodayCalendarEvents();',
  'const { events: calEvents } = await fetchTodayCalendarEvents();'
);

orch = orch.replace(
  '      const syntheticHour = 9 + items.length;\n      when.setHours(syntheticHour, 0, 0, 0);',
  [
    '      const syntheticHour = 9 + items.length;',
    "      const tzLabel = process.env.TZ || 'America/New_York';",
    "      const localDateStr = now.toLocaleDateString('en-CA', { timeZone: tzLabel });",
    '      const syntheticLocal = new Date(`${localDateStr}T${String(syntheticHour).padStart(2, \'0\')}:00:00`);',
    '      when.setTime(syntheticLocal.getTime());',
  ].join('\n')
);

orch = orch.replace(
  "time: when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),",
  "time: when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tzLabel }),"
);

fs.writeFileSync('lib/v2/orchestrator.ts', orch);
console.log('checkmark lib/v2/orchestrator.ts');

console.log('\nDone. Now run:');
console.log('git add vercel.json lib/services/calendar.ts app/api/v2/calendar/events/route.ts lib/v2/orchestrator.ts && git commit -m "Fix timezone drift and surface calendar errors" && git push origin main');
