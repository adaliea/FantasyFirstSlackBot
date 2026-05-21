import { reconstructPicks } from '../../src/scoring/draftHistory';
import { Game } from '../../src/game/Game';
import { createTeam } from '../../src/types';

function makeGame(allianceSize: number, playerNames: string[], picks: string[][]): Game {
  const teams = Array.from({ length: allianceSize * playerNames.length }, (_, i) =>
    createTeam(String(i + 1)),
  );
  const game = Game.create({
    channelId: 'C123',
    allianceSize,
    teams,
    gameOwnerSlackId: 'U0',
    gameName: 'Test',
  });

  // Add players
  for (let i = 0; i < playerNames.length; i++) {
    game.players.push({ slackId: `U${i + 1}`, name: playerNames[i], selectedTeams: [] });
  }

  // Simulate picks: move teams from available to players
  for (let round = 0; round < allianceSize; round++) {
    const playerOrder = round % 2 === 0
      ? [...game.players]
      : [...game.players].reverse();

    for (const player of playerOrder) {
      const teamNum = picks[game.players.indexOf(player)]?.[round];
      if (!teamNum) continue;
      const idx = game.availableTeams.findIndex(t => t.number === teamNum);
      if (idx >= 0) {
        const [team] = game.availableTeams.splice(idx, 1);
        player.selectedTeams.push(team);
      }
    }
  }

  // Mark as started
  (game as unknown as { data: { hasStarted: boolean } }).data.hasStarted = true;

  return game;
}

describe('reconstructPicks', () => {
  test('returns empty array for unstarted game', () => {
    const game = Game.create({
      channelId: 'C1',
      allianceSize: 2,
      teams: [createTeam('1'), createTeam('2'), createTeam('3'), createTeam('4')],
      gameOwnerSlackId: 'U0',
      gameName: 'Test',
    });
    expect(reconstructPicks(game)).toHaveLength(0);
  });

  test('2 players, 2 rounds — snake order', () => {
    // Player A picks first in round 1 (odd), Player B picks first in round 2 (even reversed)
    // Round 1: A picks '1', B picks '2'
    // Round 2 (reversed): B picks '3', A picks '4'
    const game = makeGame(2, ['Alice', 'Bob'], [['1', '4'], ['2', '3']]);
    const picks = reconstructPicks(game);
    expect(picks).toHaveLength(4);

    // Round 1: Alice first
    expect(picks[0].playerName).toBe('Alice');
    expect(picks[0].round).toBe(1);
    expect(picks[0].teamNumber).toBe('1');
    expect(picks[0].poolBefore).toHaveLength(4);  // all 4 teams available

    // Round 1: Bob second
    expect(picks[1].playerName).toBe('Bob');
    expect(picks[1].round).toBe(1);
    expect(picks[1].teamNumber).toBe('2');
    expect(picks[1].poolBefore).toHaveLength(3);  // team '1' already picked

    // Round 2 (reversed): Bob first
    expect(picks[2].playerName).toBe('Bob');
    expect(picks[2].round).toBe(2);
    expect(picks[2].teamNumber).toBe('3');
    expect(picks[2].poolBefore).toHaveLength(2);

    // Round 2: Alice last
    expect(picks[3].playerName).toBe('Alice');
    expect(picks[3].round).toBe(2);
    expect(picks[3].teamNumber).toBe('4');
    expect(picks[3].poolBefore).toHaveLength(1);
  });

  test('pool shrinks correctly after each pick', () => {
    const game = makeGame(2, ['Alice', 'Bob'], [['1', '4'], ['2', '3']]);
    const picks = reconstructPicks(game);

    for (let i = 1; i < picks.length; i++) {
      expect(picks[i].poolBefore).toHaveLength(picks[i - 1].poolBefore.length - 1);
    }
  });

  test('3 players, 3 rounds — pool size decreases by 1 each pick', () => {
    // 9 teams total, 3 players, 3 rounds
    const game = makeGame(3, ['A', 'B', 'C'], [
      ['1', '6', '7'],  // A: round1, round2(last in reversed order), round3
      ['2', '5', '8'],
      ['3', '4', '9'],
    ]);
    const picks = reconstructPicks(game);
    expect(picks).toHaveLength(9);
    expect(picks[0].poolBefore).toHaveLength(9);
    expect(picks[8].poolBefore).toHaveLength(1);
  });
});
