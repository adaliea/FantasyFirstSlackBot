import { Game } from '../src/game/Game';
import { createPlayer, createTeam, Player, Team } from '../src/types';

function makeTeams(numbers: string[]): Team[] {
  return numbers.map(n => createTeam(n));
}

function makeGame(teamNumbers: string[], allianceSize = 3, targetPlayersPerGame = 0): Game {
  return Game.create({
    channelId: 'C123',
    allianceSize,
    teams: makeTeams(teamNumbers),
    gameOwnerSlackId: 'U_OWNER',
    gameName: 'Test Game',
    targetPlayersPerGame,
  });
}

describe('Game', () => {
  describe('create', () => {
    it('sorts available teams numerically on creation', () => {
      const game = makeGame(['7157', '254', '1678']);
      expect(game.availableTeams.map(t => t.number)).toEqual(['254', '1678', '7157']);
    });

    it('starts with no players and not started', () => {
      const game = makeGame(['254', '1678', '7157']);
      expect(game.players).toHaveLength(0);
      expect(game.hasStarted).toBe(false);
    });
  });

  describe('addPlayer / removePlayer', () => {
    it('adds a player', () => {
      const game = makeGame(['254', '1678', '7157']);
      game.addPlayer(createPlayer('U1', 'Alice'));
      expect(game.players).toHaveLength(1);
      expect(game.players[0].name).toBe('Alice');
    });

    it('removes a player and returns their teams to the pool', () => {
      const game = makeGame(['254', '1678', '7157', '4272', '118', '2056'], 3);
      game.addPlayer(createPlayer('U1', 'Alice'));
      game.addPlayer(createPlayer('U2', 'Bob'));
      game.start();
      game.pickTeamByNumber('254');
      game.pickTeamByNumber('1678');
      const poolBefore = game.availableTeams.length;
      const picksCount = game.players.find(p => p.slackId === 'U1')?.selectedTeams.length ?? 0;
      game.removePlayer('U1');
      expect(game.availableTeams.length).toBe(poolBefore + picksCount);
      expect(game.isPlayerInGame('U1')).toBe(false);
    });

    it('returns false when removing a player not in the game', () => {
      const game = makeGame(['254', '1678', '7157']);
      expect(game.removePlayer('NOBODY')).toBe(false);
    });
  });

  describe('isPlayerInGame', () => {
    it('detects a player in the game', () => {
      const game = makeGame(['254', '1678', '7157']);
      game.addPlayer(createPlayer('U1', 'Alice'));
      expect(game.isPlayerInGame('U1')).toBe(true);
      expect(game.isPlayerInGame('U2')).toBe(false);
    });
  });

  describe('getActualMaxPlayers', () => {
    it('computes max players from total teams', () => {
      const game = makeGame(['254', '1678', '7157', '4272', '118', '2056'], 3);
      expect(game.getActualMaxPlayers()).toBe(2);
    });

    it('counts picked teams toward total', () => {
      const game = makeGame(['254', '1678', '7157', '4272', '118', '2056'], 3);
      game.addPlayer(createPlayer('U1', 'Alice'));
      game.start();
      game.pickTeamByNumber('254');
      // 5 remaining + 1 picked = 6 total, maxPlayers = 2
      expect(game.getActualMaxPlayers()).toBe(2);
    });
  });

  describe('isFull', () => {
    it('is not full before game starts', () => {
      const game = makeGame(['254', '1678', '7157'], 3);
      game.addPlayer(createPlayer('U1', 'Alice'));
      expect(game.isFull()).toBe(false);
    });

    it('is full when players meet max', () => {
      const game = makeGame(['254', '1678', '7157'], 3);
      game.addPlayer(createPlayer('U1', 'Alice'));
      game.start();
      expect(game.isFull()).toBe(true); // 3 teams / 3 per player = 1 player max
    });
  });

  describe('start / unStart', () => {
    it('sets hasStarted to true', () => {
      const game = makeGame(['254', '1678', '7157']);
      game.addPlayer(createPlayer('U1', 'Alice'));
      game.start();
      expect(game.hasStarted).toBe(true);
    });

    it('is idempotent — calling start twice does nothing', () => {
      const game = makeGame(['254', '1678', '7157']);
      game.addPlayer(createPlayer('U1', 'Alice'));
      game.start();
      const orderAfterFirst = game.players.map(p => p.slackId);
      game.start();
      expect(game.players.map(p => p.slackId)).toEqual(orderAfterFirst);
    });

    it('unStart resets draft state and returns picked teams', () => {
      const game = makeGame(['254', '1678', '7157', '4272', '118', '2056'], 3);
      game.addPlayer(createPlayer('U1', 'Alice'));
      game.addPlayer(createPlayer('U2', 'Bob'));
      game.start();
      game.pickTeamByNumber('254');
      game.pickTeamByNumber('1678');
      game.unStart();
      expect(game.hasStarted).toBe(false);
      expect(game.turnCount).toBe(0);
      expect(game.availableTeams).toHaveLength(6);
      expect(game.players.every(p => p.selectedTeams.length === 0)).toBe(true);
    });
  });

  describe('pickTeamByNumber / pickTeamByUuid', () => {
    it('assigns picked team to the next player', () => {
      const game = makeGame(['254', '1678', '7157']);
      game.addPlayer(createPlayer('U1', 'Alice'));
      game.start();
      const result = game.pickTeamByNumber('254');
      expect(result).not.toBeNull();
      expect(result!.number).toBe('254');
      expect(game.players[0].selectedTeams).toHaveLength(1);
    });

    it('returns null for a team not in the pool', () => {
      const game = makeGame(['254', '1678', '7157']);
      game.addPlayer(createPlayer('U1', 'Alice'));
      game.start();
      expect(game.pickTeamByNumber('9999')).toBeNull();
    });

    it('pickTeamByUuid works correctly', () => {
      const game = makeGame(['254', '1678', '7157']);
      game.addPlayer(createPlayer('U1', 'Alice'));
      game.start();
      const teamUuid = game.availableTeams[0].uuid;
      expect(game.pickTeamByUuid(teamUuid)).toBe(true);
      expect(game.availableTeams).toHaveLength(2);
    });

    it('returns false for an invalid uuid', () => {
      const game = makeGame(['254', '1678', '7157']);
      game.addPlayer(createPlayer('U1', 'Alice'));
      game.start();
      expect(game.pickTeamByUuid('00000000-0000-0000-0000-000000000000')).toBe(false);
    });
  });

  describe('getNextPlayerInDraft (snake draft)', () => {
    it('returns players in snake order across rounds', () => {
      const game = makeGame(
        ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
        3,
      );
      const alice = createPlayer('U1', 'Alice');
      const bob = createPlayer('U2', 'Bob');
      const carol = createPlayer('U3', 'Carol');
      game.addPlayer(alice);
      game.addPlayer(bob);
      game.addPlayer(carol);
      game.start();
      // Fix player order for determinism
      game.players.length = 0;
      game.players.push(alice, bob, carol);

      const order: string[] = [];
      while (game.getNextPlayerInDraft()) {
        const next = game.getNextPlayerInDraft()!;
        order.push(next.name);
        game.pickTeamByNumber(game.availableTeams[0].number);
      }

      // Round 1: Alice Bob Carol  Round 2: Carol Bob Alice  Round 3: Alice Bob Carol
      expect(order).toEqual(['Alice', 'Bob', 'Carol', 'Carol', 'Bob', 'Alice', 'Alice', 'Bob', 'Carol']);
    });

    it('returns null when all teams have been picked', () => {
      const game = makeGame(['254', '1678', '7157'], 3);
      game.addPlayer(createPlayer('U1', 'Alice'));
      game.start();
      game.pickTeamByNumber('254');
      game.pickTeamByNumber('1678');
      game.pickTeamByNumber('7157');
      expect(game.getNextPlayerInDraft()).toBeNull();
    });
  });

  describe('splitPlayers', () => {
    it('returns all players in one group when targetPlayersPerGame is 0', () => {
      const game = makeGame(['254', '1678', '7157', '4272', '118', '2056'], 3, 0);
      game.addPlayer(createPlayer('U1', 'Alice'));
      game.addPlayer(createPlayer('U2', 'Bob'));
      const groups = game.splitPlayers();
      expect(groups).toHaveLength(1);
      expect(groups[0]).toHaveLength(2);
    });

    it('splits into multiple groups when targetPlayersPerGame is set', () => {
      const teams = Array.from({ length: 24 }, (_, i) => String(i + 1));
      const game = makeGame(teams, 3, 4);
      for (let i = 0; i < 8; i++) {
        game.addPlayer(createPlayer(`U${i}`, `Player${i}`));
      }
      const groups = game.splitPlayers();
      expect(groups.length).toBeGreaterThan(1);
      const total = groups.reduce((s, g) => s + g.length, 0);
      expect(total).toBe(8);
    });

    it('does not exceed actualMaxPlayers per group', () => {
      const teams = Array.from({ length: 9 }, (_, i) => String(i + 1)); // 9 teams, allianceSize 3 → max 3 players
      const game = makeGame(teams, 3, 2);
      for (let i = 0; i < 6; i++) {
        game.addPlayer(createPlayer(`U${i}`, `Player${i}`));
      }
      const groups = game.splitPlayers();
      for (const group of groups) {
        expect(group.length).toBeLessThanOrEqual(3);
      }
    });
  });

  describe('getMarkdownTable', () => {
    it('returns a string starting and ending with code fences', () => {
      const game = makeGame(['254', '1678', '7157'], 3);
      game.addPlayer(createPlayer('U1', 'Alice'));
      const table = game.getMarkdownTable();
      expect(table.startsWith('```')).toBe(true);
      expect(table.endsWith('```')).toBe(true);
    });

    it('includes player names', () => {
      const game = makeGame(['254', '1678', '7157'], 3);
      game.addPlayer(createPlayer('U1', 'Alice'));
      game.addPlayer(createPlayer('U2', 'Bob'));
      const table = game.getMarkdownTable();
      expect(table).toContain('Alice');
      expect(table).toContain('Bob');
    });

    it('includes selected teams in the table', () => {
      const game = makeGame(['254', '1678', '7157', '4272', '118', '2056'], 3);
      game.addPlayer(createPlayer('U1', 'Alice'));
      game.start();
      game.pickTeamByNumber('254');
      const table = game.getMarkdownTable();
      expect(table).toContain('254');
    });
  });

  describe('getCompactPlayerList', () => {
    it('lists players with their picks', () => {
      const game = makeGame(['254', '1678', '7157', '4272', '118', '2056'], 3);
      game.addPlayer(createPlayer('U1', 'Alice'));
      game.start();
      game.pickTeamByNumber('254');
      const compact = game.getCompactPlayerList();
      expect(compact).toContain('Alice');
      expect(compact).toContain('254');
    });
  });

  describe('toData / fromData', () => {
    it('round-trips game data correctly', () => {
      const game = makeGame(['254', '1678', '7157'], 3);
      game.addPlayer(createPlayer('U1', 'Alice'));
      const data = game.toData();
      const restored = Game.fromData(data);
      expect(restored.uuid).toBe(game.uuid);
      expect(restored.players[0].name).toBe('Alice');
      expect(restored.availableTeams).toHaveLength(3);
    });

    it('fromData produces an independent copy', () => {
      const game = makeGame(['254', '1678', '7157'], 3);
      const data = game.toData();
      const restored = Game.fromData(data);
      restored.gameName = 'Modified';
      expect(game.gameName).toBe('Test Game');
    });
  });
});
