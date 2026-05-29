import { NextResponse } from 'next/server';
import { getGame, getClaims, getAllGuesses } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const game = await getGame();
    if (!game) {
      return NextResponse.json({ ok: true, game: null, claims: {}, guesses: {} });
    }
    const [claims, guesses] = await Promise.all([
      getClaims(),
      getAllGuesses(game.players),
    ]);
    // Strip the pass hash before sending to client — admin auth happens server-side.
    const { adminPassHash, ...gameForClient } = game;
    return NextResponse.json({ ok: true, game: gameForClient, claims, guesses });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
