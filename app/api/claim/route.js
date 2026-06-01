import { NextResponse } from 'next/server';
import { getLeague, activeRound, patchActiveRound } from '@/lib/db';
import { ensureMigrated } from '@/lib/migrate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req) {
  try {
    await ensureMigrated();
    const { player, trackId } = await req.json();
    const league = await getLeague();
    if (!league) {
      return NextResponse.json({ ok: false, error: 'No league in progress' }, { status: 400 });
    }
    const round = activeRound(league);
    if (!round) {
      return NextResponse.json({ ok: false, error: 'No active round' }, { status: 400 });
    }
    if (round.revealed) {
      return NextResponse.json({ ok: false, error: 'Round already revealed' }, { status: 400 });
    }
    if (!round.players.includes(player)) {
      return NextResponse.json({ ok: false, error: 'You are not part of this round' }, { status: 400 });
    }

    const claims = { ...(round.claims || {}) };

    if (trackId && claims[trackId] && claims[trackId] !== player) {
      return NextResponse.json(
        { ok: false, error: `${claims[trackId]} already claimed that song.` },
        { status: 409 }
      );
    }

    // Remove any prior claim by this player
    for (const [tid, p] of Object.entries(claims)) {
      if (p === player) delete claims[tid];
    }
    if (trackId) {
      if (!round.tracks.some((t) => t.id === trackId)) {
        return NextResponse.json({ ok: false, error: 'Unknown track' }, { status: 400 });
      }
      claims[trackId] = player;
    }

    const guesses = { ...(round.guesses || {}) };
    // Players don't guess their own claim, so clear any stale guess for the new claim
    if (trackId && guesses[player]?.[trackId]) {
      const pg = { ...guesses[player] };
      delete pg[trackId];
      guesses[player] = pg;
    }

    await patchActiveRound({ claims, guesses });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
