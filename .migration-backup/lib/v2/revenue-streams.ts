export type RevenueStreamDef = {
  key: string;
  displayName: string;
  leadBotKey: 'adrian' | 'ruby' | 'emerald' | 'adobe' | 'anchor';
  leadDisplay: string;
  sopPath: string;
  reportPrompt: string;
  statusPrompt: string;
};

export const REVENUE_STREAMS: RevenueStreamDef[] = [
  {
    key: 'shopify',
    displayName: 'Shopify',
    leadBotKey: 'adrian',
    leadDisplay: 'Drake',
    sopPath: 'content/revenue-streams/shopify.md',
    reportPrompt:
      'Generate a brief revenue report for the Shopify store: current status, recent order volume, top-selling products, and any operational issues or opportunities.',
    statusPrompt:
      'What is the current status of the Shopify revenue stream? Any pending orders, fulfillment issues, or actions needed?',
  },
  {
    key: 'tiktok',
    displayName: 'TikTok',
    leadBotKey: 'ruby',
    leadDisplay: 'Drizzy',
    sopPath: 'content/revenue-streams/tiktok.md',
    reportPrompt:
      'Generate a brief revenue report for TikTok: current monetization status, recent creator fund or shop earnings, content performance, and growth opportunities.',
    statusPrompt:
      'What is the current status of the TikTok revenue stream? Any content due, pending campaigns, or platform actions needed?',
  },
  {
    key: 'nuriy-product',
    displayName: 'Nuriy Product',
    leadBotKey: 'emerald',
    leadDisplay: 'Champagne Papi',
    sopPath: 'content/revenue-streams/nuriy-product.md',
    reportPrompt:
      'Generate a brief revenue report for the Nuriy Product stream: current pipeline, recent sales or launches, margin analysis, and strategic positioning.',
    statusPrompt:
      'What is the current status of the Nuriy Product revenue stream? Any development milestones, launch readiness issues, or sales pipeline actions needed?',
  },
  {
    key: 'truckstop',
    displayName: 'Truckstop',
    leadBotKey: 'adrian',
    leadDisplay: 'Drake',
    sopPath: 'content/revenue-streams/truckstop.md',
    reportPrompt:
      'Generate a brief revenue report for the Truckstop stream: load board activity, recent hauls, revenue per mile, compliance status, and any operational flags.',
    statusPrompt:
      'What is the current status of the Truckstop revenue stream? Any loads pending, compliance issues, or driver and equipment actions needed?',
  },
  {
    key: 'notary',
    displayName: 'Notary',
    leadBotKey: 'adobe',
    leadDisplay: 'Aubrey Graham',
    sopPath: 'content/revenue-streams/notary.md',
    reportPrompt:
      'Generate a brief revenue report for the Notary stream: recent signing appointments, revenue, document completion rates, and any pending certifications or renewals.',
    statusPrompt:
      'What is the current status of the Notary revenue stream? Any upcoming appointments, document issues, or certification actions needed?',
  },
];

export function streamByKey(key: string): RevenueStreamDef | undefined {
  return REVENUE_STREAMS.find((s) => s.key === key);
}

export function botColor(leadBotKey: RevenueStreamDef['leadBotKey']): string {
  switch (leadBotKey) {
    case 'adrian':  return 'var(--green)';
    case 'ruby':    return 'var(--red)';
    case 'emerald': return 'var(--blue)';
    case 'adobe':   return 'var(--amber)';
    case 'anchor':  return 'var(--purple)';
  }
}
