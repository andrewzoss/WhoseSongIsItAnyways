'use client';
import { useState, useEffect, useCallback } from 'react';

// ============ API CLIENT HELPERS ============
async function apiGet(path) {
  const res = await fetch(path, { cache: 'no-store' });
  const data = await res.json();
  if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
async function apiPost(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json();
  if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function extractPlaylistId(url) {
  if (!url) return null;
  const m = String(url).match(/playlist[/:]([a-zA-Z0-9]+)/);
  return m ? m[1] : null;
}

// Persist the selected player name on this device so refresh keeps you in role.
const ME_KEY = 'wsia_me';
const getMe = () => { try { return localStorage.getItem(ME_KEY); } catch { return null; } };
const setMe = (n) => { try { n ? localStorage.setItem(ME_KEY, n) : localStorage.removeItem(ME_KEY); } catch {} };

// ============ MAIN APP ============
export default function Page() {
  const [view, setView] = useState('loading');
  const [game, setGame] = useState(null);
  const [claims, setClaims] = useState({});
  const [allGuesses, setAllGuesses] = useState({});
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [error, setError] = useState('');

  const refreshState = useCallback(async () => {
    try {
      const data = await apiGet('/api/state');
      setGame(data.game);
      setClaims(data.claims || {});
      setAllGuesses(data.guesses || {});
      return data.game;
    } catch (e) {
      setError(e.message);
      return null;
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const g = await refreshState();
      if (!mounted) return;
      const savedMe = getMe();
      if (!g) {
        setView('welcome');
      } else if (savedMe && g.players.includes(savedMe)) {
        // resume as that player
        setCurrentPlayer(savedMe);
        setView(g.revealed ? 'results' : 'playerGame');
      } else {
        setView('join');
      }
    })();
    const id = setInterval(() => { refreshState(); }, 4000);
    return () => { mounted = false; clearInterval(id); };
  }, [refreshState]);

  const enterAs = (name) => {
    setMe(name);
    setCurrentPlayer(name);
    setView(game?.revealed ? 'results' : 'playerGame');
  };

  const leaveRole = () => {
    setMe(null);
    setCurrentPlayer(null);
    setView('join');
  };

  const isMeAdmin = !!(game && currentPlayer && game.adminName === currentPlayer);

  const renderView = () => {
    if (view === 'loading') return <LoadingView />;
    if (view === 'welcome') return <WelcomeView onCreate={() => setView('adminSetup')} />;
    if (view === 'adminSetup')
      return (
        <AdminSetupView
          existingGame={game}
          onComplete={async (chosenAdmin) => {
            await refreshState();
            setMe(chosenAdmin);
            setCurrentPlayer(chosenAdmin);
            setView('playerGame');
          }}
          onCancel={() => setView(game ? 'join' : 'welcome')}
        />
      );
    if (view === 'join')
      return (
        <JoinView
          game={game}
          claims={claims}
          allGuesses={allGuesses}
          onJoin={enterAs}
        />
      );
    if (view === 'playerGame')
      return (
        <PlayerGameView
          game={game}
          claims={claims}
          allGuesses={allGuesses}
          currentPlayer={currentPlayer}
          isAdmin={isMeAdmin}
          onLeave={leaveRole}
          onUpdate={refreshState}
          onReveal={async () => {
            try {
              await apiPost('/api/reveal', { actor: currentPlayer, revealed: true });
              await refreshState();
              setView('results');
            } catch (e) { alert(e.message); }
          }}
          onReset={async () => {
            if (!confirm('Reset the entire round? This deletes all data.')) return;
            try {
              await apiPost('/api/reset', { actor: currentPlayer });
              setMe(null);
              setCurrentPlayer(null);
              await refreshState();
              setView('welcome');
            } catch (e) { alert(e.message); }
          }}
        />
      );
    if (view === 'results')
      return (
        <ResultsView
          game={game}
          claims={claims}
          allGuesses={allGuesses}
          isAdmin={isMeAdmin}
          currentPlayer={currentPlayer}
          onBack={() => setView(currentPlayer ? 'playerGame' : 'join')}
          onUnreveal={async () => {
            try {
              await apiPost('/api/reveal', { actor: currentPlayer, revealed: false });
              await refreshState();
              setView('playerGame');
            } catch (e) { alert(e.message); }
          }}
          onReset={async () => {
            if (!confirm('Reset the entire round? This deletes all data.')) return;
            try {
              await apiPost('/api/reset', { actor: currentPlayer });
              setMe(null);
              setCurrentPlayer(null);
              await refreshState();
              setView('welcome');
            } catch (e) { alert(e.message); }
          }}
        />
      );
    return null;
  };

  return (
    <div className="ml-app">
      <div className="ml-container">
        <header className="ml-header">
          <div className="ml-logo">
            <div className="ml-logo-icon" />
            <div>
              <div className="ml-title">Whose Song is it <em>Anyways?</em></div>
              <div className="ml-subtitle">Guess the submitter · Settle the round</div>
            </div>
          </div>
          {game && (
            <div className="ml-badge">
              {game.revealed ? 'Revealed' : 'In Progress'} · {game.tracks.length} tracks
              {currentPlayer && <> · You: {currentPlayer}{isMeAdmin && ' ★'}</>}
            </div>
          )}
        </header>
        {error && (
          <div className="ml-error">
            {error}{' '}
            <button
              onClick={() => { setError(''); refreshState(); }}
              style={{
                background: 'transparent', border: 'none', color: 'var(--accent-2)',
                cursor: 'pointer', marginLeft: 8, textDecoration: 'underline',
              }}
            >
              Retry
            </button>
          </div>
        )}
        {renderView()}
        <div className="ml-quote">A round only ends when the votes are in</div>
      </div>
    </div>
  );
}

// ============ SUB-VIEWS ============
function LoadingView() {
  return (
    <div className="ml-card" style={{ textAlign: 'center', padding: '60px 28px' }}>
      <span className="ml-spinner" />
      <div style={{ marginTop: 16, color: 'var(--text-dim)' }}>Loading round…</div>
    </div>
  );
}

function WelcomeView({ onCreate }) {
  return (
    <div className="ml-card">
      <div className="ml-section-label">Round 01</div>
      <h1 className="ml-heading">Who picked <em>what</em>?</h1>
      <p className="ml-body">
        No round is set up yet. The admin loads a Spotify playlist, lists the players,
        and picks who the admin is. Players then claim their own song and guess who submitted
        each of the others.
      </p>
      <button className="ml-btn ml-btn-primary" onClick={onCreate}>
        Set up a new round →
      </button>
    </div>
  );
}

function JoinView({ game, claims, allGuesses, onJoin }) {
  const [name, setName] = useState('');

  const playerStatus = (p) => {
    const hasClaim = Object.values(claims).includes(p);
    const guessCount = Object.keys(allGuesses[p] || {}).length;
    const need = game.tracks.length - 1;
    return { hasClaim, guessCount, need };
  };

  return (
    <div className="ml-card">
      <div className="ml-section-label">Round in progress</div>
      <h1 className="ml-heading">{game.playlistName || 'A mysterious playlist'}</h1>
      <p className="ml-body">
        {game.tracks.length} tracks · {game.players.length} players in the running
        {game.adminName && <> · Admin: <em>{game.adminName}</em></>}
      </p>

      <label className="ml-label">Who are you?</label>
      <select className="ml-select" value={name} onChange={(e) => setName(e.target.value)}>
        <option value="">— pick your name —</option>
        {game.players.map((p) => {
          const s = playerStatus(p);
          const isAdminP = p === game.adminName;
          const tag = s.hasClaim && s.guessCount >= s.need ? ' ✓ done' : s.hasClaim ? ' (claimed)' : '';
          return (
            <option key={p} value={p}>
              {p}{isAdminP ? ' ★' : ''}{tag}
            </option>
          );
        })}
      </select>
      <div style={{ marginTop: 14 }}>
        <button className="ml-btn ml-btn-primary" disabled={!name} onClick={() => onJoin(name)}>
          Enter as {name || '…'} →
        </button>
      </div>

      <div style={{ marginTop: 18, fontSize: 12, color: 'var(--text-faint)', fontFamily: 'JetBrains Mono, monospace' }}>
        Share this page&apos;s URL with your league.
      </div>
    </div>
  );
}

// ============ ADMIN SETUP ============
function AdminSetupView({ onComplete, onCancel, existingGame }) {
  const [step, setStep] = useState(1);
  const [playlistUrl, setPlaylistUrl] = useState(existingGame?.playlistUrl || '');
  const [playlistName, setPlaylistName] = useState(existingGame?.playlistName || '');
  const [playersText, setPlayersText] = useState((existingGame?.players || []).join('\n'));
  const [adminName, setAdminName] = useState(existingGame?.adminName || '');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [saveCreds, setSaveCreds] = useState(true);

  const [manualMode, setManualMode] = useState(false);
  const [manualText, setManualText] = useState('');

  // Derived list of players for the admin dropdown
  const parsedPlayers = playersText
    .split('\n')
    .map((p) => p.trim())
    .filter(Boolean);

  // If admin name no longer matches a player, clear it.
  useEffect(() => {
    if (adminName && !parsedPlayers.includes(adminName)) setAdminName('');
  }, [playersText]); // eslint-disable-line react-hooks/exhaustive-deps

  const finalize = async () => {
    setErr('');
    if (parsedPlayers.length < 2) { setErr('Need at least 2 players.'); return; }
    if (!adminName || !parsedPlayers.includes(adminName)) {
      setErr('Pick which player is the admin.');
      return;
    }

    setLoading(true);
    try {
      const body = {
        playlistUrl,
        players: parsedPlayers,
        adminName,
        saveCreds,
      };
      if (manualMode) {
        const lines = manualText.split('\n').map((l) => l.trim()).filter(Boolean);
        body.manualTracks = lines.map((line) => {
          const dash = line.indexOf(' - ');
          return dash > 0
            ? { name: line.slice(0, dash).trim(), artists: line.slice(dash + 3).trim() }
            : { name: line, artists: '' };
        });
        body.playlistName = playlistName || 'Round playlist';
      } else {
        body.clientId = clientId.trim();
        body.clientSecret = clientSecret.trim();
      }
      await apiPost('/api/setup', body);
      onComplete(adminName);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ml-card">
      <div className="ml-section-label">Admin setup · Step {step} of 3</div>
      <h1 className="ml-heading">
        {step === 1 ? <>Drop the <em>playlist</em></> :
         step === 2 ? <>Paste the <em>tracks</em></> :
         <>Players & <em>admin</em></>}
      </h1>

      {err && <div className="ml-error">{err}</div>}

      {step === 1 && (
        <>
          <label className="ml-label">Spotify playlist URL</label>
          <input
            className="ml-input"
            value={playlistUrl}
            onChange={(e) => setPlaylistUrl(e.target.value)}
            placeholder="https://open.spotify.com/playlist/..."
          />

          <div className="ml-divider" />

          <div className="ml-section-label" style={{ marginBottom: 12 }}>Spotify credentials</div>
          <p className="ml-body" style={{ fontSize: 14 }}>
            We pull tracks straight from Spotify&apos;s API. Get your credentials from{' '}
            <a
              href="https://developer.spotify.com/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--accent-2)', textDecoration: 'underline' }}
            >developer.spotify.com/dashboard</a>{' '}
            → your app → Settings → &quot;View client secret.&quot;
          </p>

          <label className="ml-label">Client ID</label>
          <input
            className="ml-input"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="(your Spotify Client ID)"
            style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13 }}
          />

          <label className="ml-label" style={{ marginTop: 12 }}>Client Secret</label>
          <div style={{ position: 'relative' }}>
            <input
              className="ml-input"
              type={showSecret ? 'text' : 'password'}
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder="••••••••••••••••"
              style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, paddingRight: 56 }}
            />
            <button
              type="button"
              onClick={() => setShowSecret((s) => !s)}
              style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                background: 'transparent', border: '1px solid var(--line)', color: 'var(--text-dim)',
                fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
                padding: '4px 8px', borderRadius: 4, cursor: 'pointer',
                textTransform: 'uppercase', letterSpacing: '0.1em',
              }}
            >
              {showSecret ? 'Hide' : 'Show'}
            </button>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 13.5, color: 'var(--text-dim)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={saveCreds}
              onChange={(e) => setSaveCreds(e.target.checked)}
              style={{ accentColor: 'var(--accent)' }}
            />
            Remember these on the server for future rounds
          </label>
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-faint)', fontStyle: 'italic' }}>
            Stored only in your private Upstash database, never exposed to players.
          </div>

          <div style={{ marginTop: 18, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="ml-btn ml-btn-ghost" onClick={onCancel}>← Back</button>
            <button
              className="ml-btn ml-btn-primary"
              disabled={!extractPlaylistId(playlistUrl) || !clientId.trim() || !clientSecret.trim()}
              onClick={() => { setManualMode(false); setStep(3); }}
            >
              Next →
            </button>
            <button
              className="ml-btn ml-btn-ghost"
              onClick={() => { setManualMode(true); setStep(2); }}
            >
              Enter tracks manually instead
            </button>
          </div>
        </>
      )}

      {step === 2 && manualMode && (
        <>
          <p className="ml-body">
            Paste tracks one per line as <em>Song Name - Artist</em>. The dash and artist are optional.
          </p>
          <label className="ml-label">Tracks</label>
          <textarea
            className="ml-textarea"
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            placeholder={`Heart of Glass - Blondie\nLet Down - Radiohead\nSailing - Christopher Cross`}
            rows={12}
          />
          <label className="ml-label" style={{ marginTop: 14 }}>Round name (optional)</label>
          <input
            className="ml-input"
            value={playlistName}
            onChange={(e) => setPlaylistName(e.target.value)}
            placeholder="Songs that feel like a Wednesday"
          />
          <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="ml-btn ml-btn-ghost" onClick={() => { setManualMode(false); setStep(1); }}>
              ← Use Spotify instead
            </button>
            <button
              className="ml-btn ml-btn-primary"
              disabled={!manualText.trim()}
              onClick={() => setStep(3)}
            >
              Next →
            </button>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <p className="ml-body">
            {manualMode
              ? <>Tracks will be loaded from your pasted list.</>
              : <>Tracks will be fetched from Spotify when you finish setup. (Takes ~5 seconds.)</>}
            {' '}List your players (one per line), then pick which player is the admin.
          </p>

          <label className="ml-label">Players (one per line)</label>
          <textarea
            className="ml-textarea"
            value={playersText}
            onChange={(e) => setPlayersText(e.target.value)}
            placeholder={`Alice\nBob\nCarmen\nDavid`}
            rows={6}
          />

          <label className="ml-label" style={{ marginTop: 14 }}>Who&apos;s the admin?</label>
          <select
            className="ml-select"
            value={adminName}
            onChange={(e) => setAdminName(e.target.value)}
            disabled={parsedPlayers.length < 2}
          >
            <option value="">— pick the admin —</option>
            {parsedPlayers.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>

          <div className="ml-info-box" style={{ marginTop: 16 }}>
            <strong style={{ color: 'var(--gold)' }}>Heads up:</strong> the admin (★) is the only player
            who can reveal results or reset the round. Anyone visiting the URL could technically pick the
            admin&apos;s name from the dropdown — for a friend-group league this is fine, but don&apos;t
            share the URL more widely than you trust.
          </div>

          <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="ml-btn ml-btn-ghost" onClick={() => setStep(manualMode ? 2 : 1)}>← Back</button>
            <button
              className="ml-btn ml-btn-primary"
              disabled={loading || parsedPlayers.length < 2 || !adminName}
              onClick={finalize}
            >
              {loading ? <><span className="ml-spinner" /> Setting up…</> : 'Start the round →'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ============ PLAYER GAME ============
function PlayerGameView({ game, claims, allGuesses, currentPlayer, isAdmin, onLeave, onUpdate, onReveal, onReset }) {
  const myClaim = Object.entries(claims).find(([, p]) => p === currentPlayer)?.[0] || null;
  const myGuesses = allGuesses[currentPlayer] || {};
  const [saving, setSaving] = useState(false);

  const setMyClaim = async (trackId) => {
    setSaving(true);
    try {
      await apiPost('/api/claim', { player: currentPlayer, trackId });
      await onUpdate();
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  const setMyGuess = async (trackId, guess) => {
    try {
      await apiPost('/api/guess', { player: currentPlayer, trackId, guess: guess || null });
      await onUpdate();
    } catch (e) { alert(e.message); }
  };

  const otherPlayers = game.players.filter((p) => p !== currentPlayer);
  const guessableCount = game.tracks.length - (myClaim ? 1 : 0);
  const guessedCount = Object.keys(myGuesses).filter((tid) => tid !== myClaim).length;
  const progress = guessableCount > 0 ? (guessedCount / guessableCount) * 100 : 0;

  // Admin: compute completion stats
  const totalPlayers = game.players.length;
  const claimedPlayers = new Set(Object.values(claims));
  const fullyDonePlayers = game.players.filter((p) => {
    if (!claimedPlayers.has(p)) return false;
    const g = allGuesses[p] || {};
    return Object.keys(g).length >= game.tracks.length - 1;
  });
  const everyTrackClaimed = game.tracks.every((t) => claims[t.id]);

  return (
    <>
      <div className="ml-card">
        <div className="ml-section-label">Playing as · {currentPlayer}{isAdmin && ' ★ admin'}</div>
        <h1 className="ml-heading">Claim yours. <em>Guess</em> the rest.</h1>
        <p className="ml-body">
          Pick the song <em>you</em> submitted (yellow button), then guess who submitted each other track.
          You can change your picks any time before the reveal.
        </p>

        <div className="ml-stats">
          <div className="ml-stat">
            <span className="ml-stat-val">{myClaim ? '✓' : '0'}</span> claim
          </div>
          <div className="ml-stat">
            <span className="ml-stat-val">{guessedCount}/{guessableCount}</span> guesses made
          </div>
        </div>
        <div className="ml-progress">
          <div className="ml-progress-bar" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {isAdmin && (
        <div className="ml-card">
          <div className="ml-section-label">Admin panel</div>
          <h2 className="ml-heading" style={{ fontSize: 22 }}>Watch the <em>guesses</em> roll in</h2>

          <div className="ml-stats">
            <div className="ml-stat"><span className="ml-stat-val">{Object.keys(claims).length}/{totalPlayers}</span> claimed</div>
            <div className="ml-stat"><span className="ml-stat-val">{fullyDonePlayers.length}/{totalPlayers}</span> finished</div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            {game.players.map((p) => {
              const hasClaim = claimedPlayers.has(p);
              const guessCount = Object.keys(allGuesses[p] || {}).length;
              const need = game.tracks.length - 1;
              const done = hasClaim && guessCount >= need;
              return (
                <span key={p} className={`ml-player-tag ${done ? 'done' : ''}`}>
                  {done ? '✓' : '•'} {p}
                  {!done && (
                    <span style={{ opacity: 0.6 }}>
                      ({hasClaim ? '★' : '–'}/{guessCount}/{need})
                    </span>
                  )}
                </span>
              );
            })}
          </div>

          {!everyTrackClaimed && (
            <div className="ml-info-box" style={{ marginTop: 16 }}>
              <strong style={{ color: 'var(--gold)' }}>Heads up:</strong>{' '}
              {game.tracks.length - Object.keys(claims).length} track(s) still unclaimed.
              You can reveal anyway — those rows will show &quot;unknown&quot; as the truth.
            </div>
          )}

          <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="ml-btn ml-btn-primary" onClick={onReveal}>
              Reveal results →
            </button>
            <button className="ml-btn ml-btn-ghost ml-btn-danger" onClick={onReset}>
              Reset round
            </button>
          </div>
        </div>
      )}

      <div className="ml-card-flush">
        {game.tracks.map((track, i) => {
          const isMine = myClaim === track.id;
          const claimedByOther = claims[track.id] && claims[track.id] !== currentPlayer;
          const guess = myGuesses[track.id] || '';
          return (
            <div key={track.id} className="ml-track">
              <div className="ml-track-num">{String(i + 1).padStart(2, '0')}</div>
              {track.albumArt ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={track.albumArt} alt="" className="ml-track-art" />
              ) : (
                <div className="ml-track-art-placeholder">♪</div>
              )}
              <div className="ml-track-info">
                <div className="ml-track-name">{track.name}</div>
                <div className="ml-track-artist">{track.artists}</div>
              </div>
              <div className="ml-track-actions">
                <button
                  className={`ml-mine-btn ${isMine ? 'active' : ''}`}
                  onClick={() => setMyClaim(isMine ? null : track.id)}
                  disabled={saving || (claimedByOther && !isMine)}
                  title={claimedByOther ? `Claimed by ${claims[track.id]}` : ''}
                >
                  {isMine ? '★ Mine' : claimedByOther ? 'Taken' : 'Mine?'}
                </button>
                {!isMine && (
                  <select
                    className={`ml-guess-select ${guess ? 'has-value' : ''}`}
                    value={guess}
                    onChange={(e) => setMyGuess(track.id, e.target.value)}
                  >
                    <option value="">Guess who…</option>
                    {otherPlayers.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="ml-footer-actions">
        <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
          Progress saves automatically. Come back any time before the reveal.
        </div>
        <button className="ml-btn ml-btn-ghost" onClick={onLeave}>← Switch player</button>
      </div>
    </>
  );
}

// ============ RESULTS ============
function ResultsView({ game, claims, allGuesses, isAdmin, currentPlayer, onBack, onUnreveal, onReset }) {
  const scores = {};
  game.players.forEach((p) => { scores[p] = 0; });
  game.tracks.forEach((t) => {
    const truth = claims[t.id];
    if (!truth) return;
    game.players.forEach((p) => {
      if (p === truth) return;
      const g = allGuesses[p]?.[t.id];
      if (g === truth) scores[p] += 1;
    });
  });
  const sortedPlayers = [...game.players].sort((a, b) => scores[b] - scores[a]);
  const topScore = scores[sortedPlayers[0]] || 0;

  return (
    <>
      <div className="ml-card">
        <div className="ml-section-label">Revealed · The verdict</div>
        <h1 className="ml-heading">The <em>scoreboard</em></h1>
        <p className="ml-body">One point per correct guess. Self-claims don&apos;t score.</p>

        <div className="ml-scoreboard">
          {sortedPlayers.map((p, i) => {
            const isWinner = scores[p] === topScore && topScore > 0;
            const claimed = Object.values(claims).includes(p);
            return (
              <div key={p} className={`ml-score-row ${isWinner ? 'winner' : ''}`}>
                <div className="ml-score-rank">{String(i + 1).padStart(2, '0')}</div>
                <div className="ml-score-name">
                  {isWinner && '🏆 '}{p}
                  {!claimed && (
                    <span style={{ fontSize: 12, color: 'var(--text-faint)', marginLeft: 8, fontStyle: 'italic' }}>
                      (didn&apos;t claim)
                    </span>
                  )}
                </div>
                <div className="ml-score-val">{scores[p]}</div>
              </div>
            );
          })}
        </div>

        {isAdmin && (
          <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="ml-btn" onClick={onUnreveal}>Un-reveal</button>
            <button className="ml-btn ml-btn-ghost ml-btn-danger" onClick={onReset}>Reset round</button>
          </div>
        )}
      </div>

      <div className="ml-card-flush">
        <div style={{ padding: '20px 28px 8px' }}>
          <div className="ml-section-label">Track by track</div>
          <h2 className="ml-heading" style={{ fontSize: 22 }}>Who picked <em>what</em></h2>
        </div>

        {game.tracks.map((t, i) => {
          const truth = claims[t.id];
          return (
            <div key={t.id} className="ml-reveal-track">
              <div className="ml-reveal-header">
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--text-faint)', minWidth: 24 }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                {t.albumArt
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={t.albumArt} alt="" className="ml-track-art" />
                  : <div className="ml-track-art-placeholder">♪</div>}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="ml-track-name">{t.name}</div>
                  <div className="ml-track-artist">{t.artists}</div>
                </div>
              </div>
              <div className="ml-truth">
                Submitted by → <span style={{ color: 'var(--accent-2)', fontStyle: 'normal' }}>
                  {truth || '— unclaimed —'}
                </span>
              </div>
              {truth && (
                <div className="ml-guesses-grid">
                  {game.players.filter((p) => p !== truth).map((p) => {
                    const g = allGuesses[p]?.[t.id];
                    const correct = g === truth;
                    return (
                      <div key={p} className={`ml-guess-pill ${g ? (correct ? 'correct' : 'wrong') : ''}`}>
                        <span className="ml-guess-pill-name">{p}:</span>
                        <span className="ml-guess-pill-val">{g || '—'}</span>
                        {correct && <span style={{ marginLeft: 'auto', color: 'var(--green)' }}>✓</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="ml-footer-actions">
        <button className="ml-btn ml-btn-ghost" onClick={onBack}>← Back</button>
      </div>
    </>
  );
}
