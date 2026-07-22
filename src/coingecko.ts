// CoinGecko free API integration — price fetching with retry logic.
// Uses /api/v3/simple/price and /api/v3/coins/list for ticker-to-ID mapping.

const BASE_URL = "https://api.coingecko.com/api/v3";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

interface CoinListItem {
  id: string;
  symbol: string;
  name: string;
}

interface PriceResult {
  price: number;
  change24h: number;
}

// Coin list cache with 1-hour TTL
let coinListCache: Map<string, CoinListItem> | null = null;
let coinListCacheTime = 0;
const CACHE_TTL_MS = 60 * 60 * 1000;

async function fetchWithRetry(url: string): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 429) {
        // Rate limited — wait and retry
        const retryAfter = parseInt(res.headers.get("Retry-After") ?? "5", 10);
        await delay(retryAfter * 1000);
        continue;
      }
      if (!res.ok) {
        throw new Error(`CoinGecko API ${res.status}`);
      }
      return res;
    } catch (err) {
      lastError = err as Error;
      if (attempt < MAX_RETRIES - 1) {
        await delay(RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }
  throw lastError ?? new Error("CoinGecko API unreachable after retries");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getCoinList(): Promise<Map<string, CoinListItem>> {
  if (coinListCache && Date.now() - coinListCacheTime < CACHE_TTL_MS) {
    return coinListCache;
  }

  const res = await fetchWithRetry(`${BASE_URL}/coins/list`);
  const coins = (await res.json()) as CoinListItem[];
  const map = new Map<string, CoinListItem>();
  for (const coin of coins) {
    // Index by lowercase symbol and name for lookup
    map.set(coin.symbol.toLowerCase(), coin);
    if (coin.name.toLowerCase() !== coin.symbol.toLowerCase()) {
      map.set(coin.name.toLowerCase(), coin);
    }
  }
  coinListCache = map;
  coinListCacheTime = Date.now();
  return map;
}

/** Find a CoinGecko ID from a ticker symbol or name. Returns null if not found. */
export async function findCoinId(ticker: string): Promise<string | null> {
  try {
    const list = await getCoinList();
    const match = list.get(ticker.toLowerCase());
    return match?.id ?? null;
  } catch {
    return null;
  }
}

/** Suggest coins that partially match the ticker (for unknown ticker UX). */
export async function suggestCoins(ticker: string, limit = 3): Promise<string[]> {
  try {
    const list = await getCoinList();
    const lower = ticker.toLowerCase();
    const matches: string[] = [];
    for (const [key, coin] of list) {
      if (key.includes(lower) && !matches.includes(coin.symbol.toUpperCase())) {
        matches.push(coin.symbol.toUpperCase());
        if (matches.length >= limit) break;
      }
    }
    return matches;
  } catch {
    return [];
  }
}

/** Fetch price and 24h change for a single coin. */
export async function getPrice(ticker: string): Promise<PriceResult | null> {
  const coinId = await findCoinId(ticker);
  if (!coinId) return null;

  const res = await fetchWithRetry(
    `${BASE_URL}/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true`,
  );
  const data = (await res.json()) as Record<string, { usd: number; usd_24h_change: number }>;
  const coinData = data[coinId];
  if (!coinData) return null;

  return { price: coinData.usd, change24h: coinData.usd_24h_change ?? 0 };
}

/** Fetch prices for multiple coins in one call. */
export async function getPrices(
  tickers: string[],
): Promise<Map<string, PriceResult>> {
  const results = new Map<string, PriceResult>();
  if (tickers.length === 0) return results;

  // Map tickers to CoinGecko IDs
  const idMap = new Map<string, string>(); // ticker -> coinId
  for (const ticker of tickers) {
    const id = await findCoinId(ticker);
    if (id) idMap.set(ticker, id);
  }

  if (idMap.size === 0) return results;

  const ids = [...new Set(idMap.values())].join(",");
  const res = await fetchWithRetry(
    `${BASE_URL}/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
  );
  const data = (await res.json()) as Record<string, { usd: number; usd_24h_change: number }>;

  for (const [ticker, coinId] of idMap) {
    const coinData = data[coinId];
    if (coinData) {
      results.set(ticker, {
        price: coinData.usd,
        change24h: coinData.usd_24h_change ?? 0,
      });
    }
  }

  return results;
}
