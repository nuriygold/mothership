export type ToolDef = {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string }>;
  execute(args: Record<string, unknown>): Promise<string>;
};

// ── web_search ────────────────────────────────────────────────────────────────

const webSearchTool: ToolDef = {
  name: 'web_search',
  description: 'Search the web for current information. Returns a text summary of the top results.',
  parameters: {
    query: { type: 'string', description: 'The search query' },
  },
  async execute(args) {
    const query = String(args.query ?? '');
    const apiKey = process.env.SEARCH_API_KEY;
    if (!apiKey) {
      return `[web_search stub — SEARCH_API_KEY not configured] Query: "${query}"`;
    }
    try {
      const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`;
      const res = await fetch(url, {
        headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return `[web_search] Search API returned ${res.status}`;
      const data = (await res.json()) as {
        web?: { results?: Array<{ title: string; description: string; url: string }> };
      };
      const results = data.web?.results ?? [];
      if (!results.length) return '[web_search] No results found.';
      return results
        .map((r, i) => `${i + 1}. ${r.title}\n   ${r.description}\n   ${r.url}`)
        .join('\n\n');
    } catch (err) {
      return `[web_search] Error: ${String(err)}`;
    }
  },
};

// ── fetch_url ─────────────────────────────────────────────────────────────────

const fetchUrlTool: ToolDef = {
  name: 'fetch_url',
  description: 'Fetch the text content of a URL. Useful for reading web pages, APIs, or documents.',
  parameters: {
    url: { type: 'string', description: 'The URL to fetch' },
  },
  async execute(args) {
    const url = String(args.url ?? '');
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return '[fetch_url] URL must start with http:// or https://';
    }
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mothership/1.0 (dispatch agent)' },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) return `[fetch_url] HTTP ${res.status} for ${url}`;
      const text = await res.text();
      // Strip HTML tags and return first 4000 chars
      const plain = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      return plain.slice(0, 4000);
    } catch (err) {
      return `[fetch_url] Error: ${String(err)}`;
    }
  },
};

// ── list_ebay_sold ────────────────────────────────────────────────────────────

const listEbaySoldTool: ToolDef = {
  name: 'list_ebay_sold',
  description:
    'Search eBay completed/sold listings to get recent sale prices for an item. Useful for pricing research.',
  parameters: {
    keywords: { type: 'string', description: 'Item keywords to search for' },
    max_results: { type: 'number', description: 'Maximum number of results to return (default 10)' },
  },
  async execute(args) {
    const keywords = String(args.keywords ?? '');
    const maxResults = Math.min(Number(args.max_results ?? 10), 25);
    const appId = process.env.EBAY_APP_ID;
    if (!appId) {
      return `[list_ebay_sold stub — EBAY_APP_ID not configured] Would search sold listings for: "${keywords}"`;
    }
    try {
      const params = new URLSearchParams({
        'OPERATION-NAME': 'findCompletedItems',
        'SERVICE-VERSION': '1.0.0',
        'SECURITY-APPNAME': appId,
        'RESPONSE-DATA-FORMAT': 'JSON',
        'keywords': keywords,
        'itemFilter(0).name': 'SoldItemsOnly',
        'itemFilter(0).value': 'true',
        'paginationInput.entriesPerPage': String(maxResults),
      });
      const res = await fetch(`https://svcs.ebay.com/services/search/FindingService/v1?${params}`, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return `[list_ebay_sold] eBay API returned ${res.status}`;
      const data = (await res.json()) as {
        findCompletedItemsResponse?: Array<{
          searchResult?: Array<{ item?: Array<{ title: string[]; sellingStatus: Array<{ currentPrice: Array<{ __value__: string }> }> }> }>;
        }>;
      };
      const items = data.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item ?? [];
      if (!items.length) return '[list_ebay_sold] No sold listings found.';
      return items
        .map((item, i) => {
          const title = item.title?.[0] ?? 'Unknown';
          const price = item.sellingStatus?.[0]?.currentPrice?.[0]?.__value__ ?? '?';
          return `${i + 1}. ${title} — $${price}`;
        })
        .join('\n');
    } catch (err) {
      return `[list_ebay_sold] Error: ${String(err)}`;
    }
  },
};

// ── search_facebook_marketplace ───────────────────────────────────────────────

const searchFacebookMarketplaceTool: ToolDef = {
  name: 'search_facebook_marketplace',
  description:
    'Search Facebook Marketplace listings. (Stub — requires Facebook Graph API credentials not yet configured.)',
  parameters: {
    query: { type: 'string', description: 'Search query' },
    location: { type: 'string', description: 'City or zip code for local listings' },
  },
  async execute(args) {
    // Facebook Marketplace does not have a public listing API; this stub signals
    // that the tool is registered and ready for when an unofficial or partner API
    // is wired in.
    return `[search_facebook_marketplace stub] Would search for "${args.query}" near "${args.location ?? 'unspecified'}". Facebook Marketplace API integration not yet configured.`;
  },
};

// ── post_craigslist ───────────────────────────────────────────────────────────

const postCraigslistTool: ToolDef = {
  name: 'post_craigslist',
  description:
    'Post a listing to Craigslist. (Stub — requires Craigslist posting API/credentials not yet configured.)',
  parameters: {
    title: { type: 'string', description: 'Listing title' },
    body: { type: 'string', description: 'Full listing body text' },
    category: { type: 'string', description: 'Craigslist category (e.g. "for sale > general")' },
    location: { type: 'string', description: 'City or region' },
    price: { type: 'number', description: 'Asking price in USD' },
  },
  async execute(args) {
    return `[post_craigslist stub] Would post listing titled "${args.title}" in "${args.category}" for $${args.price} in "${args.location}". Craigslist posting integration not yet configured.`;
  },
};

// ── Registry ──────────────────────────────────────────────────────────────────

export const TOOL_REGISTRY: ToolDef[] = [
  webSearchTool,
  fetchUrlTool,
  listEbaySoldTool,
  searchFacebookMarketplaceTool,
  postCraigslistTool,
];

const TOOL_MAP: Map<string, ToolDef> = new Map(TOOL_REGISTRY.map((t) => [t.name, t]));

export function getToolsForRequirements(requirements: string[]): ToolDef[] {
  return requirements
    .map((name) => TOOL_MAP.get(name))
    .filter((t): t is ToolDef => t !== undefined);
}

export function buildToolsBlock(tools: ToolDef[]): string {
  if (!tools.length) return '';
  const lines = [
    'Available tools — to call a tool, output exactly this syntax (one per line):',
    '<tool_call>{"name":"tool_name","args":{...}}</tool_call>',
    'After you emit a tool call the system will respond with:',
    '<tool_result>...result text...</tool_result>',
    'Then continue reasoning. Only call tools when necessary.',
    '',
    'Tools:',
    ...tools.map((t) => {
      const params = Object.entries(t.parameters)
        .map(([k, v]) => `  ${k} (${v.type}): ${v.description}`)
        .join('\n');
      return `- ${t.name}: ${t.description}\n${params}`;
    }),
  ];
  return lines.join('\n');
}
