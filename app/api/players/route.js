import { NextResponse } from 'next/server';
import {
  getGame, patchGame, getClaims, setClaims,
  getGuesses, setGuesses, redis, sanitizeName, isAdmin,
} from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/players — admin updates the player roster mid-round.
// Body: { actor: <admin name>, players: <new full list of player names> }
//
// Adds and removes are diffed against the current roster. The actor (admin)
// must remain in the new list — admin can't remove themselves.
export async function POST(req) {
  try {
    const { actor, players: newPlayersRaw } = await req.json();

    const game = await getGame();
    if (!game) {
      return NextResponse.json({ ok: false, error: 'No game in progress' }, { status: 400 });
    }
    if (!isAdmin(game, actor)) {
      return NextResponse.json({ ok: false, error: 'Only the admin can change the player list' }, { status: 403 });
    }

    if (!Array.isArray(newPlayersRaw)) {
      return NextResponse.json({ ok: false, error: 'players must be an array' }, { status: 400 });
    }

    // Normalize: trim, drop empty, preserve order
    const newPlayers = newPlayersRaw.map((p) => String(p || '').trim()).filter(Boolean);
    if (newPlayers.length < 2) {
      return NextResponse.json({ ok: false, error: 'Need at least 2 players.' }, { status: 400 });
    }

    // Uniqueness checks (case-insensitive + sanitized-name)
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

    // Admin must remain in the list (otherwise the round becomes orphaned)
    if (!newPlayers.includes(game.adminName)) {
      return NextResponse.json(
        { ok: false, error: `Admin (${game.adminName}) must remain in the list.` },
        { status: 400 }
      );
    }

    const removed = game.players.filter((p) => !newPlayers.includes(p));
    const added = newPlayers.filter((p) => !game.players.includes(p));

    // 1) Clean up claims by removed players
    if (removed.length > 0) {
      const claims = await getClaims();
      let claimsChanged = false;
      for (const [tid, p] of Object.entries(claims)) {
        if (removed.includes(p)) {
          delete claims[tid];
          claimsChanged = true;
        }
      }
      if (claimsChanged) await setClaims(claims);

      // 2) Delete removed players' guess records
      await Promise.all(removed.map((p) => redis().del(`guesses:${sanitizeName(p)}`)));

      // 3) Scrub removed players from OTHER players' guesses (where they were
      // guessed as a submitter). Leaving them in would cause scoring confusion
      // since "Bob" no longer exists.
      for (const p of newPlayers) {
        const g = await getGuesses(p);
        let changed = false;
        for (const [tid, guess] of Object.entries(g)) {
          if (removed.includes(guess)) {
            delete g[tid];
            changed = true;
          }
        }
        if (changed) await setGuesses(p, g);
      }
    }

    // 4) Update the roster on the game
    await patchGame({ players: newPlayers });

    return NextResponse.json({
      ok: true,
      added,
      removed,
      total: newPlayers.length,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
