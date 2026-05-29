import { NextResponse } from 'next/server';
import { getGame, getClaims, setClaims, getGuesses, setGuesses } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req) {
  try {
    const { player, trackId } = await req.json();
    const game = await getGame();
    if (!game) return NextResponse.json({ ok: false, error: 'No game in progress' }, { status: 400 });
    if (game.revealed) return NextResponse.json({ ok: false, error: 'Game already revealed' }, { status: 400 });
    if (!game.players.includes(player)) {
      return NextResponse.json({ ok: false, error: 'Unknown player' }, { status: 400 });
    }

    const claims = await getClaims();

    // If someone else already claimed this track, reject.
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
      // Verify trackId actually exists in this game
      if (!game.tracks.some((t) => t.id === trackId)) {
        return NextResponse.json({ ok: false, error: 'Unknown track' }, { status: 400 });
      }
      claims[trackId] = player;
    }
    await setClaims(claims);

    // If they just claimed a track, drop any guess they had for it (you don't guess yourself)
    if (trackId) {
      const guesses = await getGuesses(player);
      if (guesses[trackId]) {
        delete guesses[trackId];
        await setGuesses(player, guesses);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
