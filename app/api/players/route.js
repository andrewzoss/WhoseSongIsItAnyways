import { NextResponse } from 'next/server';
import { getLeague, patchLeague, patchActiveRound, activeRound, sanitizeName, isAdmin } from '@/lib/db';
import { ensureMigrated } from '@/lib/migrate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Update the league-level roster. Changes also apply to the active round
// (if not yet revealed). Past revealed rounds keep their original rosters
// so historical scoring isn't broken.
export async function POST(req) {
  try {
    await ensureMigrated();
    const { actor, players: newPlayersRaw } = await req.json();

    const league = await getLeague();
    if (!league) {
      return NextResponse.json({ ok: false, error: 'No league in progress' }, { status: 400 });
    }
    if (!isAdmin(league, actor)) {
      return NextResponse.json({ ok: false, error: 'Only the admin can change the player list' }, { status: 403 });
    }

    if (!Array.isArray(newPlayersRaw)) {
      return NextResponse.json({ ok: false, error: 'players must be an array' }, { status: 400 });
    }
    const newPlayers = newPlayersRaw.map((p) => String(p || '').trim()).filter(Boolean);
    if (newPlayers.length < 2) {
      return NextResponse.json({ ok: false, error: 'Need at least 2 players.' }, { status: 400 });
    }
    const lower = new Set(newPlayers.map((p) => p.toLowerCase()));
    if (lower.size !== newPlayers.length) {
      return NextResponse.json({ ok: false, error: 'Player names must be unique.' }, { status: 400 });
    }
    const sanitized = new Set(newPlayers.map((p) => sanitizeName(p)));
    if (sanitized.size !== newPlayers.length) {
      return NextResponse.json(
        { ok: false, error: 'Two player names normalize to the same key — make them more distinct.' },
        { status: 400 }
      );
    }
    if (!newPlayers.includes(league.adminName)) {
      return NextResponse.json(
        { ok: false, error: `Admin (${league.adminName}) must remain in the list.` },
        { status: 400 }
      );
    }

    const removed = league.players.filter((p) => !newPlayers.includes(p));
    const added = newPlayers.filter((p) => !league.players.includes(p));

    // Update the global roster
    league.players = newPlayers;

    // Apply to the active round if it's unrevealed
    const round = activeRound(league);
    if (round && !round.revealed) {
      // Sync round's roster to the new global roster
      round.players = newPlayers;

      // Clean up removed players' data from active round
      if (removed.length > 0) {
        const claims = { ...(round.claims || {}) };
        for (const [tid, p] of Object.entries(claims)) {
          if (removed.includes(p)) delete claims[tid];
        }
        const guesses = { ...(round.guesses || {}) };
        // Drop removed players' guess records
        for (const r of removed) delete guesses[r];
        // Scrub removed names from remaining players' guesses
        for (const p of newPlayers) {
          if (!guesses[p]) continue;
          const pg = { ...guesses[p] };
          let changed = false;
          for (const [tid, gx] of Object.entries(pg)) {
            if (removed.includes(gx)) { delete pg[tid]; changed = true; }
          }
          if (changed) guesses[p] = pg;
        }
        round.claims = claims;
        round.guesses = guesses;
      }
      league.rounds[league.activeRoundIdx] = round;
    }

    await patchLeague({ players: league.players, rounds: league.rounds });
    return NextResponse.json({ ok: true, added, removed, total: newPlayers.length });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
