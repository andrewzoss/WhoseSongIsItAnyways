// Server-side Spotify playlist fetcher.
//
// We fetch Spotify's public embed page (no auth needed, works for ANY public
// playlist regardless of who owns it). The embed page is server-rendered HTML
// with a __NEXT_DATA__ JSON blob containing all the tracks.

export function extractPlaylistId(url) {
  if (!url) return null;
  const m = String(url).match(/playlist[/:]([a-zA-Z0-9]+)/);
  return m ? m[1] : null;
}

// Walk Spotify's __NEXT_DATA__ JSON shape and extract tracks. Spotify
// occasionally restructures this, so we probe several known paths.
function extractFromEmbedJson(data) {
  const candidates = [
    () => data?.props?.pageProps?.state?.data?.entity,
    () => data?.props?.pageProps?.entity,
    () => data?.props?.pageProps?.data?.entity,
    () => data?.props?.pageProps?.initialState?.entity,
  ];
  let entity = null;
  for (const fn of candidates) {
    try {
      const e = fn();
      if (e && (e.trackList || e.tracks || e.items)) { entity = e; break; }
    } catch {}
  }
  if (!entity) return null;

  const playlistName = entity.title || entity.name || '';
  const rawTracks =
    entity.trackList ||
    entity.tracks?.items ||
    entity.tracks ||
    entity.items ||
    [];

  const tracks = rawTracks.map((raw, i) => {
    const t = raw.track || raw;
    // Artists: sometimes a "subtitle" string, sometimes an array of {name}
    let artists = t.subtitle;
    if (!artists && Array.isArray(t.artists)) {
      artists = t.artists.map((a) => (typeof a === 'string' ? a : a.name || '')).filter(Boolean).join(', ');
    }
    return {
      id: t.uri || t.id || t.uid || `track-${i}`,
      name: t.title || t.name || '',
      artists: artists || '',
      albumArt: t.imageUrl || t.image || t.album?.images?.[0]?.url || null,
    };
  }).filter((t) => t.name);

  return { tracks, playlistName };
}

export async function fetchPlaylist(playlistUrl) {
  const playlistId = extractPlaylistId(playlistUrl);
  if (!playlistId) throw new Error("Couldn't read a playlist ID from that URL.");

  const embedUrl = `https://open.spotify.com/embed/playlist/${playlistId}`;
  let res;
  try {
    res = await fetch(embedUrl, {
      headers: {
        // Pretend to be a normal browser. Spotify sometimes returns reduced
        // content to unknown user agents.
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html',
      },
      cache: 'no-store',
    });
  } catch (e) {
    throw new Error('Network error fetching playlist embed: ' + e.message);
  }

  if (!res.ok) {
    if (res.status === 404) throw new Error('Playlist not found. Make sure it’s public.');
    throw new Error(`Spotify embed returned HTTP ${res.status}.`);
  }

  const html = await res.text();
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) {
    throw new Error(
      'Could not find playlist data in the embed page. Spotify may have changed their page structure.'
    );
  }

  let data;
  try {
    data = JSON.parse(match[1]);
  } catch (e) {
    throw new Error('Failed to parse embed JSON: ' + e.message);
  }

  const parsed = extractFromEmbedJson(data);
  if (!parsed) {
    throw new Error('Could not locate tracks in embed data (Spotify may have changed their layout).');
  }
  if (parsed.tracks.length === 0) {
    throw new Error('Playlist appears empty or private. Make sure it’s public.');
  }

  return parsed;
}
