import { randomUUID } from 'crypto';
import type { KnownBlock } from '@slack/bolt';
import { GameData, Player, Team } from '../types';
import { ACTION_JOIN_GAME, ACTION_LEAVE_GAME, ACTION_PICK_TEAM_BUTTON, ACTION_START_GAME, PUBLIC_URL } from '../constants';

export class Game {
  private readonly data: GameData;

  constructor(data: GameData) {
    this.data = data;
  }

  static create(params: {
    channelId: string;
    allianceSize: number;
    teams: Team[];
    gameOwnerSlackId: string;
    gameName: string;
    targetPlayersPerGame?: number;
    eventCode?: string;
  }): Game {
    const availableTeams = [...params.teams].sort(
      (a, b) => parseInt(a.number) - parseInt(b.number),
    );
    return new Game({
      uuid: randomUUID(),
      channelId: params.channelId,
      allianceSize: params.allianceSize,
      availableTeams,
      players: [],
      gameOwnerSlackId: params.gameOwnerSlackId,
      gameName: params.gameName,
      hasStarted: false,
      turnCount: 0,
      lastMessagesTsArray: [],
      targetPlayersPerGame: params.targetPlayersPerGame ?? 0,
      eventCode: params.eventCode,
    });
  }

  static fromData(data: GameData): Game {
    return new Game(JSON.parse(JSON.stringify(data)) as GameData);
  }

  toData(): GameData {
    return JSON.parse(JSON.stringify(this.data)) as GameData;
  }

  get uuid(): string { return this.data.uuid; }
  get channelId(): string { return this.data.channelId; }
  get allianceSize(): number { return this.data.allianceSize; }
  get gameName(): string { return this.data.gameName; }
  get gameOwnerSlackId(): string { return this.data.gameOwnerSlackId; }
  get hasStarted(): boolean { return this.data.hasStarted; }
  get turnCount(): number { return this.data.turnCount; }
  get players(): Player[] { return this.data.players; }
  get availableTeams(): Team[] { return this.data.availableTeams; }
  get lastMessagesTsArray(): string[] { return this.data.lastMessagesTsArray; }
  get targetPlayersPerGame(): number { return this.data.targetPlayersPerGame; }
  get eventCode(): string | undefined { return this.data.eventCode; }

  set gameName(name: string) { this.data.gameName = name; }
  set allianceSize(size: number) { this.data.allianceSize = size; }
  set targetPlayersPerGame(n: number) { this.data.targetPlayersPerGame = n; }
  set lastMessagesTsArray(ts: string[]) { this.data.lastMessagesTsArray = ts; }
  set eventCode(code: string | undefined) { this.data.eventCode = code; }

  getScoringUrl(publicUrl: string): string | null {
    if (!publicUrl) return null;
    return `${publicUrl}/game/${this.data.uuid}`;
  }

  addPlayer(player: Player): void {
    this.data.players.push(player);
  }

  removePlayer(slackId: string): boolean {
    const idx = this.data.players.findIndex(p => p.slackId === slackId);
    if (idx < 0) return false;
    const [player] = this.data.players.splice(idx, 1);
    this.data.availableTeams.push(...player.selectedTeams);
    this.data.availableTeams.sort((a, b) => parseInt(a.number) - parseInt(b.number));
    return true;
  }

  isPlayerInGame(slackId: string): boolean {
    return this.data.players.some(p => p.slackId === slackId);
  }

  isFull(): boolean {
    return this.data.hasStarted && this.data.players.length >= this.getActualMaxPlayers();
  }

  getActualMaxPlayers(): number {
    const totalTeams = this.data.availableTeams.length +
      this.data.players.reduce((sum, p) => sum + p.selectedTeams.length, 0);
    return Math.floor(totalTeams / this.data.allianceSize);
  }

  start(): void {
    if (this.data.hasStarted) return;
    fisherYatesShuffle(this.data.players);
    this.data.hasStarted = true;
  }

