import { NextResponse } from 'next/server';
import { getLeague, activeRound, patchActiveRound } from '@/lib/db';
import { ensureMigrated } from '@/lib/migrate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req) {
  try {
    await ensureMigrated();
    const { player, trackId, guess } = await req.json();
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
    if (!round.tracks.some((t) => t.id === trackId)) {
      return NextResponse.json({ ok: false, error: 'Unknown track' }, { status: 400 });
    }
    if (guess && !round.players.includes(guess)) {
      return NextResponse.json({ ok: false, error: 'Unknown guess target' }, { status: 400 });
    }
    if (guess === player) {
      return NextResponse.json({ ok: false, error: "Can't guess yourself" }, { status: 400 });
    }

    const myGuesses = { ...(round.guesses?.[player] || {}) };
    // Strict mode: each player can only be guessed once per round
    if (guess) {
      for (const [tid, existing] of Object.entries(myGuesses)) {
        if (tid !== trackId && existing === guess) {
          return NextResponse.json(
            { ok: false, error: `You already guessed ${guess} on another track. Clear that one first.` },
            { status: 409 }
          );
        }
      }
    }

    if (guess) myGuesses[trackId] = guess;
    else delete myGuesses[trackId];

    const guesses = { ...(round.guesses || {}), [player]: myGuesses };
    await patchActiveRound({ guesses });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
