import { NextResponse } from 'next/server';
import { getGame, patchGame, isAdmin } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req) {
  try {
    const { actor, revealed } = await req.json();
    const game = await getGame();
    if (!game) return NextResponse.json({ ok: false, error: 'No game in progress' }, { status: 400 });
    if (!isAdmin(game, actor)) {
      return NextResponse.json({ ok: false, error: 'Only the admin can reveal/unreveal' }, { status: 403 });
    }
    await patchGame({ revealed: !!revealed });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
