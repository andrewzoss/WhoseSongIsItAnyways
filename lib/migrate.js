import { redis, sanitizeName, getLeague, setLeague } from './db';

// One-time migration: if the old single-round shape is in Redis ('game', 'claims',
// 'guesses:*' keys) and no 'league' key exists yet, migrate it into the new
// multi-round shape with that round as round 1.
//
// Safe to call on every request; it short-circuits if already migrated.
let _migrationDone = false;

export async function ensureMigrated() {
  if (_migrationDone) return;
  const r = redis();

  // Already migrated?
  const existing = await getLeague();
  if (existing) {
    _migrationDone = true;
    return;
  }

  // Old shape present?
  const oldGameRaw = await r.get('game');
  if (!oldGameRaw) {
    _migrationDone = true;
    return; // nothing to migrate
  }

  const oldGame = typeof oldGameRaw === 'string' ? JSON.parse(oldGameRaw) : oldGameRaw;
  const oldClaimsRaw = await r.get('claims');
  const oldClaims = oldClaimsRaw
    ? (typeof oldClaimsRaw === 'string' ? JSON.parse(oldClaimsRaw) : oldClaimsRaw)
    : {};

  const players = oldGame.players || [];
  const guesses = {};
  for (const p of players) {
    const key = `guesses:${sanitizeName(p)}`;
    const v = await r.get(key);
    if (v) {
      guesses[p] = typeof v === 'string' ? JSON.parse(v) : v;
    } else {
      guesses[p] = {};
    }
  }

  const round = {
    id: 'r1',
    name: oldGame.playlistName || 'Round 1',
    playlistUrl: oldGame.playlistUrl || '',
    playlistId: oldGame.playlistId || null,
    tracks: oldGame.tracks || [],
    players,
    claims: oldClaims,
    guesses,
    revealed: !!oldGame.revealed,
    createdAt: oldGame.createdAt || Date.now(),
  };

  const league = {
    adminName: oldGame.adminName || (players[0] || ''),
    players,
    rounds: [round],
    activeRoundIdx: 0,
    createdAt: oldGame.createdAt || Date.now(),
  };

  await setLeague(league);

  // Clean up old keys (best effort)
  await r.del('game').catch(() => {});
  await r.del('claims').catch(() => {});
  for (const p of players) {
    await r.del(`guesses:${sanitizeName(p)}`).catch(() => {});
  }
  // Keep spotify_creds since they're harmless and unused now

  _migrationDone = true;
}
