import { NextResponse } from 'next/server';
import { getGame, resetGameData, hashString } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req) {
  try {
    const { adminPass } = await req.json();
    const game = await getGame();
    if (!game) return NextResponse.json({ ok: true }); // nothing to reset
    const passHash = await hashString(String(adminPass || ''));
    if (passHash !== game.adminPassHash) {
      return NextResponse.json({ ok: false, error: 'Wrong admin passcode' }, { status: 403 });
    }
    await resetGameData(game.players);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
