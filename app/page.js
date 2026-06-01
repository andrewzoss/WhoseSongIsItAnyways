'use client';
import { useState, useEffect, useCallback } from 'react';

// ============ API CLIENT ============
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

const ME_KEY = 'wsia_me';
const getMe = () => { try { return localStorage.getItem(ME_KEY); } catch { return null; } };
const setMe = (n) => { try { n ? localStorage.setItem(ME_KEY, n) : localStorage.removeItem(ME_KEY); } catch {} };

// Compute one round's scores client-side (mirrors the server's scoreRound)
function scoreRound(round) {
  const scores = {};
  if (!round) return scores;
  (round.players || []).forEach((p) => { scores[p] = 0; });
  for (const t of round.tracks || []) {
    const truth = round.claims?.[t.id];
    if (!truth) continue;
    for (const p of round.players || []) {
      if (p === truth) continue;
      const g = round.guesses?.[p]?.[t.id];
      if (g === truth) scores[p] += 1;
    }
  }
  return scores;
}

// ============ MAIN APP ============
export default function Page() {
  const [view, setView] = useState('loading');
  const [league, setLeague] = useState(null);
  const [roundScores, setRoundScores] = useState([]);
  const [totals, setTotals] = useState({});
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [viewingRoundIdx, setViewingRoundIdx] = useState(null); // null = active round
  const [error, setError] = useState('');

  const refreshState = useCallback(async () => {
    try {
      const data = await apiGet('/api/state');
      setLeague(data.league);
      setRoundScores(data.roundScores || []);
      setTotals(data.totals || {});
      return data.league;
    } catch (e) {
      setError(e.message);
      return null;
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const l = await refreshState();
      if (!mounted) return;
      const savedMe = getMe();
      if (!l) {
        setView('welcome');
      } else if (savedMe && l.players.includes(savedMe)) {
        setCurrentPlayer(savedMe);
        const active = l.rounds[l.activeRoundIdx];
        setView(active?.revealed ? 'results' : 'playerGame');
      } else {
        setView('join');
      }
    })();
    const id = setInterval(() => { refreshState(); }, 4000);
    return () => { mounted = false; clearInterval(id); };
  }, [refreshState]);

  const activeRound = league?.rounds?.[league?.activeRoundIdx] || null;
  const isMeAdmin = !!(league && currentPlayer && league.adminName === currentPlayer);

  const enterAs = (name) => {
    setMe(name);
    setCurrentPlayer(name);
    setView(activeRound?.revealed ? 'results' : 'playerGame');
  };
  const leaveRole = () => {
    setMe(null);
    setCurrentPlayer(null);
    setView('join');
  };

  const renderView = () => {
    if (view === 'loading') return <LoadingView />;
    if (view === 'welcome') return <WelcomeView onCreate={() => setView('adminSetup')} />;
    if (view === 'adminSetup')
      return (
        <AdminSetupView
          existingLeague={league}
          onComplete={async (chosenAdmin) => {
            await refreshState();
            if (chosenAdmin) {
              setMe(chosenAdmin);
              setCurrentPlayer(chosenAdmin);
            }
            setView('playerGame');
          }}
          onCancel={() => setView(league ? 'join' : 'welcome')}
        />
      );
    if (view === 'newRound')
      return (
        <NewRoundView
          league={league}
          currentPlayer={currentPlayer}
          onComplete={async () => {
            await refreshState();
            setView('playerGame');
          }}
          onCancel={() => setView('adminTools')}
        />
      );
    if (view === 'join')
      return <JoinView league={league} onJoin={enterAs} />;
    if (view === 'playerGame')
      return (
        <PlayerGameView
          league={league}
          activeRound={activeRound}
          currentPlayer={currentPlayer}
          isAdmin={isMeAdmin}
          onLeave={leaveRole}
          onUpdate={refreshState}
          onOpenAdmin={() => setView('adminTools')}
          onOpenHistory={() => { setViewingRoundIdx(null); setView('history'); }}
        />
      );
    if (view === 'adminTools')
      return (
        <AdminToolsView
          league={league}
          activeRound={activeRound}
          currentPlayer={currentPlayer}
          onUpdate={refreshState}
          onBack={() => setView('playerGame')}
          onReveal={async () => {
            try {
              await apiPost('/api/reveal', { actor: currentPlayer, revealed: true });
              await refreshState();
              setView('results');
            } catch (e) { alert(e.message); }
          }}
          onNewRound={() => setView('newRound')}
          onReset={async () => {
            if (!confirm('Reset the ENTIRE league (all rounds, all scores, all players)? This cannot be undone.')) return;
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
          league={league}
          round={activeRound}
          roundIndex={league?.activeRoundIdx ?? 0}
          roundScores={roundScores[league?.activeRoundIdx] || {}}
          totals={totals}
          isAdmin={isMeAdmin}
          currentPlayer={currentPlayer}
          onBack={() => setView(currentPlayer ? 'playerGame' : 'join')}
          onOpenHistory={() => { setViewingRoundIdx(null); setView('history'); }}
          onAssign={async (trackId, submitter) => {
            try {
              await apiPost('/api/admin-assign', {
                actor: currentPlayer,
                trackId,
                submitter: submitter || null,
              });
              await refreshState();
            } catch (e) { alert(e.message); }
          }}
          onUnreveal={async () => {
            try {
              await apiPost('/api/reveal', { actor: currentPlayer, revealed: false });
              await refreshState();
              setView('playerGame');
            } catch (e) { alert(e.message); }
          }}
        />
      );
    if (view === 'history')
      return (
        <HistoryView
          league={league}
          roundScores={roundScores}
          totals={totals}
          viewingRoundIdx={viewingRoundIdx}
          onSelectRound={setViewingRoundIdx}
          onBack={() => setView(currentPlayer ? 'playerGame' : 'join')}
          isAdmin={isMeAdmin}
          currentPlayer={currentPlayer}
          onAssign={async (trackId, submitter, roundIdx) => {
            try {
              await apiPost('/api/admin-assign', {
                actor: currentPlayer,
                trackId,
                submitter: submitter || null,
                roundIdx,
              });
              await refreshState();
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt=""
              className="ml-logo-image"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
            <div>
              <div className="ml-title">Whose Song is it <em>Anyways?</em></div>
            </div>
          </div>
          {league && (
            <div className="ml-badge">
              Round {(league.activeRoundIdx ?? 0) + 1} of {league.rounds.length}
              {activeRound && <> · {activeRound.revealed ? 'Revealed' : 'In Progress'}</>}
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
            >Retry</button>
          </div>
        )}
        {renderView()}
        <div className="ml-quote">A round only ends when the votes are in</div>
      </div>
    </div>
  );
}

// ============ SHARED LITTLE VIEWS ============
function LoadingView() {
  return (
    <div className="ml-card" style={{ textAlign: 'center', padding: '60px 28px' }}>
      <span className="ml-spinner" />
      <div style={{ marginTop: 16, color: 'var(--text-dim)' }}>Loading league…</div>
    </div>
  );
}

function WelcomeView({ onCreate }) {
  return (
    <div className="ml-card">
      <div className="ml-section-label">Get started</div>
      <h1 className="ml-heading">Who picked <em>what</em>?</h1>
      <p className="ml-body">
        No league set up yet. The admin loads a Spotify playlist, lists the players,
        and picks the admin. Players then claim their own song and guess who submitted
        the others. After round 1 is revealed, you can add round 2, 3, etc. and track
        cumulative scores.
      </p>
      <button className="ml-btn ml-btn-primary" onClick={onCreate}>
        Start a new league →
      </button>
    </div>
  );
}

function JoinView({ league, onJoin }) {
  const [name, setName] = useState('');
  const active = league.rounds[league.activeRoundIdx];

  return (
    <div className="ml-card">
      <div className="ml-section-label">League in progress · Round {(league.activeRoundIdx ?? 0) + 1}</div>
      <h1 className="ml-heading">{active?.name || 'A mysterious playlist'}</h1>
      <p className="ml-body">
        {active?.tracks?.length || 0} tracks · {league.players.length} players · {league.rounds.length} round{league.rounds.length !== 1 ? 's' : ''}
        {league.adminName && <> · Admin: <em>{league.adminName}</em></>}
      </p>
      <label className="ml-label">Who are you?</label>
      <select className="ml-select" value={name} onChange={(e) => setName(e.target.value)}>
        <option value="">— pick your name —</option>
        {league.players.map((p) => (
          <option key={p} value={p}>{p}{p === league.adminName ? ' ★' : ''}</option>
        ))}
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

// ============ INITIAL ADMIN SETUP ============
function AdminSetupView({ onComplete, onCancel, existingLeague }) {
  const [step, setStep] = useState(1);
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [playlistName, setPlaylistName] = useState('');
  const [playersText, setPlayersText] = useState((existingLeague?.players || []).join('\n'));
  const [adminName, setAdminName] = useState(existingLeague?.adminName || '');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualText, setManualText] = useState('');

  const parsedPlayers = playersText.split('\n').map((p) => p.trim()).filter(Boolean);
  useEffect(() => {
    if (adminName && !parsedPlayers.includes(adminName)) setAdminName('');
  }, [playersText]); // eslint-disable-line react-hooks/exhaustive-deps

  const finalize = async () => {
    setErr('');
    if (parsedPlayers.length < 2) { setErr('Need at least 2 players.'); return; }
    if (!adminName || !parsedPlayers.includes(adminName)) {
      setErr('Pick which player is the admin.'); return;
    }

    setLoading(true);
    try {
      const body = { playlistUrl, players: parsedPlayers, adminName };
      if (manualMode) {
        const lines = manualText.split('\n').map((l) => l.trim()).filter(Boolean);
        body.manualTracks = lines.map((line) => {
          const d = line.indexOf(' - ');
          return d > 0
            ? { name: line.slice(0, d).trim(), artists: line.slice(d + 3).trim() }
            : { name: line, artists: '' };
        });
        body.playlistName = playlistName || 'Round 1';
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
      <div className="ml-section-label">League setup · Step {step} of {manualMode ? 3 : 2}</div>
      <h1 className="ml-heading">
        {step === 1 ? <>Drop the <em>playlist</em></> :
         step === 2 && manualMode ? <>Paste the <em>tracks</em></> :
         <>Players &amp; <em>admin</em></>}
      </h1>

      {err && <div className="ml-error">{err}</div>}

      {step === 1 && (
        <>
          <label className="ml-label">Spotify playlist URL (for Round 1)</label>
          <input
            className="ml-input"
            value={playlistUrl}
            onChange={(e) => setPlaylistUrl(e.target.value)}
            placeholder="https://open.spotify.com/playlist/..."
          />
          <p className="ml-body" style={{ fontSize: 14, marginTop: 14 }}>
            Public playlists work — including Music League playlists you don&apos;t own.
            We pull track titles, artists, and album art straight from Spotify&apos;s public
            embed page. No login required.
          </p>
          <div style={{ marginTop: 18, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="ml-btn ml-btn-ghost" onClick={onCancel}>← Back</button>
            <button
              className="ml-btn ml-btn-primary"
              disabled={!extractPlaylistId(playlistUrl)}
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
            Paste tracks one per line as <em>Song Name - Artist</em>.
          </p>
          <label className="ml-label">Tracks</label>
          <textarea
            className="ml-textarea"
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            placeholder={`Heart of Glass - Blondie\nLet Down - Radiohead`}
            rows={12}
          />
          <label className="ml-label" style={{ marginTop: 14 }}>Round name (optional)</label>
          <input
            className="ml-input"
            value={playlistName}
            onChange={(e) => setPlaylistName(e.target.value)}
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
            {manualMode ? 'Tracks will be loaded from your pasted list.'
              : 'Tracks will be fetched from Spotify when you finish setup.'}
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
            who can reveal results, start new rounds, or manage players. Anyone could
            technically pick the admin name from the dropdown — for a friend-group league
            this is fine.
          </div>
          <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="ml-btn ml-btn-ghost" onClick={() => setStep(manualMode ? 2 : 1)}>← Back</button>
            <button
              className="ml-btn ml-btn-primary"
              disabled={loading || parsedPlayers.length < 2 || !adminName}
              onClick={finalize}
            >
              {loading ? <><span className="ml-spinner" /> Setting up…</> : 'Start the league →'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ============ NEW ROUND SETUP ============
function NewRoundView({ league, currentPlayer, onComplete, onCancel }) {
  const [step, setStep] = useState(1);
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [playlistName, setPlaylistName] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualText, setManualText] = useState('');

  const finalize = async () => {
    setErr('');
    setLoading(true);
    try {
      const body = { actor: currentPlayer, playlistUrl };
      if (manualMode) {
        const lines = manualText.split('\n').map((l) => l.trim()).filter(Boolean);
        body.manualTracks = lines.map((line) => {
          const d = line.indexOf(' - ');
          return d > 0
            ? { name: line.slice(0, d).trim(), artists: line.slice(d + 3).trim() }
            : { name: line, artists: '' };
        });
        body.playlistName = playlistName || `Round ${league.rounds.length + 1}`;
      }
      await apiPost('/api/setup', body);
      onComplete();
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  const nextRoundNum = league.rounds.length + 1;

  return (
    <div className="ml-card">
      <div className="ml-section-label">New round · Round {nextRoundNum}</div>
      <h1 className="ml-heading">Start <em>Round {nextRoundNum}</em></h1>

      {err && <div className="ml-error">{err}</div>}

      {step === 1 && !manualMode && (
        <>
          <p className="ml-body">
            Same {league.players.length} players, fresh playlist. Past rounds and their
            scores are locked in — Round {nextRoundNum} adds onto cumulative totals.
          </p>
          <label className="ml-label">Spotify playlist URL for Round {nextRoundNum}</label>
          <input
            className="ml-input"
            value={playlistUrl}
            onChange={(e) => setPlaylistUrl(e.target.value)}
            placeholder="https://open.spotify.com/playlist/..."
          />
          <div style={{ marginTop: 18, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="ml-btn ml-btn-ghost" onClick={onCancel}>← Cancel</button>
            <button
              className="ml-btn ml-btn-primary"
              disabled={!extractPlaylistId(playlistUrl) || loading}
              onClick={finalize}
            >
              {loading ? <><span className="ml-spinner" /> Starting…</> : `Start Round ${nextRoundNum} →`}
            </button>
            <button
              className="ml-btn ml-btn-ghost"
              onClick={() => { setManualMode(true); }}
            >
              Enter tracks manually instead
            </button>
          </div>
        </>
      )}

      {manualMode && (
        <>
          <p className="ml-body">
            Paste tracks one per line as <em>Song Name - Artist</em>.
          </p>
          <label className="ml-label">Tracks</label>
          <textarea
            className="ml-textarea"
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            rows={12}
          />
          <label className="ml-label" style={{ marginTop: 14 }}>Round name (optional)</label>
          <input
            className="ml-input"
            value={playlistName}
            onChange={(e) => setPlaylistName(e.target.value)}
            placeholder={`Round ${nextRoundNum}`}
          />
          <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="ml-btn ml-btn-ghost" onClick={() => { setManualMode(false); }}>
              ← Use Spotify instead
            </button>
            <button
              className="ml-btn ml-btn-primary"
              disabled={!manualText.trim() || loading}
              onClick={finalize}
            >
              {loading ? <><span className="ml-spinner" /> Starting…</> : `Start Round ${nextRoundNum} →`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ============ MANAGE PLAYERS (admin only sub-component) ============
function ManagePlayersCard({ league, currentPlayer, onUpdate }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(league.players.join('\n'));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    if (!open) setDraft(league.players.join('\n'));
  }, [league.players, open]);

  const submit = async () => {
    setErr(''); setFeedback(''); setSaving(true);
    try {
      const newPlayers = draft.split('\n').map((p) => p.trim()).filter(Boolean);
      const data = await apiPost('/api/players', {
        actor: currentPlayer, players: newPlayers,
      });
      const bits = [];
      if (data.added?.length) bits.push(`+ ${data.added.join(', ')}`);
      if (data.removed?.length) bits.push(`− ${data.removed.join(', ')}`);
      setFeedback(bits.length ? `Updated: ${bits.join(' · ')}` : 'No changes.');
      await onUpdate();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ml-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <div className="ml-section-label">Manage players</div>
          <h2 className="ml-heading" style={{ fontSize: 22, margin: 0 }}>Roster ({league.players.length})</h2>
        </div>
        <button className="ml-btn ml-btn-ghost" onClick={() => { setOpen((o) => !o); setErr(''); setFeedback(''); }}>
          {open ? 'Close' : 'Edit'}
        </button>
      </div>

      {open && (
        <>
          <p className="ml-body" style={{ fontSize: 14, marginTop: 14 }}>
            Add or remove players one per line. Changes apply to the current unrevealed
            round; past rounds keep their original rosters for historical scoring.
            You can&apos;t remove yourself ({league.adminName}).
          </p>
          <label className="ml-label">Players (one per line)</label>
          <textarea
            className="ml-textarea"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={Math.max(6, league.players.length + 2)}
            spellCheck={false}
          />
          {err && <div className="ml-error" style={{ marginTop: 10 }}>{err}</div>}
          {feedback && <div className="ml-success" style={{ marginTop: 10 }}>{feedback}</div>}
          <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="ml-btn ml-btn-primary" disabled={saving} onClick={submit}>
              {saving ? <><span className="ml-spinner" /> Saving…</> : 'Save roster'}
            </button>
          </div>
        </>
      )}

      {!open && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
          {league.players.map((p) => (
            <span key={p} className="ml-player-tag">
              {p === league.adminName ? '★ ' : ''}{p}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ============ ADMIN TOOLS ============
function AdminToolsView({ league, activeRound, currentPlayer, onUpdate, onBack, onReveal, onNewRound, onReset }) {
  const round = activeRound;
  if (!round) return null;
  const totalPlayers = round.players.length;
  const claimedPlayers = new Set(Object.values(round.claims || {}));
  const fullyDonePlayers = round.players.filter((p) => {
    if (!claimedPlayers.has(p)) return false;
    const g = round.guesses?.[p] || {};
    return Object.keys(g).length >= round.tracks.length - 1;
  });
  const everyTrackClaimed = round.tracks.every((t) => round.claims?.[t.id]);

  const adminAssign = async (trackId, submitter) => {
    try {
      await apiPost('/api/admin-assign', {
        actor: currentPlayer, trackId, submitter: submitter || null,
      });
      await onUpdate();
    } catch (e) { alert(e.message); }
  };

  return (
    <>
      <div className="ml-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <div>
            <div className="ml-section-label">★ Admin tools · Round {(league.activeRoundIdx ?? 0) + 1}</div>
            <h1 className="ml-heading" style={{ margin: 0 }}>{round.name}</h1>
          </div>
          <button className="ml-btn ml-btn-ghost" onClick={onBack}>← Back to playing</button>
        </div>

        <div className="ml-stats">
          <div className="ml-stat"><span className="ml-stat-val">{Object.keys(round.claims || {}).length}/{totalPlayers}</span> claimed</div>
          <div className="ml-stat"><span className="ml-stat-val">{fullyDonePlayers.length}/{totalPlayers}</span> finished</div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {round.players.map((p) => {
            const hasClaim = claimedPlayers.has(p);
            const guessCount = Object.keys(round.guesses?.[p] || {}).length;
            const need = round.tracks.length - 1;
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

        {!everyTrackClaimed && !round.revealed && (
          <div className="ml-info-box" style={{ marginTop: 16 }}>
            <strong style={{ color: 'var(--gold)' }}>Heads up:</strong>{' '}
            {round.tracks.length - Object.keys(round.claims || {}).length} track(s) still unclaimed.
            You can reveal anyway, or assign them below.
          </div>
        )}

        {round.revealed && (
          <div className="ml-success" style={{ marginTop: 16 }}>
            Round {(league.activeRoundIdx ?? 0) + 1} is revealed. Ready for the next round?
          </div>
        )}

        <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {!round.revealed && (
            <button className="ml-btn ml-btn-primary" onClick={onReveal}>
              Reveal Round {(league.activeRoundIdx ?? 0) + 1} →
            </button>
          )}
          {round.revealed && (
            <button className="ml-btn ml-btn-primary" onClick={onNewRound}>
              Start Round {league.rounds.length + 1} →
            </button>
          )}
          <button className="ml-btn ml-btn-ghost ml-btn-danger" onClick={onReset}>
            Reset entire league
          </button>
        </div>
      </div>

      <ManagePlayersCard league={league} currentPlayer={currentPlayer} onUpdate={onUpdate} />

      <div className="ml-card">
        <div className="ml-section-label">Truth ledger · override claims</div>
        <h2 className="ml-heading" style={{ fontSize: 22 }}>Set the <em>real</em> submitter</h2>
        <div className="ml-info-box" style={{ marginTop: 12 }}>
          <strong style={{ color: 'var(--gold)' }}>Spoiler warning:</strong> the dropdowns below
          show what each player claimed in this round. Skip this if you still want to play
          fair on your own guesses.
        </div>
        <div style={{ marginTop: 16 }}>
          {round.tracks.map((t, i) => {
            const truth = round.claims?.[t.id] || '';
            return (
              <TruthLedgerRow
                key={t.id}
                index={i}
                track={t}
                truth={truth}
                players={round.players}
                onChange={(v) => adminAssign(t.id, v)}
              />
            );
          })}
        </div>
      </div>

      <div className="ml-footer-actions">
        <button className="ml-btn ml-btn-ghost" onClick={onBack}>← Back to playing</button>
      </div>
    </>
  );
}

function TruthLedgerRow({ index, track, truth, players, onChange }) {
  const isUnclaimed = !truth;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 0', borderBottom: '1px solid var(--line)', flexWrap: 'wrap',
    }}>
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--text-faint)', minWidth: 24 }}>
        {String(index + 1).padStart(2, '0')}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'Fraunces, serif', fontSize: 15, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.name}</div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.artists}</div>
      </div>
      <select
        value={truth}
        onChange={(e) => onChange(e.target.value)}
        className={`ml-guess-select ${truth ? 'has-value' : ''}`}
        style={{
          minWidth: 160,
          borderColor: isUnclaimed ? 'var(--red)' : undefined,
          color: isUnclaimed ? 'var(--red)' : undefined,
        }}
      >
        <option value="">— unclaimed —</option>
        {players.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
    </div>
  );
}

// ============ PLAYER GAME ============
function PlayerGameView({ league, activeRound, currentPlayer, isAdmin, onLeave, onUpdate, onOpenAdmin, onOpenHistory }) {
  const round = activeRound;
  if (!round) {
    return (
      <div className="ml-card">
        <h2 className="ml-heading">No active round.</h2>
        <p className="ml-body">Wait for the admin to start a new round.</p>
        {isAdmin && (
          <button className="ml-btn ml-btn-primary" onClick={onOpenAdmin}>★ Open admin tools →</button>
        )}
      </div>
    );
  }

  const myClaim = Object.entries(round.claims || {}).find(([, p]) => p === currentPlayer)?.[0] || null;
  const myGuesses = round.guesses?.[currentPlayer] || {};
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

  const otherPlayers = round.players.filter((p) => p !== currentPlayer);
  const guessableCount = round.tracks.length - (myClaim ? 1 : 0);
  const guessedCount = Object.keys(myGuesses).filter((tid) => tid !== myClaim).length;
  const progress = guessableCount > 0 ? (guessedCount / guessableCount) * 100 : 0;
  const usedGuesses = new Set(Object.values(myGuesses));
  const availableLeft = otherPlayers.filter((p) => !usedGuesses.has(p)).length;

  return (
    <>
      <div className="ml-card">
        <div className="ml-section-label">Round {(league.activeRoundIdx ?? 0) + 1} · {currentPlayer}{isAdmin && ' ★ admin'}</div>
        <h1 className="ml-heading">{round.name}</h1>
        <p className="ml-body">
          Pick the song <em>you</em> submitted (yellow button), then guess who submitted each other track.
          Each player can only be guessed once across all tracks — pick wisely!
        </p>
        <div className="ml-stats">
          <div className="ml-stat"><span className="ml-stat-val">{myClaim ? '✓' : '0'}</span> claim</div>
          <div className="ml-stat"><span className="ml-stat-val">{guessedCount}/{guessableCount}</span> guesses made</div>
          <div className="ml-stat"><span className="ml-stat-val">{availableLeft}</span> names available</div>
        </div>
        <div className="ml-progress">
          <div className="ml-progress-bar" style={{ width: `${progress}%` }} />
        </div>

        {league.rounds.length > 1 && (
          <div style={{ marginTop: 14 }}>
            <button className="ml-btn ml-btn-ghost" onClick={onOpenHistory}>
              View past rounds & standings →
            </button>
          </div>
        )}
      </div>

      {isAdmin && (
        <div className="ml-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div className="ml-section-label" style={{ marginBottom: 6 }}>You&apos;re the admin</div>
            <div style={{ fontSize: 14, color: 'var(--text-dim)' }}>
              Reveal results, manage players, start new rounds — all in admin tools.
            </div>
          </div>
          <button className="ml-btn ml-btn-primary" onClick={onOpenAdmin}>
            ★ Open admin tools →
          </button>
        </div>
      )}

      <div className="ml-card-flush">
        {round.tracks.map((track, i) => {
          const isMine = myClaim === track.id;
          const claimedByOther = round.claims?.[track.id] && round.claims[track.id] !== currentPlayer;
          const guess = myGuesses[track.id] || '';
          return (
            <div key={track.id} className="ml-track">
              <div className="ml-track-num">{String(i + 1).padStart(2, '0')}</div>
              {track.albumArt
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={track.albumArt} alt="" className="ml-track-art" />
                : <div className="ml-track-art-placeholder">♪</div>}
              <div className="ml-track-info">
                <div className="ml-track-name">{track.name}</div>
                <div className="ml-track-artist">{track.artists}</div>
              </div>
              <div className="ml-track-actions">
                <button
                  className={`ml-mine-btn ${isMine ? 'active' : ''}`}
                  onClick={() => setMyClaim(isMine ? null : track.id)}
                  disabled={saving || (claimedByOther && !isMine)}
                  title={claimedByOther ? `Claimed by ${round.claims[track.id]}` : ''}
                >
                  {isMine ? '★ Mine' : claimedByOther ? 'Taken' : 'Mine'}
                </button>
                {!isMine && (
                  <select
                    className={`ml-guess-select ${guess ? 'has-value' : ''}`}
                    value={guess}
                    onChange={(e) => setMyGuess(track.id, e.target.value)}
                  >
                    <option value="">Guess who…</option>
                    {otherPlayers
                      .filter((p) => !usedGuesses.has(p) || p === guess)
                      .map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="ml-footer-actions">
        <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
          Progress saves automatically.
        </div>
        <button className="ml-btn ml-btn-ghost" onClick={onLeave}>← Switch player</button>
      </div>
    </>
  );
}

// ============ RESULTS (the current/revealed round) ============
function ResultsView({ league, round, roundIndex, roundScores, totals, isAdmin, currentPlayer, onBack, onOpenHistory, onAssign, onUnreveal }) {
  if (!round) return null;
  const sortedThisRound = [...round.players].sort((a, b) => (roundScores[b] || 0) - (roundScores[a] || 0));
  const topScore = roundScores[sortedThisRound[0]] || 0;
  const showCombined = league.rounds.filter((r) => r.revealed).length > 1;

  return (
    <>
      <div className="ml-card">
        <div className="ml-section-label">Round {roundIndex + 1} revealed</div>
        <h1 className="ml-heading">The <em>scoreboard</em></h1>
        <p className="ml-body">One point per correct guess. Self-claims don&apos;t score.</p>

        <div className="ml-scoreboard">
          {sortedThisRound.map((p, i) => {
            const score = roundScores[p] || 0;
            const isWinner = score === topScore && topScore > 0;
            return (
              <div key={p} className={`ml-score-row ${isWinner ? 'winner' : ''}`}>
                <div className="ml-score-rank">{String(i + 1).padStart(2, '0')}</div>
                <div className="ml-score-name">{isWinner && '🏆 '}{p}</div>
                <div className="ml-score-val">{score}</div>
              </div>
            );
          })}
        </div>

        {showCombined && (
          <>
            <div className="ml-divider" />
            <div className="ml-section-label" style={{ marginBottom: 8 }}>Cumulative · across all rounds</div>
            <CumulativeBoard totals={totals} league={league} />
          </>
        )}

        <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {league.rounds.length > 1 && (
            <button className="ml-btn" onClick={onOpenHistory}>View past rounds →</button>
          )}
          {isAdmin && (
            <>
              <button className="ml-btn ml-btn-ghost" onClick={onUnreveal}>Un-reveal</button>
            </>
          )}
        </div>
      </div>

      <div className="ml-card-flush">
        <div style={{ padding: '20px 28px 8px' }}>
          <div className="ml-section-label">Track by track</div>
          <h2 className="ml-heading" style={{ fontSize: 22 }}>Who picked <em>what</em></h2>
        </div>
        {round.tracks.map((t, i) => (
          <RevealTrackRow
            key={t.id}
            index={i}
            track={t}
            truth={round.claims?.[t.id]}
            round={round}
            isAdmin={isAdmin}
            onAssign={onAssign}
          />
        ))}
      </div>

      <div className="ml-footer-actions">
        <button className="ml-btn ml-btn-ghost" onClick={onBack}>← Back</button>
      </div>
    </>
  );
}

function CumulativeBoard({ totals, league }) {
  const entries = Object.entries(totals);
  entries.sort((a, b) => b[1] - a[1]);
  const top = entries[0]?.[1] || 0;
  return (
    <div className="ml-scoreboard">
      {entries.map(([name, score], i) => {
        const isWinner = score === top && top > 0;
        return (
          <div key={name} className={`ml-score-row ${isWinner ? 'winner' : ''}`}>
            <div className="ml-score-rank">{String(i + 1).padStart(2, '0')}</div>
            <div className="ml-score-name">{isWinner && '🏆 '}{name}</div>
            <div className="ml-score-val">{score}</div>
          </div>
        );
      })}
    </div>
  );
}

function RevealTrackRow({ index, track, truth, round, isAdmin, onAssign }) {
  return (
    <div className="ml-reveal-track">
      <div className="ml-reveal-header">
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--text-faint)', minWidth: 24 }}>
          {String(index + 1).padStart(2, '0')}
        </span>
        {track.albumArt
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={track.albumArt} alt="" className="ml-track-art" />
          : <div className="ml-track-art-placeholder">♪</div>}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="ml-track-name">{track.name}</div>
          <div className="ml-track-artist">{track.artists}</div>
        </div>
      </div>
      <div className="ml-truth" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span>
          Submitted by → <span style={{ color: 'var(--accent-2)', fontStyle: 'normal' }}>{truth || '— unclaimed —'}</span>
        </span>
        {isAdmin && onAssign && (
          <select
            value={truth || ''}
            onChange={(e) => onAssign(track.id, e.target.value)}
            className="ml-guess-select"
            style={{ minWidth: 140, marginLeft: 'auto' }}
            title="Admin: override the true submitter"
          >
            <option value="">— unclaimed —</option>
            {round.players.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
      </div>
      {truth && (
        <div className="ml-guesses-grid">
          {round.players.filter((p) => p !== truth).map((p) => {
            const g = round.guesses?.[p]?.[track.id];
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
}

// ============ HISTORY ============
function HistoryView({ league, roundScores, totals, viewingRoundIdx, onSelectRound, onBack, isAdmin, currentPlayer, onAssign }) {
  const selected = viewingRoundIdx == null ? null : league.rounds[viewingRoundIdx];

  return (
    <>
      <div className="ml-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <div>
            <div className="ml-section-label">History &amp; standings</div>
            <h1 className="ml-heading" style={{ margin: 0 }}>The <em>league</em> so far</h1>
          </div>
          <button className="ml-btn ml-btn-ghost" onClick={onBack}>← Back</button>
        </div>

        <div className="ml-section-label" style={{ marginTop: 12 }}>Cumulative standings</div>
        <CumulativeBoard totals={totals} league={league} />

        <div className="ml-divider" />

        <div className="ml-section-label">Round by round</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8, fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--text-faint)', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em' }}>
              <th style={{ padding: '8px 4px' }}>#</th>
              <th style={{ padding: '8px 4px' }}>Round</th>
              <th style={{ padding: '8px 4px', textAlign: 'right' }}>Status</th>
              <th style={{ padding: '8px 4px', textAlign: 'right' }}>Top scorer</th>
              <th style={{ padding: '8px 4px' }}></th>
            </tr>
          </thead>
          <tbody>
            {league.rounds.map((r, i) => {
              const scores = roundScores[i] || {};
              const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
              const top = entries[0];
              return (
                <tr key={r.id} style={{ borderTop: '1px solid var(--line)' }}>
                  <td style={{ padding: '12px 4px', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-faint)' }}>R{i + 1}</td>
                  <td style={{ padding: '12px 4px', fontFamily: 'Fraunces, serif' }}>{r.name}</td>
                  <td style={{ padding: '12px 4px', textAlign: 'right', fontSize: 12 }}>
                    {r.revealed ? <span style={{ color: 'var(--green)' }}>revealed</span> : <span style={{ color: 'var(--accent-2)' }}>in progress</span>}
                  </td>
                  <td style={{ padding: '12px 4px', textAlign: 'right', fontSize: 13 }}>
                    {r.revealed && top ? `${top[0]} (${top[1]})` : '—'}
                  </td>
                  <td style={{ padding: '12px 4px', textAlign: 'right' }}>
                    <button className="ml-btn ml-btn-ghost" style={{ padding: '6px 10px', fontSize: 10 }} onClick={() => onSelectRound(i)}>
                      View
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected && (
        <RoundDetailCard
          round={selected}
          roundIndex={viewingRoundIdx}
          roundScores={roundScores[viewingRoundIdx] || {}}
          isAdmin={isAdmin}
          onClose={() => onSelectRound(null)}
          onAssign={(trackId, submitter) => onAssign(trackId, submitter, viewingRoundIdx)}
        />
      )}

      <div className="ml-footer-actions">
        <button className="ml-btn ml-btn-ghost" onClick={onBack}>← Back</button>
      </div>
    </>
  );
}

function RoundDetailCard({ round, roundIndex, roundScores, isAdmin, onClose, onAssign }) {
  const sorted = [...round.players].sort((a, b) => (roundScores[b] || 0) - (roundScores[a] || 0));
  const top = roundScores[sorted[0]] || 0;
  return (
    <div className="ml-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div className="ml-section-label">Round {roundIndex + 1} detail</div>
          <h2 className="ml-heading" style={{ fontSize: 22, margin: 0 }}>{round.name}</h2>
        </div>
        <button className="ml-btn ml-btn-ghost" onClick={onClose}>Close</button>
      </div>

      {round.revealed ? (
        <>
          <div className="ml-section-label" style={{ marginTop: 16 }}>Scores</div>
          <div className="ml-scoreboard">
            {sorted.map((p, i) => {
              const sc = roundScores[p] || 0;
              const winner = sc === top && top > 0;
              return (
                <div key={p} className={`ml-score-row ${winner ? 'winner' : ''}`}>
                  <div className="ml-score-rank">{String(i + 1).padStart(2, '0')}</div>
                  <div className="ml-score-name">{winner && '🏆 '}{p}</div>
                  <div className="ml-score-val">{sc}</div>
                </div>
              );
            })}
          </div>

          <div className="ml-divider" />

          <div className="ml-section-label">Track by track</div>
          {round.tracks.map((t, i) => (
            <RevealTrackRow
              key={t.id}
              index={i}
              track={t}
              truth={round.claims?.[t.id]}
              round={round}
              isAdmin={isAdmin}
              onAssign={isAdmin ? onAssign : null}
            />
          ))}
        </>
      ) : (
        <p className="ml-body" style={{ marginTop: 16 }}>This round hasn&apos;t been revealed yet.</p>
      )}
    </div>
  );
}
