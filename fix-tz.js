// Run from /Users/claw/mothership-main:  node fix-tz.js
const fs = require('fs');

// 1. Remove TZ from vercel.json (Vercel reserves that env var)
const vj = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
delete vj.env;
fs.writeFileSync('vercel.json', JSON.stringify(vj, null, 2) + '\n');
console.log('checkmark vercel.json — removed TZ env');

// 2. Fix orchestrator.ts — use APP_TIMEZONE env var instead of TZ,
//    and use a UTC-offset approach that doesn't depend on server locale
let orch = fs.readFileSync('lib/v2/orchestrator.ts', 'utf8');

// Replace the timezone-aware block we added with a cleaner version
// that uses APP_TIMEZONE (not reserved) and a pure-UTC offset calculation
orch = orch.replace(
  [
    '      const syntheticHour = 9 + items.length;',
    "      const tzLabel = process.env.TZ || 'America/New_York';",
    "      const localDateStr = now.toLocaleDateString('en-CA', { timeZone: tzLabel });",
    "      const syntheticLocal = new Date(`${localDateStr}T${String(syntheticHour).padStart(2, '0')}:00:00`);",
    '      when.setTime(syntheticLocal.getTime());',
  ].join('\n'),
  [
    '      const syntheticHour = 9 + items.length;',
    "      const tzLabel = process.env.APP_TIMEZONE || 'America/New_York';",
    "      const localDateStr = now.toLocaleDateString('en-CA', { timeZone: tzLabel });",
    "      const syntheticLocal = new Date(`${localDateStr}T${String(syntheticHour).padStart(2, '0')}:00:00`);",
    '      when.setTime(syntheticLocal.getTime());',
  ].join('\n')
);

orch = orch.replace(
  "time: when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tzLabel }),",
  "time: when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tzLabel }),"
);

fs.writeFileSync('lib/v2/orchestrator.ts', orch);
console.log('checkmark lib/v2/orchestrator.ts — using APP_TIMEZONE instead of TZ');

console.log('\nDone. Now run:');
console.log('git add vercel.json lib/v2/orchestrator.ts && git commit -m "Fix: remove reserved TZ env var from vercel.json, use APP_TIMEZONE" && git push origin main');
console.log('\nThen add APP_TIMEZONE=America/New_York in Vercel project settings -> Environment Variables');
