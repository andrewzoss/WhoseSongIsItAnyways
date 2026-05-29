import { NextResponse } from 'next/server';
import { setGame, setClaims, setSpotifyCreds, getSpotifyCreds, hashString, resetGameData, sanitizeName } from '@/lib/db';
import { fetchPlaylist, extractPlaylistId } from '@/lib/spotify';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req) {
  try {
    const body = await req.json();
    const {
      playlistUrl,
      clientId,
      clientSecret,
      manualTracks,    // optional: array of {name, artists} if user wants to override Spotify fetch
      players,
      adminPass,
      saveCreds = true,
    } = body || {};

    // Validate
    if (!Array.isArray(players) || players.length < 2) {
      return NextResponse.json({ ok: false, error: 'Need at least 2 players.' }, { status: 400 });
    }
    const uniq = new Set(players.map((p) => p.toLowerCase()));
    if (uniq.size !== players.length) {
      return NextResponse.json({ ok: false, error: 'Player names must be unique.' }, { status: 400 });
    }
    const sanitized = new Set(players.map((p) => sanitizeName(p)));
    if (sanitized.size !== players.length) {
      return NextResponse.json(
        { ok: false, error: 'Two player names normalize to the same key — make them more distinct.' },
        { status: 400 }
      );
    }
    if (!adminPass || adminPass.length < 4) {
      return NextResponse.json({ ok: false, error: 'Admin passcode must be at least 4 characters.' }, { status: 400 });
    }

    // Determine tracks: either from Spotify, or from manualTracks override.
    let tracks, playlistName;

    if (Array.isArray(manualTracks) && manualTracks.length > 0) {
      tracks = manualTracks.map((t, i) => ({
        id: `manual-${i}`,
        name: (t.name || '').trim(),
        artists: (t.artists || '').trim(),
        albumArt: null,
      })).filter((t) => t.name);
      playlistName = body.playlistName || 'Round playlist';
      if (tracks.length === 0) {
        return NextResponse.json({ ok: false, error: 'Manual tracks list was empty.' }, { status: 400 });
      }
    } else {
      // Use Spotify. Prefer creds in the request; otherwise fall back to stored creds.
      let cid = clientId, cs = clientSecret;
      if (!cid || !cs) {
        const stored = await getSpotifyCreds();
        if (stored) { cid = stored.clientId; cs = stored.clientSecret; }
      }
      if (!cid || !cs) {
        return NextResponse.json(
          { ok: false, error: 'Need Spotify Client ID and Client Secret.' },
          { status: 400 }
        );
      }
      if (!extractPlaylistId(playlistUrl)) {
        return NextResponse.json({ ok: false, error: 'Invalid playlist URL.' }, { status: 400 });
      }

      const fetched = await fetchPlaylist(playlistUrl, cid, cs);
      tracks = fetched.tracks;
      playlistName = fetched.playlistName;

      if (saveCreds) await setSpotifyCreds({ clientId: cid, clientSecret: cs });
    }

    // Wipe any previous round's data before setting up the new one
    await resetGameData(players);

    const passHash = await hashString(adminPass);
    const game = {
      playlistUrl: playlistUrl || '',
      playlistName: playlistName || 'Round playlist',
      playlistId: extractPlaylistId(playlistUrl) || null,
      tracks,
      players,
      adminPassHash: passHash,
      revealed: false,
      createdAt: Date.now(),
    };

    await setGame(game);
    await setClaims({});

    return NextResponse.json({ ok: true, trackCount: tracks.length });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || 'Setup failed' }, { status: 500 });
  }
}
