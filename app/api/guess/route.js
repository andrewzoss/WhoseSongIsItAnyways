import { NextResponse } from 'next/server';
import { getGame, getGuesses, setGuesses } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req) {
  try {
    const { player, trackId, guess } = await req.json();
    const game = await getGame();
    if (!game) return NextResponse.json({ ok: false, error: 'No game in progress' }, { status: 400 });
    if (game.revealed) return NextResponse.json({ ok: false, error: 'Game already revealed' }, { status: 400 });
    if (!game.players.includes(player)) {
      return NextResponse.json({ ok: false, error: 'Unknown player' }, { status: 400 });
    }
    if (!game.tracks.some((t) => t.id === trackId)) {
      return NextResponse.json({ ok: false, error: 'Unknown track' }, { status: 400 });
    }
    if (guess && !game.players.includes(guess)) {
      return NextResponse.json({ ok: false, error: 'Unknown guess target' }, { status: 400 });
    }
    if (guess === player) {
      return NextResponse.json({ ok: false, error: "Can't guess yourself" }, { status: 400 });
    }

    const guesses = await getGuesses(player);
    if (guess) guesses[trackId] = guess;
    else delete guesses[trackId];
    await setGuesses(player, guesses);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
