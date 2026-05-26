function requireAny(keys: string[], reason: string) {
  const found = keys.find((key) => String(process.env[key] ?? "").trim());
  if (!found) {
    throw new Error(`${reason} Missing one of: ${keys.join(", ")}`);
  }
}

function requireAll(keys: string[], reason: string) {
  const missing = keys.filter((key) => !String(process.env[key] ?? "").trim());
  if (missing.length > 0) {
    throw new Error(`${reason} Missing: ${missing.join(", ")}`);
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

  requireAll(["CRON_SECRET"], "Dispatch worker authentication is required.");

  if (String(process.env.ENABLE_DISPATCH_RUNTIME ?? "true") !== "false") {
    requireAll(
      ["OPENCLAW_TOKEN"],
      "Dispatch runtime requires OpenClaw authentication.",
    );
    requireAny(
      ["OPENCLAW_INFERENCE_GATEWAY", "OPENCLAW_GATEWAY"],
      "Dispatch runtime requires an inference gateway.",
    );
  }

  if (String(process.env.TELLER_ENV ?? "").trim()) {
    requireAll(
      ["TELLER_APPLICATION_ID", "TELLER_ENCRYPTION_KEY"],
      "Teller runtime is enabled but incomplete.",
    );
  }

  if (
    String(process.env.TELLER_ENV ?? "").trim() &&
    String(process.env.TELLER_ENV ?? "").trim() !== "sandbox"
  ) {
    requireAll(
      ["TELLER_CERT_PEM", "TELLER_KEY_PEM"],
      "Non-sandbox Teller runtime requires mTLS credentials.",
    );
  }
}
