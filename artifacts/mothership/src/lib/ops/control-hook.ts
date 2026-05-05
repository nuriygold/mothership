export type OpsControlPayload = {
  action: 'resume' | 'force_retry' | 'approve_action' | 'kill';
};

export function opsControlHookToken(campaignId: string) {
  return `ops_control:${campaignId}`;
}

