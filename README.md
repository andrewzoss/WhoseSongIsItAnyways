# Whose Song is it Anyways?

A Music League companion app for guessing who submitted which song. Players claim
their own track from the playlist, then guess who submitted each of the others.
Admin reveals when ready and the scoreboard appears for everyone.

All state is shared across players in real time via Upstash Redis — no silos.

---

## Deploy in ~10 minutes

You'll need free accounts at **GitHub**, **Vercel**, and **Upstash**, plus your
Spotify Client ID & Secret (from the Spotify Developer Dashboard).

### 1) Put the code on GitHub

1. Go to <https://github.com/new>
2. Name the repo something like `whose-song-is-it`
3. Set it to **Private** (this code doesn't contain secrets, but it's a good habit)
4. Click **Create repository**
5. On the empty repo page, click **uploading an existing file**
6. Drag the entire contents of the `whose-song-is-it` folder into the upload area
   (i.e. drag `package.json`, the `app/` folder, the `lib/` folder, etc. — *not*
   the outer `whose-song-is-it` folder itself)
7. Scroll down and click **Commit changes**

### 2) Create the database (Upstash Redis)

1. Go to <https://upstash.com> and **Sign Up** (using GitHub is fastest)
2. Click **Create Database**
3. Name: `whose-song-is-it` (anything works)
4. Type: **Regional** (cheaper, fine for this)
5. Region: pick the one closest to your league members
6. Click **Create**
7. On the database's page, scroll to **REST API**
8. You'll see two values you need:
   - `UPSTASH_REDIS_REST_URL` — looks like `https://xxx-xxx.upstash.io`
   - `UPSTASH_REDIS_REST_TOKEN` — a long random string
9. Keep that tab open — you'll paste these in the next step.

### 3) Deploy to Vercel

1. Go to <https://vercel.com> and **Sign Up** with your GitHub account
2. Click **Add New… → Project**
3. Find your `whose-song-is-it` repo in the list and click **Import**
4. Leave the Framework Preset as **Next.js** (Vercel auto-detects it)
5. **Before clicking Deploy**, expand the **Environment Variables** section
6. Add these two variables (copy from your Upstash tab):

   | Name | Value |
   |---|---|
   | `UPSTASH_REDIS_REST_URL` | (paste from Upstash) |
   | `UPSTASH_REDIS_REST_TOKEN` | (paste from Upstash) |

7. Click **Deploy**
8. Wait ~2 minutes for the build to finish
9. Vercel gives you a URL like `whose-song-is-it-abc123.vercel.app` — that's your app

### 4) Use it

1. Open your Vercel URL
2. Click **Set up a new round**
3. Paste your Spotify playlist URL
4. Paste your Spotify **Client ID** and **Client Secret** (from
   <https://developer.spotify.com/dashboard>)
5. Leave "Remember these on the server" checked so you don't have to re-paste next round
6. Hit Next → add players (one per line) and set an admin passcode → **Start the round**
7. Share the Vercel URL with everyone in your league. They pick their name,
   claim their song, and guess the others.
8. When everyone's locked in, unlock the admin panel with your passcode and
   click **Reveal results**.

---

## Updating the app later

If you (or I) make changes to the code, push them to GitHub and Vercel
auto-deploys within a minute. To edit a file directly:

1. Open the file on GitHub
2. Click the pencil icon
3. Make your change
4. Scroll down, click **Commit changes**
5. Vercel sees the commit and redeploys

---

## A few things worth knowing

- **Spotify creds are stored server-side only** — they sit in your private Upstash
  database and are never sent to players' browsers. The admin passcode is hashed.
- **The admin passcode is the only auth boundary.** Anyone with the URL can join
  as any player (name-based), but only someone with the passcode can reveal results
  or reset the round. For a friend-group Music League this is fine; players are
  on the honor system to pick their own name.
- **Free tier headroom is generous.** Vercel's free Hobby tier handles this easily;
  Upstash's free tier gives you 10,000 commands/day, way more than you'll use.
- **Rounds are exclusive** — setting up a new round wipes the previous one.
  If you want history, take a screenshot of the results screen before resetting.

## Project layout

```
whose-song-is-it/
├── package.json          # dependencies
├── next.config.mjs       # Next.js config (allows Spotify image domains)
├── jsconfig.json         # path aliases (@/lib/db etc.)
├── README.md             # this file
├── app/
│   ├── layout.js         # root layout, font loading
│   ├── page.js           # the entire UI (all views in one file)
│   ├── globals.css       # styles
│   └── api/
│       ├── state/route.js    # GET full game state
│       ├── setup/route.js    # POST create new round (admin)
│       ├── claim/route.js    # POST player claims a song
│       ├── guess/route.js    # POST player submits a guess
│       ├── reveal/route.js   # POST admin reveal toggle
│       └── reset/route.js    # POST admin wipe round
└── lib/
    ├── db.js             # Upstash Redis helpers
    └── spotify.js        # Spotify API (Client Credentials flow)
```

## Troubleshooting

- **"Redis not configured"** — your environment variables aren't set. Go to your
  Vercel project → Settings → Environment Variables and confirm
  `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are both set. After
  adding them, redeploy (Vercel → Deployments → ⋯ → Redeploy).
- **"Spotify rejected the credentials"** — double-check the Client ID and Secret.
  Spotify shows the Client Secret behind a "View client secret" link in your app's
  Settings; make sure you copied it cleanly with no extra whitespace.
- **"Playlist not found"** — make sure the playlist is public (right-click in
  Spotify → Share → check the share link works in an incognito window).
- **Players don't see updates** — the app polls every 4 seconds. If it really
  seems stuck, refresh the page.
