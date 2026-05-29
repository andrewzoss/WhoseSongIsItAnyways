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
    // adminName is fine to send to client - it's just a name. (Previously we
    // stripped a passcode hash here; with name-based admin, no secrets exist.)
    return NextResponse.json({ ok: true, game, claims, guesses });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
