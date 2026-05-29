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

const K = {
  game: 'game',
  claims: 'claims',
  guesses: (name) => `guesses:${sanitizeName(name)}`,
  spotifyCreds: 'spotify_creds',
};

export async function getGame() {
  const v = await redis().get(K.game);
  if (!v) return null;
  return typeof v === 'string' ? JSON.parse(v) : v;
}
export async function setGame(g) {
  await redis().set(K.game, JSON.stringify(g));
}
export async function patchGame(patch) {
  const g = await getGame();
  if (!g) throw new Error('No game in progress');
  const next = { ...g, ...patch };
  await setGame(next);
  return next;
}

export async function getClaims() {
  const v = await redis().get(K.claims);
  if (!v) return {};
  return typeof v === 'string' ? JSON.parse(v) : v;
}
export async function setClaims(c) {
  await redis().set(K.claims, JSON.stringify(c));
}

export async function getGuesses(playerName) {
  const v = await redis().get(K.guesses(playerName));
  if (!v) return {};
  return typeof v === 'string' ? JSON.parse(v) : v;
}
export async function setGuesses(playerName, guesses) {
  await redis().set(K.guesses(playerName), JSON.stringify(guesses));
}
export async function getAllGuesses(players) {
  const out = {};
  await Promise.all(
    (players || []).map(async (p) => {
      out[p] = await getGuesses(p);
    })
  );
  return out;
}

export async function getSpotifyCreds() {
  const v = await redis().get(K.spotifyCreds);
  if (!v) return null;
  return typeof v === 'string' ? JSON.parse(v) : v;
}
export async function setSpotifyCreds(creds) {
  await redis().set(K.spotifyCreds, JSON.stringify(creds));
}

export async function resetGameData(players) {
  const r = redis();
  await Promise.all([
    r.del(K.game),
    r.del(K.claims),
    ...(players || []).map((p) => r.del(K.guesses(p))),
  ]);
}

export function isAdmin(game, playerName) {
  if (!game || !playerName) return false;
  return sanitizeName(game.adminName) === sanitizeName(playerName);
}
