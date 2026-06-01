# Whose Song is it Anyways?

A Music League companion app. Players claim their own track from each round's
Spotify playlist, then guess who submitted each of the others. Multi-round
support: keep playing week after week, and per-round + cumulative scores
track everyone's running standings.

All state is shared across players in real time via Upstash Redis.

---

## Deploy in ~10 minutes

You'll need free accounts at **GitHub**, **Vercel**, and **Upstash**. No Spotify
developer setup required — track data comes from Spotify's public embed pages.

### 1) Put the code on GitHub
1. <https://github.com/new>, name the repo, **Create repository**
2. **uploading an existing file**
3. Drag the *contents* of this folder into the upload area
4. **Commit changes**

### 2) Create the database (Upstash Redis)
1. Sign up at <https://upstash.com> with GitHub
2. **Create Database** → Regional, closest region
3. Copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` from the REST API section

### 3) Deploy to Vercel
1. Sign up at <https://vercel.com> with GitHub
2. **Add New → Project** → import your repo
3. Before clicking Deploy, expand **Environment Variables** and paste both Upstash values
4. Deploy (~2 minutes)

### 4) Use it
1. Open the URL → **Start a new league**
2. Paste Round 1's playlist URL → list players + pick admin → Start
3. Share the URL. Everyone claims their song + guesses.
4. Admin reveals when ready → scoreboard appears.
5. Want round 2? In admin tools click **Start Round N →**, paste the new
   playlist, and go. Past rounds and scores are preserved.

## How rounds work

- The league has one **active round** at any time (the most recent one created).
- Players can only claim/guess on the active round.
- Past rounds are locked but viewable in the "View past rounds & standings" page.
- A new round can only start once the previous one is revealed (so scores lock in).
- Adding/removing players via Manage Players applies to the active (unrevealed)
  round and future rounds; past rounds keep their original rosters so historical
  scores stay intact.
- The "Cumulative" scoreboard adds up points across all revealed rounds.

## Admin

The admin is one of the players, picked at league setup. They see a "★ Open
admin tools" button on their player view. Admin tools let you:
- See claim/guess progress per player
- Reveal the current round
- Start a new round (only after revealing)
- Override the true submitter for any track in any round
- Manage the player roster
- Reset the entire league (nuke everything)

There's no admin passcode. Anyone with the URL could in theory pick the admin's
name from the dropdown and get admin powers — fine for a friend-group league;
don't share the URL more widely than you trust.

## Updating later

Push changes to GitHub → Vercel auto-deploys within ~1 minute.

## Troubleshooting

- **"Playlist not found"** — make sure it's public. Right-click in Spotify → Share → Copy link to playlist. Open in incognito: if tracks load, it's public.
- **"Could not find playlist data in the embed page"** — Spotify changed their embed structure. Tell me and I'll update the parser.
- **"Redis not configured"** — env variables missing in Vercel. Settings → Environment Variables, then redeploy.
- **Players don't see updates** — the app polls every 4 seconds. Refresh if stuck.
- **Starting a new round is blocked** — current round must be revealed first.
