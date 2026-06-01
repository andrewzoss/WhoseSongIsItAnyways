import { NextResponse } from 'next/server';
import { getLeague, activeRound, patchActiveRound, isAdmin } from '@/lib/db';
import { ensureMigrated } from '@/lib/migrate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req) {
  try {
    await ensureMigrated();
    const { actor, revealed } = await req.json();
    const league = await getLeague();
    if (!league) {
      return NextResponse.json({ ok: false, error: 'No league in progress' }, { status: 400 });
    }
    if (!isAdmin(league, actor)) {
      return NextResponse.json({ ok: false, error: 'Only the admin can reveal/unreveal' }, { status: 403 });
    }
    const round = activeRound(league);
    if (!round) {
      return NextResponse.json({ ok: false, error: 'No active round' }, { status: 400 });
    }
    await patchActiveRound({ revealed: !!revealed });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
