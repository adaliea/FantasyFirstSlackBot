import { TbaAward, TbaAlliance, TbaMatchSimple, TbaRankingsResponse, TbaTeamSimple } from './tbaTypes';

interface CacheEntry {
  body: unknown;
  etag?: string;
  lastModified?: string;
  expiresAt: number;
}

export class TbaCachedClient {
  private readonly apiKey: string;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async getTeams(eventCode: string): Promise<TbaTeamSimple[]> {
    return (await this.fetch<TbaTeamSimple[]>(`event/${eventCode}/teams/simple`, 3600)) ?? [];
  }

  async getRankings(eventCode: string): Promise<TbaRankingsResponse | null> {
    return this.fetch<TbaRankingsResponse>(`event/${eventCode}/rankings`, 30);
  }

  async getMatches(eventCode: string): Promise<TbaMatchSimple[]> {
    return (await this.fetch<TbaMatchSimple[]>(`event/${eventCode}/matches/simple`, 30)) ?? [];
  }

  async getAlliances(eventCode: string): Promise<TbaAlliance[]> {
    return (await this.fetch<TbaAlliance[]>(`event/${eventCode}/alliances`, 30)) ?? [];
  }

  async getAwards(eventCode: string): Promise<TbaAward[]> {
    return (await this.fetch<TbaAward[]>(`event/${eventCode}/awards`, 300)) ?? [];
  }

  private async fetch<T>(endpoint: string, ttlSeconds: number): Promise<T | null> {
    const key = endpoint;
    const now = Date.now();
    const entry = this.cache.get(key);

    const headers: Record<string, string> = {
      'X-TBA-Auth-Key': this.apiKey,
      'User-Agent': 'FantasyFirstSlackBot/1.0',
      'Accept': 'application/json',
    };

    if (entry) {
      if (now < entry.expiresAt) return entry.body as T;
      if (entry.etag) headers['If-None-Match'] = entry.etag;
      if (entry.lastModified) headers['If-Modified-Since'] = entry.lastModified;
    }

    const url = `https://www.thebluealliance.com/api/v3/${endpoint}`;
    let response: Response;
    try {
      response = await fetch(url, { headers });
    } catch (err) {
      // Network error — return stale cache if available
      if (entry) return entry.body as T;
      throw err;
    }

    if (response.status === 304 && entry) {
      entry.expiresAt = now + ttlSeconds * 1000;
      return entry.body as T;
    }

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      if (entry) return entry.body as T;
      throw new Error(`TBA API error ${response.status} for ${endpoint}`);
    }

    const body = (await response.json()) as T;
    this.cache.set(key, {
      body,
      etag: response.headers.get('ETag') ?? undefined,
      lastModified: response.headers.get('Last-Modified') ?? undefined,
      expiresAt: now + ttlSeconds * 1000,
    });
    return body;
  }
}
