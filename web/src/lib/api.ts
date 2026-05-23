import type { ApiResponse, LeaderboardResponse } from '../types';

export function getGameUuid(): string {
  // Extract UUID from /game/<uuid>
  const parts = window.location.pathname.split('/');
  return parts[parts.length - 1] ?? '';
}

export function getWorkspaceIdFromPath(): string {
  // /workspace/<workspaceId>/leaderboard
  const match = window.location.pathname.match(/^\/workspace\/([^/]+)\/leaderboard\/?$/);
  return match ? match[1] : '';
}

export async function fetchScoring(uuid: string): Promise<ApiResponse> {
  const res = await fetch(`/api/games/${uuid}/scoring`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<ApiResponse>;
}

export async function fetchLeaderboard(
  workspaceId: string,
  finalizedOnly: boolean,
): Promise<LeaderboardResponse> {
  const qs = finalizedOnly ? '?finalizedOnly=true' : '';
  const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/leaderboard${qs}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<LeaderboardResponse>;
}
