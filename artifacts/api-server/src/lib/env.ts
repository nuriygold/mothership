function requireAny(keys: string[], reason: string) {
  const found = keys.find((key) => String(process.env[key] ?? "").trim());
  if (!found) {
    throw new Error(`${reason} Missing one of: ${keys.join(", ")}`);
  }
}

function hasAny(keys: string[]) {
  return keys.some((key) => String(process.env[key] ?? "").trim());
}

function hasAll(keys: string[]) {
  return keys.every((key) => String(process.env[key] ?? "").trim());
}

function warnIfMissing(keys: string[], reason: string) {
  const missing = keys.filter((key) => !String(process.env[key] ?? "").trim());
  if (missing.length > 0) {
    console.warn(`${reason} Missing: ${missing.join(", ")}`);
  }
}

export function validateRuntimeEnv() {
  requireAny(
    [
      "SUPABASE_DATABASE_URL",
      "POSTGRES_URL_NON_POOLING",
      "POSTGRES_URL",
      "DATABASE_URL_POOLER_TRANS",
      "DATABASE_URL_POOLER_SESSION",
      "DATABASE_POOLER_URL",
      "DATABASE_URL",
    ],
    "Database configuration is required.",
  );

  if (String(process.env.ENABLE_DISPATCH_RUNTIME ?? "true") !== "false") {
    if (!hasAll(["OPENCLAW_TOKEN"]) || !hasAny(["OPENCLAW_INFERENCE_GATEWAY", "OPENCLAW_GATEWAY"])) {
      warnIfMissing(
        ["OPENCLAW_TOKEN", "OPENCLAW_INFERENCE_GATEWAY", "OPENCLAW_GATEWAY"],
        "Dispatch runtime is enabled but OpenClaw configuration is incomplete.",
      );
    }
  }

  if (String(process.env.TELLER_ENV ?? "").trim()) {
    warnIfMissing(
      ["TELLER_APPLICATION_ID", "TELLER_ENCRYPTION_KEY"],
      "Teller runtime is enabled but incomplete.",
    );
  }

  if (
    String(process.env.TELLER_ENV ?? "").trim() &&
    String(process.env.TELLER_ENV ?? "").trim() !== "sandbox"
  ) {
    warnIfMissing(
      ["TELLER_CERT_PEM", "TELLER_KEY_PEM"],
      "Non-sandbox Teller runtime is enabled but mTLS credentials are missing.",
    );
  }

  if (hasAny(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"]) && !hasAll(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"])) {
    warnIfMissing(
      ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"],
      "Google Calendar and Gmail are partially configured.",
    );
  }

  if (hasAny(["ZOHO_IMAP_USERNAME", "ZOHO_IMAP_PASSWORD", "ZOHO_EMAIL_USER", "ZOHO_EMAIL_PASS", "ZOHO_APP_PASSWORD"]) && !hasAll(["ZOHO_IMAP_USERNAME", "ZOHO_IMAP_PASSWORD"]) && !hasAll(["ZOHO_EMAIL_USER", "ZOHO_EMAIL_PASS"]) && !hasAll(["ZOHO_EMAIL_USER", "ZOHO_APP_PASSWORD"])) {
    warnIfMissing(
      ["ZOHO_IMAP_USERNAME", "ZOHO_IMAP_PASSWORD", "ZOHO_EMAIL_USER", "ZOHO_EMAIL_PASS", "ZOHO_APP_PASSWORD"],
      "Zoho email is partially configured.",
    );
  }

  if (hasAny(["TELEGRAM_BOT_TOKEN", "TELEGRAM_BOT_TOKEN_2", "TELEGRAM_BOT_TOKEN_3", "TELEGRAM_BOT_TOKEN_ADOBE", "TELEGRAM_CHAT_ID"]) && !hasAny(["TELEGRAM_CHAT_ID"])) {
    warnIfMissing(
      ["TELEGRAM_CHAT_ID"],
      "Telegram notifications are partially configured.",
    );
  }
}
