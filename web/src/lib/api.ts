import type { ApiResponse } from '../types';

export function getGameUuid(): string {
  // Extract UUID from /game/<uuid>
  const parts = window.location.pathname.split('/');
  return parts[parts.length - 1] ?? '';
}

export async function fetchScoring(uuid: string): Promise<ApiResponse> {
  const res = await fetch(`/api/games/${uuid}/scoring`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<ApiResponse>;
}
