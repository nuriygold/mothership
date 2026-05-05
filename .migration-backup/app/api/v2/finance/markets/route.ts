import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Cache market data for 5 minutes server-side
let cache: { data: MarketData; ts: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

export type MarketData = {
  btc:  { price: number; change: number } | null;
  dow:  { price: number; change: number } | null;
  nyse: { price: number; change: number } | null;
};

async function fetchYahoo(symbol: string): Promise<{ price: number; change: number } | null> {
  const encoded = encodeURIComponent(symbol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=2d`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const price: number = meta.regularMarketPrice ?? meta.previousClose;
    const prev: number = meta.chartPreviousClose ?? meta.previousClose ?? price;
    const change = prev ? ((price - prev) / prev) * 100 : 0;
    return { price, change };
  } catch {
    return null;
  }
}

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return NextResponse.json(cache.data);
  }

  const [btc, dow, nyse] = await Promise.all([
    fetchYahoo('BTC-USD'),
    fetchYahoo('^DJI'),
    fetchYahoo('^NYA'),
  ]);

  const data: MarketData = { btc, dow, nyse };
  cache = { data, ts: Date.now() };

  return NextResponse.json(data);
}
