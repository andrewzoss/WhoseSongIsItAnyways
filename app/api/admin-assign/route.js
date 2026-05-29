import { NextResponse } from 'next/server';
import { getGame, getClaims, setClaims, getGuesses, setGuesses, isAdmin } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Admin-only: assign (or clear) the true submitter for a track, overriding
// whatever the players claimed. This is how the admin handles cases where
// someone didn't claim their own song, or someone claimed the wrong one.
export async function POST(req) {
  try {
    const { actor, trackId, submitter } = await req.json();
    const game = await getGame();
    if (!game) {
      return NextResponse.json({ ok: false, error: 'No game in progress' }, { status: 400 });
    }
    if (!isAdmin(game, actor)) {
      return NextResponse.json({ ok: false, error: 'Only the admin can override claims' }, { status: 403 });
    }
    if (!game.tracks.some((t) => t.id === trackId)) {
      return NextResponse.json({ ok: false, error: 'Unknown track' }, { status: 400 });
    }
    if (submitter && !game.players.includes(submitter)) {
      return NextResponse.json({ ok: false, error: 'Unknown submitter' }, { status: 400 });
    }

    const claims = await getClaims();

    if (submitter) {
      // If submitter previously had a different claim, remove it (each player
      // can only "own" one song).
      for (const [tid, p] of Object.entries(claims)) {
        if (p === submitter && tid !== trackId) delete claims[tid];
      }
      claims[trackId] = submitter;

      // Clear any guess the new submitter had for this track.
      const subGuesses = await getGuesses(submitter);
      if (subGuesses[trackId]) {
        delete subGuesses[trackId];
        await setGuesses(submitter, subGuesses);
      }
    } else {
      delete claims[trackId];
    }

    await setClaims(claims);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
