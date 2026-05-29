import { NextResponse } from 'next/server';
import { getGame, resetGameData, isAdmin } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req) {
  try {
    const { actor } = await req.json();
    const game = await getGame();
    if (!game) return NextResponse.json({ ok: true });
    if (!isAdmin(game, actor)) {
      return NextResponse.json({ ok: false, error: 'Only the admin can reset the round' }, { status: 403 });
    }
    await resetGameData(game.players);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