  unStart(): void {
    this.data.hasStarted = false;
    this.data.turnCount = 0;
    for (const player of this.data.players) {
      this.data.availableTeams.push(...player.selectedTeams);
      player.selectedTeams = [];
    }
    this.data.availableTeams.sort((a, b) => parseInt(a.number) - parseInt(b.number));
  }

  pickTeamByUuid(teamUuid: string): boolean {
    const idx = this.data.availableTeams.findIndex(t => t.uuid === teamUuid);
    if (idx < 0) return false;
    const nextPlayer = this.getNextPlayerInDraft();
    if (!nextPlayer) return false;
    const [team] = this.data.availableTeams.splice(idx, 1);
    nextPlayer.selectedTeams.push(team);
    return true;
  }

  pickTeamByNumber(teamNumber: string): Team | null {
    const idx = this.data.availableTeams.findIndex(t => t.number === teamNumber);
    if (idx < 0) return null;
    const nextPlayer = this.getNextPlayerInDraft();
    if (!nextPlayer) return null;
    const [team] = this.data.availableTeams.splice(idx, 1);
    nextPlayer.selectedTeams.push(team);
    return team;
  }

  getNextPlayerInDraft(): Player | null {
    for (let round = 1; round <= this.data.allianceSize; round++) {
      const players = round % 2 === 0
        ? [...this.data.players].reverse()
        : this.data.players;
      for (const player of players) {
        if (player.selectedTeams.length < round) return player;
      }
    }
    return null;
  }

  splitPlayers(): Player[][] {
    const playersCopy = [...this.data.players];
    if (this.data.targetPlayersPerGame <= 0) return [playersCopy];

    const actualMaxPlayers = this.getActualMaxPlayers();
    const maxPlayers = Math.min(this.data.targetPlayersPerGame, actualMaxPlayers);
    let numGroups = Math.max(1, Math.round(playersCopy.length / maxPlayers));
    let playersPerGroup = Math.ceil(playersCopy.length / numGroups);

    if (playersPerGroup > actualMaxPlayers) {
      playersPerGroup = actualMaxPlayers;
      numGroups++;
    }

    fisherYatesShuffle(playersCopy);

    const result: Player[][] = [];
    for (let i = 0; i < numGroups; i++) {
      const start = i * playersPerGroup;
      if (start >= playersCopy.length) break;
      result.push(playersCopy.slice(start, Math.min(start + playersPerGroup, playersCopy.length)));
    }
    return result;
  }

  incrementTurnCount(): number {
    return ++this.data.turnCount;
  }

  getMarkdownTable(): string {
    const allTeamNames = [
      ...this.data.availableTeams.map(t => t.name),
      ...this.data.players.flatMap(p => p.selectedTeams.map(t => t.name)),
    ];
    const longestTeamName = Math.max(
      allTeamNames.length > 0 ? Math.max(...allTeamNames.map(n => n.length)) : 0,
      4 + String(this.data.allianceSize).length,
    );
    const longestName = Math.max(
      this.data.players.length > 0 ? Math.max(...this.data.players.map(p => p.name.length)) : 0,
      4,
    );

    let header = `Name${' '.repeat(longestName - 4)} | `;
    for (let i = 0; i < this.data.allianceSize; i++) {
      const col = `team${i + 1}`;
      header += `${col}${' '.repeat(Math.max(0, longestTeamName - col.length))} | `;
    }
    header += '\n';

    const divider = `${'-'.repeat(header.length - 1)}\n`;

    let rows = '';
    for (const player of this.data.players) {
      let row = `${player.name}${' '.repeat(longestName - player.name.length)} | `;
      for (let i = 0; i < this.data.allianceSize; i++) {
        if (player.selectedTeams.length > i) {
          const tn = player.selectedTeams[i].name;
          row += `${tn}${' '.repeat(Math.max(0, longestTeamName - tn.length))} | `;
        } else {
          row += `${' '.repeat(longestTeamName)} | `;
        }
      }
      rows += `${row}\n`;
    }

    return `\`\`\`\n${header}${divider}${rows}${divider}\`\`\``;
  }

