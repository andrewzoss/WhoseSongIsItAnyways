// Server-side Spotify API helpers.

export function extractPlaylistId(url) {
  if (!url) return null;
  const m = String(url).match(/playlist[/:]([a-zA-Z0-9]+)/);
  return m ? m[1] : null;
}

export async function getSpotifyToken(clientId, clientSecret) {
  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${creds}`,
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    if (res.status === 400 || res.status === 401) {
      throw new Error('Spotify rejected the credentials. Double-check Client ID and Secret.');
    }
    throw new Error(`Spotify auth failed (${res.status}): ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  if (!data.access_token) throw new Error('Spotify returned no access token.');
  return data.access_token;
}

export async function fetchPlaylist(playlistUrl, clientId, clientSecret) {
  const playlistId = extractPlaylistId(playlistUrl);
  if (!playlistId) throw new Error("Couldn't read a playlist ID from that URL.");

  const token = await getSpotifyToken(clientId, clientSecret);

  // Playlist metadata
  const metaRes = await fetch(
    `https://api.spotify.com/v1/playlists/${playlistId}?fields=name`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!metaRes.ok) {
    if (metaRes.status === 404) throw new Error('Playlist not found. Is it public?');
    throw new Error(`Failed to fetch playlist info (${metaRes.status}).`);
  }
  const meta = await metaRes.json();

  // Tracks (paginated)
  const tracks = [];
  let next =
    `https://api.spotify.com/v1/playlists/${playlistId}/tracks` +
    `?limit=100&fields=next,items(track(id,name,artists(name),album(images)))`;
  while (next) {
    const r = await fetch(next, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`Failed to fetch tracks (${r.status}).`);
    const data = await r.json();
    for (const item of data.items || []) {
      if (!item.track) continue;
      const imgs = item.track.album?.images || [];
      tracks.push({
        id: item.track.id || `track-${tracks.length}`,
        name: item.track.name || '',
        artists: (item.track.artists || []).map((a) => a.name).filter(Boolean).join(', '),
        albumArt: imgs[0]?.url || null,
      });
    }
    next = data.next;
  }

  if (tracks.length === 0) throw new Error('Playlist has no tracks.');

  return { playlistName: meta.name || '', tracks };
}
