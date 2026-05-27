const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const contents = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;
    const key = line.slice(0, eqIndex).trim();
    if (!key) continue;
    if (present(process.env[key])) continue;
    let value = line.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function present(value) {
  return String(value ?? '').trim().length > 0;
}

function anyPresent(keys) {
  return keys.some((key) => present(process.env[key]));
}

function allPresent(keys) {
  return keys.every((key) => present(process.env[key]));
}

function print(label, status, detail) {
  console.log(`${label}: ${status}${detail ? ` - ${detail}` : ''}`);
}

function main() {
  loadEnvFile(path.join(__dirname, '..', 'artifacts', 'mothership', '.env.local'));

  let missingRequired = false;

  const dbKeys = [
    'SUPABASE_DATABASE_URL',
    'POSTGRES_URL_NON_POOLING',
    'POSTGRES_URL',
    'DATABASE_MIGRATION_URL',
    'DATABASE_POOLER_URL',
    'DATABASE_URL_POOLER_TRANS',
    'DATABASE_URL_POOLER_SESSION',
    'DATABASE_URL',
  ];
  if (anyPresent(dbKeys)) {
    print('Database', 'PASS', 'At least one database URL is present.');
  } else {
    print('Database', 'MISSING', `Missing one of: ${dbKeys.join(', ')}`);
    missingRequired = true;
  }

  if (present(process.env.CRON_SECRET)) {
    print('Dispatch worker auth', 'PASS', 'CRON_SECRET is set.');
  } else {
    print('Dispatch worker auth', 'WARN', 'CRON_SECRET is not configured.');
  }

  if (String(process.env.ENABLE_DISPATCH_RUNTIME ?? 'true') !== 'false') {
    const hasToken = present(process.env.OPENCLAW_TOKEN);
    const hasGateway = anyPresent(['OPENCLAW_INFERENCE_GATEWAY', 'OPENCLAW_GATEWAY']);
    if (hasToken && hasGateway) {
      print('Dispatch runtime', 'PASS', 'OpenClaw credentials are present.');
    } else {
      print(
        'Dispatch runtime',
        'WARN',
        'ENABLE_DISPATCH_RUNTIME is true but OPENCLAW_TOKEN or a gateway is missing.',
      );
    }
  } else {
    print('Dispatch runtime', 'INFO', 'ENABLE_DISPATCH_RUNTIME is false.');
  }

  if (present(process.env.TELLER_ENV)) {
    if (allPresent(['TELLER_APPLICATION_ID', 'TELLER_ENCRYPTION_KEY'])) {
      print('Teller', 'PASS', 'Base Teller credentials are present.');
    } else {
      print('Teller', 'WARN', 'TELLER_ENV is set but TELLER_APPLICATION_ID or TELLER_ENCRYPTION_KEY is missing.');
    }

    if (String(process.env.TELLER_ENV).trim() !== 'sandbox') {
      if (allPresent(['TELLER_CERT_PEM', 'TELLER_KEY_PEM'])) {
        print('Teller mTLS', 'PASS', 'mTLS credentials are present.');
      } else {
        print('Teller mTLS', 'WARN', 'Non-sandbox Teller is enabled but TELLER_CERT_PEM or TELLER_KEY_PEM is missing.');
      }
    }
  } else {
    print('Teller', 'WARN', 'TELLER_ENV is not configured.');
  }

  if (anyPresent(['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN'])) {
    if (allPresent(['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN'])) {
      print('Google Calendar', 'PASS', 'Calendar credentials are present.');
    } else {
      print('Google Calendar', 'WARN', 'Google Calendar and Gmail are partially configured.');
    }
  } else {
    print('Google Calendar', 'INFO', 'Not configured.');
  }

  if (anyPresent(['ZOHO_IMAP_USERNAME', 'ZOHO_IMAP_PASSWORD', 'ZOHO_EMAIL_USER', 'ZOHO_EMAIL_PASS', 'ZOHO_APP_PASSWORD'])) {
    const zohoReady =
      allPresent(['ZOHO_IMAP_USERNAME', 'ZOHO_IMAP_PASSWORD']) ||
      allPresent(['ZOHO_EMAIL_USER', 'ZOHO_EMAIL_PASS']) ||
      allPresent(['ZOHO_EMAIL_USER', 'ZOHO_APP_PASSWORD']);
    print('Zoho email', zohoReady ? 'PASS' : 'WARN', zohoReady ? 'Zoho credentials are present.' : 'Zoho email is partially configured.');
  } else {
    print('Zoho email', 'INFO', 'Not configured.');
  }

  if (anyPresent(['TELEGRAM_BOT_TOKEN', 'TELEGRAM_BOT_TOKEN_2', 'TELEGRAM_BOT_TOKEN_3', 'TELEGRAM_BOT_TOKEN_ADOBE', 'TELEGRAM_CHAT_ID'])) {
    print(
      'Telegram',
      present(process.env.TELEGRAM_CHAT_ID) ? 'PASS' : 'WARN',
      present(process.env.TELEGRAM_CHAT_ID)
        ? 'Telegram notifications are configured.'
        : 'Telegram notifications are partially configured.',
    );
  } else {
    print('Telegram', 'INFO', 'Not configured.');
  }

  print(
    'OpenClaw streams path',
    present(process.env.OPENCLAW_STREAMS_PATH) ? 'PASS' : 'WARN',
    present(process.env.OPENCLAW_STREAMS_PATH)
      ? 'OPENCLAW_STREAMS_PATH is set.'
      : `Using portable fallback ${path.join(os.homedir(), '.openclaw', 'workspace', 'revenue_streams')}.`,
  );

  if (missingRequired) {
    process.exitCode = 1;
  }
}

main();
