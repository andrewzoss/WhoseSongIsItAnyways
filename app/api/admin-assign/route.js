import { NextResponse } from 'next/server';
import { getLeague, isAdmin, patchRound } from '@/lib/db';
import { ensureMigrated } from '@/lib/migrate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Admin-only: assign (or clear) the true submitter for a track in a specific
// round (by index). Defaults to the active round if no index is given.
export async function POST(req) {
  try {
    await ensureMigrated();
    const { actor, trackId, submitter, roundIdx } = await req.json();
    const league = await getLeague();
    if (!league) {
      return NextResponse.json({ ok: false, error: 'No league in progress' }, { status: 400 });
    }
    if (!isAdmin(league, actor)) {
      return NextResponse.json({ ok: false, error: 'Only the admin can override claims' }, { status: 403 });
    }
    const idx = (typeof roundIdx === 'number') ? roundIdx : (league.activeRoundIdx ?? league.rounds.length - 1);
    if (idx < 0 || idx >= league.rounds.length) {
      return NextResponse.json({ ok: false, error: 'Invalid round index' }, { status: 400 });
    }
    const round = league.rounds[idx];
    if (!round.tracks.some((t) => t.id === trackId)) {
      return NextResponse.json({ ok: false, error: 'Unknown track' }, { status: 400 });
    }
    if (submitter && !round.players.includes(submitter)) {
      return NextResponse.json({ ok: false, error: 'Unknown submitter' }, { status: 400 });
    }

    const claims = { ...(round.claims || {}) };
    const guesses = { ...(round.guesses || {}) };

    if (submitter) {
      // Each player owns one song per round
      for (const [tid, p] of Object.entries(claims)) {
        if (p === submitter && tid !== trackId) delete claims[tid];
      }
      claims[trackId] = submitter;
      // Drop any guess the new submitter had for this track
      if (guesses[submitter]?.[trackId]) {
        const sg = { ...guesses[submitter] };
        delete sg[trackId];
        guesses[submitter] = sg;
      }
    } else {
      delete claims[trackId];
    }
    await patchRound(idx, { claims, guesses });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
