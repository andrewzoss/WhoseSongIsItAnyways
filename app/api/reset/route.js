import { NextResponse } from 'next/server';
import { getLeague, deleteLeague, isAdmin } from '@/lib/db';
import { ensureMigrated } from '@/lib/migrate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Nukes the entire league (all rounds, all players, all data). Use with care.
export async function POST(req) {
  try {
    await ensureMigrated();
    const { actor } = await req.json();
    const league = await getLeague();
    if (!league) return NextResponse.json({ ok: true });
    if (!isAdmin(league, actor)) {
      return NextResponse.json({ ok: false, error: 'Only the admin can reset the league' }, { status: 403 });
    }
    await deleteLeague();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