  getCompactPlayerList(): string {
    return this.data.players
      .map(p => `${p.name}: ${p.selectedTeams.map(t => t.name).join(', ') || '(no picks)'}`)
      .join('\n');
  }

  getGameRegistrationBlocks(): KnownBlock[] {
    const playersStr = this.data.players.map(p => p.name).join(', ') || 'No players have joined yet';
    const teamsPerDraft = this.data.targetPlayersPerGame === 0
      ? this.getActualMaxPlayers()
      : this.data.targetPlayersPerGame;

    return [
      { type: 'section', text: { type: 'mrkdwn', text: `*A Fantasy First Game has been created: ${this.data.gameName}*` } },
      { type: 'section', text: { type: 'mrkdwn', text: 'Teams:' } },
      { type: 'section', text: { type: 'plain_text', text: this.data.availableTeams.map(t => t.name).join(', '), emoji: true } },
      { type: 'divider' },
      { type: 'section', text: { type: 'mrkdwn', text: 'Players:' } },
      { type: 'section', text: { type: 'plain_text', text: playersStr, emoji: true } },
      this.getJoiningButtonsBlock(),
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `This game will be split into drafts with a target of *${teamsPerDraft}* players per draft` }],
      },
      ...(this.getScoringUrl(PUBLIC_URL) ? [{
        type: 'context' as const,
        elements: [{ type: 'mrkdwn' as const, text: `📊 <${this.getScoringUrl(PUBLIC_URL)}|Live Scoring>` }],
      }] : []),
    ] as KnownBlock[];
  }

  getDraftingBlocks(): KnownBlock[][] {
    this.incrementTurnCount();

    const fields = this.data.players.map(p => ({
      type: 'mrkdwn' as const,
      text: `*${p.name}*: ${p.selectedTeams.map(t => t.name).join(', ') || '—'}`,
    }));

    const nextPlayer = this.getNextPlayerInDraft();

    if (!nextPlayer) {
      return [[
        { type: 'section', text: { type: 'mrkdwn', text: `The *${this.data.gameName}* draft is over!` } },
        { type: 'section', fields },
        ...(this.getScoringUrl(PUBLIC_URL) ? [{
          type: 'context' as const,
          elements: [{ type: 'mrkdwn' as const, text: `📊 <${this.getScoringUrl(PUBLIC_URL)}|Live Scoring>` }],
        }] : []),
      ] as KnownBlock[]];
    }

    return [[
      { type: 'section', text: { type: 'mrkdwn', text: `*${this.data.gameName}:*` } },
      { type: 'section', text: { type: 'mrkdwn', text: `It is <@${nextPlayer.slackId}>'s turn to pick a team` } },
      { type: 'section', fields },
      {
        type: 'actions',
        elements: [{
          type: 'button',
          text: { type: 'plain_text', text: 'Pick A Team', emoji: true },
          action_id: ACTION_PICK_TEAM_BUTTON,
          value: this.data.uuid,
        }],
      },
      { type: 'section', text: { type: 'mrkdwn', text: 'You can still join the draft!' } },
      this.getJoiningButtonsBlock(),
      ...(this.getScoringUrl(PUBLIC_URL) ? [{
        type: 'context' as const,
        elements: [{ type: 'mrkdwn' as const, text: `📊 <${this.getScoringUrl(PUBLIC_URL)}|Live Scoring>` }],
      }] : []),
    ] as KnownBlock[]];
  }

  getJoiningButtonsBlock(): KnownBlock {
    const btn = (text: string, actionId: string) => ({
      type: 'button' as const,
      text: { type: 'plain_text' as const, text, emoji: true },
      action_id: actionId,
      value: this.data.uuid,
    });
    const elements = [
      btn('Join Game', ACTION_JOIN_GAME),
      btn('Leave Game', ACTION_LEAVE_GAME),
      ...(!this.data.hasStarted ? [btn('Start Draft', ACTION_START_GAME)] : []),
    ];
    return { type: 'actions', block_id: 'GameCreationButtons', elements } as KnownBlock;
  }
}

function fisherYatesShuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
