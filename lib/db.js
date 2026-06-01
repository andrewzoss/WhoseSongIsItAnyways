import { Redis } from '@upstash/redis';

let _redis = null;
export function redis() {
  if (_redis) return _redis;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      'Redis not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in your environment.'
    );
  }
  _redis = new Redis({ url, token });
  return _redis;
}

export const sanitizeName = (name) =>
  String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

// ---------- Data shape ----------
// 'league' key holds the persistent state across all rounds:
//   {
//     adminName: string,
//     players: string[],
//     rounds: Round[],
//     activeRoundIdx: number,   // index into rounds; the round being played now
//     createdAt: number,
//   }
// Each Round looks like:
//   {
//     id: string,              // unique id like 'r1', 'r2'
//     name: string,            // playlist name
//     playlistUrl: string,
//     playlistId: string,
//     tracks: Track[],
//     players: string[],       // snapshot of the roster at the time this round started
//     claims: Record<trackId, playerName>,
//     guesses: Record<playerName, Record<trackId, guessedName>>,
//     revealed: boolean,
//     createdAt: number,
//   }

const K = {
  league: 'league',
};

export async function getLeague() {
  const v = await redis().get(K.league);
  if (!v) return null;
  return typeof v === 'string' ? JSON.parse(v) : v;
}

export async function setLeague(league) {
  await redis().set(K.league, JSON.stringify(league));
}

export async function patchLeague(patch) {
  const l = await getLeague();
  if (!l) throw new Error('No league in progress');
  const next = { ...l, ...patch };
  await setLeague(next);
  return next;
}

// Convenience: get the active round (or null if no league)
export function activeRound(league) {
  if (!league || !Array.isArray(league.rounds) || league.rounds.length === 0) return null;
  const idx = Math.min(Math.max(league.activeRoundIdx ?? league.rounds.length - 1, 0), league.rounds.length - 1);
  return league.rounds[idx];
}

// Update the active round in place and persist
export async function patchActiveRound(patch) {
  const league = await getLeague();
  if (!league) throw new Error('No league in progress');
  const idx = league.activeRoundIdx ?? league.rounds.length - 1;
  if (idx < 0 || idx >= league.rounds.length) throw new Error('No active round');
  league.rounds[idx] = { ...league.rounds[idx], ...patch };
  await setLeague(league);
  return league;
}

// Update a specific round (by index) in place. Used for admin overrides on
// past rounds and similar.
export async function patchRound(idx, patch) {
  const league = await getLeague();
  if (!league) throw new Error('No league in progress');
  if (idx < 0 || idx >= league.rounds.length) throw new Error('Round index out of range');
  league.rounds[idx] = { ...league.rounds[idx], ...patch };
  await setLeague(league);
  return league;
}

export async function deleteLeague() {
  await redis().del(K.league);
}

// Admin check uses the league's adminName field.
export function isAdmin(league, playerName) {
  if (!league || !playerName) return false;
  return sanitizeName(league.adminName) === sanitizeName(playerName);
}

// Score a single round. Returns { playerName: pointsInThisRound }
export function scoreRound(round) {
  const scores = {};
  if (!round) return scores;
  const players = round.players || [];
  players.forEach((p) => { scores[p] = 0; });
  for (const t of round.tracks || []) {
    const truth = round.claims?.[t.id];
    if (!truth) continue;
    for (const p of players) {
      if (p === truth) continue;
      const g = round.guesses?.[p]?.[t.id];
      if (g === truth) scores[p] += 1;
    }
  }
  return scores;
}

// Combined scores across all revealed rounds. Players who are in the current
// roster but missing from old rounds get 0 for those rounds (and vice versa
// — old players who left still appear with their historical totals).
export function leagueTotals(league) {
  const totals = {};
  if (!league) return totals;
  // Seed with current roster so everyone shows up even if 0
  (league.players || []).forEach((p) => { totals[p] = 0; });
  for (const round of league.rounds || []) {
    if (!round.revealed) continue;
    const s = scoreRound(round);
    for (const [name, pts] of Object.entries(s)) {
      totals[name] = (totals[name] || 0) + pts;
    }
  }
  return totals;
}
