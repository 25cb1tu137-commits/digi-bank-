# Campus Bank (with backend)

Internet banking project. The browser shows the screens; the server keeps all the data and enforces every rule.

- Backend: Node.js (no npm packages) and SQLite (built in to Node)
- Front end: `public/index.html`, `public/style.css`, `public/app.js`
- Needs **Node 22.13 or newer**

## Run on your computer
```
node server.js
```
Open http://localhost:3000. Run the checks with `node test.js`.

## What the server does
- PINs are hashed (scrypt). Login gives a session token that lasts 7 days.
- 3 wrong PINs lock that customer for 30 seconds.
- Money is stored in paise (whole numbers), and every balance change goes through one function.
- Each action runs in a database transaction, so a transfer either fully happens or not at all.
- Rules: savings minimum balance Rs 1,000, KYC limit of Rs 25,000 per transfer, UPI/IMPS/NEFT limits, loan limits, card daily limit, frozen accounts.
- Fixed deposits are credited automatically when their term ends.

## Test logins
Created on first start (turn off with `SEED_DEMO=false`):
- Mobile 9876543210, PIN 1234 (account 500011223301, UPI asha@campus)
- Mobile 9123456780, PIN 4321 (account 500011223302, UPI rohan@campus)

## Settings (environment variables)
| Name | Meaning | Default |
|---|---|---|
| `PORT` | Port to listen on (hosts set this for you) | 3000 |
| `DB_PATH` | Where the database file is kept | `./data/bank.db` |
| `SEED_DEMO` | Set to `false` to skip the two test customers | on |
| `NODE_VERSION` | Set to `22.14.0` on hosts that ask for it | - |

## Deploy on Vercel
1. Upload this folder to a GitHub repository (the `.gitignore` already skips the database).
2. On vercel.com choose Add New > Project, import the repository, leave every setting as it is (Framework Preset: Other, no build command) and press Deploy.
3. Open the URL Vercel gives you and log in with a test login below.

`vercel.json` and `api/index.js` already connect the backend, and `public/` is served as the website.

**Important:** Vercel functions have no permanent disk, so on Vercel the database is kept in `/tmp`. It is created fresh with the two test customers, but new accounts and transfers can disappear when Vercel restarts or scales the function, and a login may need repeating. This is fine for demos and project viewing. For permanent data use Render with a Disk, Railway with a Volume, or Docker (below).

## Deploy on Render (free)
1. Put this folder in a GitHub repository (the `.gitignore` already skips the database).
2. On render.com choose New > Blueprint (it reads `render.yaml`), or New > Web Service with build command empty and start command `node server.js`. Add the environment variable `NODE_VERSION` = `22.14.0`.
3. Deploy, then open the URL Render gives you.

**Important:** on Render's free plan the disk is wiped whenever the service restarts or redeploys, so accounts disappear. To keep data, use a paid plan, add a Disk mounted at `/var/data`, and set `DB_PATH=/var/data/bank.db`.

## Deploy on Railway
New Project > Deploy from GitHub repo. Add a Volume mounted at `/data`, then set `DB_PATH=/data/bank.db` and `NODE_VERSION=22`. Railway sets `PORT` itself.

## Deploy with Docker (Fly.io, a VPS, etc.)
```
docker build -t campus-bank .
docker run -p 3000:3000 -v campus-data:/app/data campus-bank
```

## Before using it for anything real
This is a learning project. A real bank would also need a managed database with backups, longer PINs or passwords with OTP, HTTPS only, audit logs and a security review.
