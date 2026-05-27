export const LEGACY_DURABLE_OPS_DISABLED_CODE = 'LEGACY_DURABLE_OPS_DISABLED';
export const LEGACY_DURABLE_OPS_DISABLED_MESSAGE =
  'Legacy durable ops execution is disabled. Use dispatch-backed campaigns.';

function metadataFor(campaign: { metadata: unknown }) {
  return ((campaign.metadata as Record<string, unknown> | null) ?? {});
}

export function legacyDurableOpsEnabled() {
  return String(process.env.ENABLE_LEGACY_DURABLE_OPS ?? 'false') === 'true';
}

export function isNonRunnableDemoCampaign(campaign: { metadata: unknown }) {
  return metadataFor(campaign).demoNonRunnable === true;
}

export function legacyDurableOpsDisabledError() {
  return {
    error: {
      code: LEGACY_DURABLE_OPS_DISABLED_CODE,
      message: LEGACY_DURABLE_OPS_DISABLED_MESSAGE,
    },
  };
}
