# Whose Song is it Anyways?

A Music League companion app for guessing who submitted which song. Players claim
their own track from the playlist, then guess who submitted each of the others.
The designated admin reveals when ready and the scoreboard appears for everyone.

All state is shared across players in real time via Upstash Redis — no silos.

---

## Deploy in ~10 minutes

You'll need free accounts at **GitHub**, **Vercel**, and **Upstash**. No Spotify
developer setup required — we pull track data from Spotify's public embed pages.

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
2. Paste the Music League playlist URL → Next
3. List players, pick who the admin is (you!), start the round
4. Share the URL with the league. Everyone picks their name; only the admin sees Reveal/Reset

---

## How admin works

There's no passcode. The admin is just one of the player names — whoever is
designated during setup. When that person picks their name from the dropdown,
they see admin controls (Reveal, Reset, live progress stats) on their player
view, marked with ★. Everyone else just sees the player view.

Technically, anyone with the URL could pick the admin's name from the list and
gain admin powers. For a friend-group league this is fine. Don't share the URL
with people you wouldn't trust to behave.

## Updating later

Push changes to GitHub → Vercel auto-deploys within ~1 minute.

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
    └── spotify.js           # public embed-page scraper
```

## Troubleshooting

- **"Playlist not found"** — make sure it's public. Right-click in Spotify → Share → Copy link to playlist. Open the URL in an incognito window: if the tracks load, it's public.
- **"Could not find playlist data in the embed page"** — rare, but means Spotify changed their embed structure. Tell me and I'll update the parser.
- **"Redis not configured"** — env variables missing in Vercel. Project Settings → Environment Variables → check both Upstash values, then redeploy.
- **Players don't see updates** — the app polls every 4 seconds. If stuck, refresh.
