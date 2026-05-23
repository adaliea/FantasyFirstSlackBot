/*
 * One-shot migration: parse a legacy `data/games.ser` produced by the old
 * Java implementation (commit 15a3f69) and upsert each game into Postgres
 * via Prisma.
 *
 * Usage (inside the production Docker container):
 *   node dist/scripts/migrateLegacySave.js [path/to/games.ser]
 *
 * Defaults to ./data/games.ser when no path is provided. Safe to re-run:
 * games are upserted by uuid.
 */

import * as fs from 'fs';
import * as path from 'path';

import { prisma, saveGame } from '../utils/persistence';
import { GameData, Player, Team } from '../types';

// java-deserialization ships no types and the parser is reachable only via
// the internal path; the require()s below pull both pieces in.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const javaDeserialization = require('java-deserialization');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const JavaParser = require('java-deserialization/src/parser');

type AnyObj = Record<string, any>;
type LongLike = { toUnsigned(): { toString(radix: number): string }; toNumber(): number };

// ConcurrentHashMap's writeObject emits three regular fields (segments,
// segmentShift, segmentMask) followed by key/value object pairs terminated
// by a (null, null) pair. Only HashMap/Hashtable ship with the library.
JavaParser.register(
  'java.util.concurrent.ConcurrentHashMap',
  '6499de129d87293d',
  function (_cls: unknown, fields: AnyObj, data: any[]) {
    const map = new Map<unknown, unknown>();
    const obj: AnyObj = {};
    for (let i = 0; i + 1 < data.length; i += 2) {
      const key = data[i];
      const value = data[i + 1];
      if (key === null && value === null) break;
      map.set(key, value);
      if (typeof key === 'string') obj[key] = value;
    }
    fields.map = map;
    fields.obj = obj;
    return fields;
  },
);

// CollSer is the serialization proxy emitted by List.of(...) / Set.of(...) /
// Map.of(...). Its writeObject writes the regular `tag` int, then a
// block-data int holding the length, then each element as an object.
// Modern OpenJDK uses the top-level java.util.CollSer; older JDKs used the
// inner class name. Register both.
const collSerParser = function (_cls: unknown, fields: AnyObj, data: any[]) {
  if (data.length === 0 || !Buffer.isBuffer(data[0])) {
    fields.list = [];
    return fields;
  }
  const len = (data[0] as Buffer).readInt32BE(0);
  fields.list = data.slice(1, 1 + len);
  return fields;
};
JavaParser.register('java.util.CollSer', '578eabb63a1ba811', collSerParser);
JavaParser.register(
  'java.util.ImmutableCollections$CollSer',
  '578eabb63a1ba811',
  collSerParser,
);

function longToUnsignedHex(value: LongLike): string {
  return value.toUnsigned().toString(16).padStart(16, '0');
}

