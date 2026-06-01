import { NextResponse } from 'next/server';
import { getLeague, scoreRound, leagueTotals } from '@/lib/db';
import { ensureMigrated } from '@/lib/migrate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    await ensureMigrated();
    const league = await getLeague();
    if (!league) {
      return NextResponse.json({ ok: true, league: null });
    }
    // Pre-compute per-round scores and overall totals server-side so the
    // client doesn't have to reimplement the logic.
    const roundScores = (league.rounds || []).map((r) => scoreRound(r));
    const totals = leagueTotals(league);
    return NextResponse.json({ ok: true, league, roundScores, totals });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
