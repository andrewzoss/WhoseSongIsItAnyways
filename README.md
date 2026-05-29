# Whose Song is it Anyways?

A Music League companion app for guessing who submitted which song. Players claim
their own track from the playlist, then guess who submitted each of the others.
The designated admin reveals when ready and the scoreboard appears for everyone.

All state is shared across players in real time via Upstash Redis — no silos.

---

## Deploy in ~10 minutes

You'll need free accounts at **GitHub**, **Vercel**, and **Upstash**, plus your
Spotify Client ID & Secret (from the Spotify Developer Dashboard).

### 1) Put the code on GitHub
1. Go to <https://github.com/new>, name the repo, click **Create repository**
2. On the empty repo page, click **uploading an existing file**
3. Drag the *contents* of this folder (the `app/` folder, `lib/` folder, `package.json`, etc.) into the upload area
4. Scroll down and click **Commit changes**

### 2) Create the database (Upstash Redis)
1. Sign up at <https://upstash.com> (GitHub login is fastest)
2. **Create Database** → name it, type = Regional, region closest to you → Create
3. On the database page, find the **REST API** section — copy:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

### 3) Deploy to Vercel
1. Sign up at <https://vercel.com> with GitHub
2. **Add New → Project** → import your repo
3. **Before clicking Deploy**, expand **Environment Variables** and paste both Upstash values
4. Deploy. ~2 minutes later, Vercel gives you a URL

### 4) Use it
1. Open the URL → **Set up a new round**
2. Paste the playlist URL + your Spotify Client ID & Secret
3. List players, pick who the admin is (you!), start the round
4. Share the URL. Everyone picks their name; only the admin sees Reveal/Reset

---

## How admin works

There's no passcode. The admin is just one of the player names — whoever is
designated during setup. When that person picks their name from the dropdown,
they see the admin panel inline with their player view. Anyone else just sees
the player view.

Technically, anyone with the URL could pick the admin's name from the list and
gain admin powers. For a friend-group league this is fine. Don't share the URL
with people you wouldn't trust to behave.

## Updating later

Push changes to GitHub → Vercel auto-deploys within ~1 minute. To edit a file:
GitHub → open the file → pencil icon → make changes → Commit.

## Project layout

```
whose-song-is-it/
├── package.json
├── next.config.mjs
├── jsconfig.json
├── README.md
├── app/
│   ├── layout.js
│   ├── page.js              # all UI
│   ├── globals.css
│   └── api/
│       ├── state/route.js   # GET full game state
│       ├── setup/route.js   # POST create new round
│       ├── claim/route.js   # POST player claims a song
│       ├── guess/route.js   # POST player submits a guess
│       ├── reveal/route.js  # POST admin reveal toggle
│       └── reset/route.js   # POST admin wipe round
└── lib/
    ├── db.js                # Upstash Redis helpers
    └── spotify.js           # Spotify Client Credentials flow
```

## Troubleshooting

- **"Failed to fetch tracks (403)"** — Spotify is refusing to serve the playlist.
  - Most common: the playlist isn't truly public. Right-click in Spotify → Share → "Copy link to playlist" and open that URL in an incognito window. If you can see the tracks, it's public. If not, switch it to public.
  - Less common: Client Secret has a typo. Try regenerating the secret in your Spotify Developer Dashboard (Settings → "Rotate client secret") and pasting the new one in fresh.
- **"Spotify rejected the credentials"** — Client ID or Secret is wrong or has extra whitespace.
- **"Redis not configured"** — env variables missing in Vercel. Project Settings → Environment Variables → check both Upstash values, then redeploy.
- **Players don't see updates** — the app polls every 4 seconds. If stuck, refresh.