function uuidToString(parsed: AnyObj | null | undefined): string | null {
  if (!parsed) return null;
  // Java UUID has private final long fields mostSigBits / leastSigBits.
  const fields = parsed['extends']?.['java.util.UUID'] ?? parsed;
  const high = fields.mostSigBits as LongLike | undefined;
  const low = fields.leastSigBits as LongLike | undefined;
  if (!high || !low) return null;
  const h = longToUnsignedHex(high);
  const l = longToUnsignedHex(low);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${l.slice(0, 4)}-${l.slice(4, 16)}`;
}

function extractList<T>(value: any): T[] {
  if (value == null) return [];
  if (Array.isArray(value.list)) return value.list as T[];
  if (Array.isArray(value)) return value as T[];
  // Some Map.of / List.of variants store fields directly. Fall back to the
  // raw annotations buffer if present.
  if (Array.isArray(value['@'])) {
    const raw = value['@'];
    if (raw.length > 0 && Buffer.isBuffer(raw[0])) {
      const len = (raw[0] as Buffer).readInt32BE(0);
      return raw.slice(1, 1 + len) as T[];
    }
  }
  return [];
}

function toTeam(raw: AnyObj): Team | null {
  const number = typeof raw.number === 'string' ? raw.number : null;
  const name = typeof raw.name === 'string' ? raw.name : number;
  const uuid = uuidToString(raw.uuid);
  if (!number || !uuid) return null;
  return { name: name ?? number, number, uuid };
}

function toPlayer(raw: AnyObj): Player | null {
  const slackId = typeof raw.slackId === 'string' ? raw.slackId : null;
  const name = typeof raw.name === 'string' ? raw.name : null;
  if (!slackId || !name) return null;
  const selectedTeams = extractList<AnyObj>(raw.selectedTeams)
    .map(toTeam)
    .filter((t): t is Team => t !== null);
  return { slackId, name, selectedTeams };
}

function toGameData(raw: AnyObj): GameData | null {
  const uuid = uuidToString(raw.uuid);
  const channelId = typeof raw.channelId === 'string' ? raw.channelId : null;
  const gameOwnerSlackId =
    typeof raw.gameOwnerSlackId === 'string' ? raw.gameOwnerSlackId : null;
  const gameName = typeof raw.gameName === 'string' ? raw.gameName : null;
  if (!uuid || !channelId || !gameOwnerSlackId || !gameName) return null;

  const allianceSize = typeof raw.allianceSize === 'number' ? raw.allianceSize : 0;
  const targetPlayersPerGame =
    typeof raw.targetPlayersPerGame === 'number' ? raw.targetPlayersPerGame : 0;
  const hasStarted = raw.hasStarted === true;
  const turnCountRaw = raw.turnCount;
  const turnCount =
    turnCountRaw && typeof turnCountRaw.toNumber === 'function'
      ? (turnCountRaw as LongLike).toNumber()
      : typeof turnCountRaw === 'number'
        ? turnCountRaw
        : 0;

  const availableTeams = extractList<AnyObj>(raw.availableTeams)
    .map(toTeam)
    .filter((t): t is Team => t !== null);
  const players = extractList<AnyObj>(raw.players)
    .map(toPlayer)
    .filter((p): p is Player => p !== null);
  const lastMessagesTsArray = extractList<string>(raw.lastMessagesTs).filter(
    (ts): ts is string => typeof ts === 'string',
  );

  return {
    uuid,
    channelId,
    allianceSize,
    availableTeams,
    players,
    gameOwnerSlackId,
    gameName,
    hasStarted,
    turnCount,
    lastMessagesTsArray,
    targetPlayersPerGame,
  };
}

async function main() {
  const savePath = path.resolve(process.argv[2] ?? './data/games.ser');
  if (!fs.existsSync(savePath) || !fs.statSync(savePath).isFile()) {
    console.error(`Save file not found: ${savePath}`);
    process.exit(1);
  }

  console.log(`Reading legacy save file: ${savePath}`);
  const buf = fs.readFileSync(savePath);

  const objects = javaDeserialization.parse(buf) as AnyObj[];
  if (!objects.length) {
    console.error('Save file contained no objects');
    process.exit(1);
  }

  const outer = objects[0];
  const outerMap: Map<unknown, unknown> | undefined =
    outer && typeof outer === 'object' ? (outer as AnyObj).map : undefined;
  if (!(outerMap instanceof Map)) {
    console.error(
      'Top-level object is not a ConcurrentHashMap as expected. ' +
        `Got class: ${(outer && (outer as AnyObj)['class']?.name) ?? 'unknown'}`,
    );
    process.exit(1);
  }

  let imported = 0;
  let skipped = 0;

  for (const [workspaceIdRaw, innerMapRaw] of outerMap.entries()) {
    const workspaceId =
      typeof workspaceIdRaw === 'string' ? workspaceIdRaw : String(workspaceIdRaw);
    const innerMap: Map<unknown, unknown> | undefined = (innerMapRaw as AnyObj)?.map;
    if (!(innerMap instanceof Map)) {
      console.warn(`Workspace ${workspaceId}: inner value is not a map, skipping`);
      continue;
    }

    for (const [, rawGame] of innerMap.entries()) {
      const game = toGameData(rawGame as AnyObj);
      if (!game) {
        console.warn(`Workspace ${workspaceId}: skipping unparseable game`);
        skipped++;
        continue;
      }
      try {
        await saveGame(workspaceId, game);
        imported++;
        console.log(
          `  imported ${workspaceId}/${game.uuid}  "${game.gameName}"  ` +
            `(players=${game.players.length}, teams=${game.availableTeams.length})`,
        );
      } catch (err) {
        skipped++;
        console.error(`  failed ${workspaceId}/${game.uuid}:`, err);
      }
    }
  }

  console.log(`\nDone. imported=${imported} skipped=${skipped}`);
}

main()
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
