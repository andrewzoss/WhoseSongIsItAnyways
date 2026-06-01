import { NextResponse } from 'next/server';
import { getLeague, setLeague, sanitizeName } from '@/lib/db';
import { ensureMigrated } from '@/lib/migrate';
import { fetchPlaylist, extractPlaylistId } from '@/lib/spotify';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/setup
// Two modes:
//   1) Initial setup (no league exists yet): creates a new league with round 1
//      Body: { playlistUrl, manualTracks?, playlistName?, players[], adminName }
//   2) New-round setup (league exists, actor must be admin): appends a new round
//      Body: { actor, playlistUrl, manualTracks?, playlistName? }
export async function POST(req) {
  try {
    await ensureMigrated();
    const body = await req.json();
    const { playlistUrl, manualTracks } = body;

    const existing = await getLeague();

    // ---------- Mode 2: new round (league exists) ----------
    if (existing) {
      const { actor } = body;
      if (!actor || sanitizeName(actor) !== sanitizeName(existing.adminName)) {
        return NextResponse.json(
          { ok: false, error: 'Only the admin can start a new round' },
          { status: 403 }
        );
      }
      // Require the current active round to be revealed (so scores are locked)
      const lastIdx = existing.rounds.length - 1;
      const lastRound = existing.rounds[lastIdx];
      if (lastRound && !lastRound.revealed) {
        return NextResponse.json(
          { ok: false, error: 'Finish the current round first (reveal results) before starting a new one.' },
          { status: 400 }
        );
      }

      const { tracks, playlistName } = await loadTracks({ playlistUrl, manualTracks, fallbackName: body.playlistName });
      const newRound = makeRound({
        idx: existing.rounds.length,
        name: playlistName,
        playlistUrl,
        tracks,
        players: existing.players, // snapshot at round start
      });
      existing.rounds.push(newRound);
      existing.activeRoundIdx = existing.rounds.length - 1;
      await setLeague(existing);
      return NextResponse.json({ ok: true, mode: 'new-round', roundIndex: existing.activeRoundIdx, trackCount: tracks.length });
    }

    // ---------- Mode 1: initial setup ----------
    const { players, adminName } = body;
    const validationError = validateInitialSetup({ players, adminName });
    if (validationError) {
      return NextResponse.json({ ok: false, error: validationError }, { status: 400 });
    }

    const { tracks, playlistName } = await loadTracks({ playlistUrl, manualTracks, fallbackName: body.playlistName });

    const round = makeRound({
      idx: 0,
      name: playlistName,
      playlistUrl,
      tracks,
      players,
    });

    const league = {
      adminName,
      players,
      rounds: [round],
      activeRoundIdx: 0,
      createdAt: Date.now(),
    };
    await setLeague(league);
    return NextResponse.json({ ok: true, mode: 'initial', trackCount: tracks.length });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || 'Setup failed' }, { status: 500 });
  }
}

function validateInitialSetup({ players, adminName }) {
  if (!Array.isArray(players) || players.length < 2) return 'Need at least 2 players.';
  const uniq = new Set(players.map((p) => p.toLowerCase()));
  if (uniq.size !== players.length) return 'Player names must be unique.';
  const sanitized = new Set(players.map((p) => sanitizeName(p)));
  if (sanitized.size !== players.length) return 'Two player names normalize to the same key — make them more distinct.';
  if (!adminName || !players.includes(adminName)) return 'Admin name must be one of the players.';
  return null;
}

async function loadTracks({ playlistUrl, manualTracks, fallbackName }) {
  if (Array.isArray(manualTracks) && manualTracks.length > 0) {
    const tracks = manualTracks.map((t, i) => ({
      id: `manual-${Date.now()}-${i}`,
      name: (t.name || '').trim(),
      artists: (t.artists || '').trim(),
      albumArt: null,
    })).filter((t) => t.name);
    if (tracks.length === 0) throw new Error('Manual tracks list was empty.');
    return { tracks, playlistName: fallbackName || 'Round playlist' };
  }
  if (!extractPlaylistId(playlistUrl)) {
    throw new Error('Invalid playlist URL.');
  }
  return await fetchPlaylist(playlistUrl);
}

function makeRound({ idx, name, playlistUrl, tracks, players }) {
  return {
    id: `r${idx + 1}`,
    name: name || `Round ${idx + 1}`,
    playlistUrl: playlistUrl || '',
    playlistId: extractPlaylistId(playlistUrl) || null,
    tracks,
    players,
    claims: {},
    guesses: {},
    revealed: false,
    createdAt: Date.now(),
  };
}
