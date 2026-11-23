# স্টাডি ম্যাটেরিয়ালস (Study Hub)

Munjiba's study-materials site, rebuilt as a multi-teacher platform: teachers upload materials and design their own page, students open them without logging in. Runs entirely on Cloudflare's free tier with a free `*.pages.dev` address.

- **Super admin:** `mahedi.pro@gmail.com` — full control, can't be demoted or removed.
- **Teachers** sign in at `/admin/login` with **Google** or their **own email + password**.
- **Students** never sign in. They open a teacher page (`/t/munjiba`), a material, or a share link (`/s/abc123`).
- The home page (`/`) shows Munjiba's page by default (Site settings → Home page).

## Sign-in and accounts

| How a teacher joins | What happens |
|---|---|
| Super admin clicks **Invite teacher** | A one-time link is created to send on WhatsApp/email. The teacher opens it and sets a password — or just clicks “Continue with Google” with the same Gmail. |
| Teacher signs up at `/admin/login` | Depends on **Site settings → Teacher sign-up**: needs approval (default), open, or invite-only. Pending sign-ups appear at the top of **Teachers** with Approve / Reject. |
| Forgot password | Admin opens **Teachers → ⋯ → Create password reset link** and sends it. (No email service is needed — free tier friendly.) |

Security details: sessions are signed, HttpOnly cookies (30 days, sliding). Passwords use PBKDF2-SHA256 with a per-user salt plus a server-side pepper (`AUTH_SECRET`). Accounts lock for 15 minutes after 8 wrong passwords. Cross-site POSTs are rejected. Changing a password or disabling a user signs them out everywhere. Nobody can claim the super-admin email with a password unless they know `SETUP_CODE` (or they prove it via Google).

**Limits:** teachers have **no storage or file-size limits by default**. The super admin can set a per-teacher storage limit (Teachers → Edit) or site-wide limits (Site settings). Keep an eye on **Storage & usage** — Cloudflare's free R2 storage is 10 GB for the whole site.

## Features

**For teachers**
- Upload PDF, Word, PowerPoint, Excel, audio, video, images — drag & drop, many files at once (each becomes a material)
- Upload a whole **folder or .zip** of HTML/CSS/JS as an interactive lesson (unzipped in the browser)
- Add **YouTube / Vimeo / Facebook / Google Drive** links and **Markdown notes** (no storage used)
- Subject, class, tags, emoji card icon or cover image, draft / link-only / published, allow or block download
- **Lecture audio** on any material (shown as the dark audio player above a worksheet or web page, with speed control, ±10 s, resume and a floating mini-player)
- **Collections** (courses, weekly packs) with drag-to-reorder and sections — students get a table of contents with progress tracking
- **Share links** per class or batch: custom slug, passcode, expiry date, download override, open counts, QR code, WhatsApp share
- **Page designer** (starts with the classic Munjiba look — dotted paper, serif headline with the gold hand-drawn underline, ink-outlined cards): 13 block types (hero, text, notice board, collections, searchable materials library, featured, video, link buttons, contact, FAQ, gallery, stats, divider), drag-and-drop ordering, 9 theme presets (Munjiba classic first) plus custom colours, background texture, 11 fonts (7 Bangla), corner radius, card and button styles, page width, layout options, undo/redo, autosaved draft, publish/revert, live preview in desktop, laptop, tablet and mobile widths, click-to-edit preview
- Notices (pinned, auto-expiring), dashboard with 14-day views chart, storage quota meter, bulk actions

**For admins**
- Invite teachers with one-time links, approve sign-ups, reset passwords, set roles and optional storage limits, disable or remove (with content transfer)
- Moderate all materials, site branding and home page mode, file size limits
- Storage and usage overview against the free tier, activity log

**For students**
- Fast, themed pages in Bangla or English (toggle)
- PDF viewer (pdf.js, works on Android), DOCX rendered in-browser, Office viewer for slides/sheets, audio/video player with speed control, ±10 s and resume, image viewer, sandboxed HTML lessons, full screen
- Collection progress saved on their device, next/previous navigation, copy link / WhatsApp share

## Architecture

```
Browser ──► Cloudflare Pages (study-hub.pages.dev)
             ├─ /            React SPA (static, unlimited free requests)
             ├─ /api/public  Hono API on Pages Functions (no login)
             ├─ /api/auth    Sign-in: Google OAuth, email + password, invite/reset links
             └─ /api/admin   Hono API for teachers/admins (signed session cookie)
                    │
                    ├─ D1   users, materials, collections, links, designs, notices, audit log
                    └─ R2   all files (m/<materialId>/files/…, a/<ownerId>/<assetId>)

Content Worker (study-hub-content.<you>.workers.dev)
             └─ serves HTML lesson bundles from R2 on a separate origin, using short-lived signed URLs
```

Files are opened with **signed URLs that expire after 6 hours** (HMAC with `SIGNING_KEY`). With R2 API credentials configured, uploads and downloads go **directly between the browser and R2** (presigned URLs), so they don't use Worker requests or CPU and files can exceed 100 MB.

## Free-tier limits to keep in mind

| Resource | Free allowance | What uses it |
|---|---|---|
| R2 storage | 10 GB total | Every uploaded file. Video fills this fastest — prefer YouTube (unlisted) embeds |
| Workers / Pages Functions | 100,000 requests/day, 10 ms CPU each | API calls (~2 per material opened). Static pages are free and unlimited |
| D1 | 5 M rows read, 100 k rows written per day, 5 GB | Metadata. Each view writes ~3 rows |
| Pages builds | 500/month | Only code deploys — uploading materials never triggers a build |

Daily limits reset at 00:00 UTC (6:00 AM in Bangladesh).

---

## Deploy (about 20 minutes)

You need a free Cloudflare account, Node.js 20+, and this folder.

```bash
npm install
npx wrangler login
```

### 1. Create the database and bucket

```bash
npx wrangler d1 create study-hub-db
```
Copy the `database_id` it prints into `wrangler.toml` (replace the zeros).

```bash
npx wrangler r2 bucket create study-hub-files
npm run db:migrate:remote
```

> Cloudflare may ask you to add a payment method before it enables R2. Usage inside the free allowance above is not charged.

### 2. Configure and deploy the site

`SUPER_ADMIN_EMAIL` in `wrangler.toml` is already `mahedi.pro@gmail.com`.

```bash
npx wrangler pages project create study-hub --production-branch main
openssl rand -hex 32   # run twice — one value for each secret below
npx wrangler pages secret put AUTH_SECRET --project-name study-hub
npx wrangler pages secret put SIGNING_KEY --project-name study-hub
npm run deploy
```

Your site is now at `https://study-hub.pages.dev` (or the name Cloudflare assigned).

> Never change `AUTH_SECRET` after people have set passwords — it is part of every password hash.

### 3. Turn on Google sign-in (free, recommended)

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → create a project → **APIs & Services → OAuth consent screen**: choose *External*, fill in the app name and your email, and publish it.
2. **Credentials → Create credentials → OAuth client ID → Web application.**
   - Authorized redirect URI: `https://study-hub.pages.dev/api/auth/google/callback` (use your real Pages address; add `http://localhost:8788/api/auth/google/callback` for local testing).
3. Put the **Client ID** in `GOOGLE_CLIENT_ID` in `wrangler.toml`, and the secret in Cloudflare:
   ```bash
   npx wrangler pages secret put GOOGLE_CLIENT_SECRET --project-name study-hub
   npm run deploy
   ```

### 4. Become the super admin

Open `/admin/login` and click **Continue with Google** using `mahedi.pro@gmail.com`. That's it — you're the super admin.

Prefer a password instead of Google? Set a one-off setup code, then use **নতুন অ্যাকাউন্ট খোলো** (create account) with `mahedi.pro@gmail.com` and enter the code when asked:
```bash
npx wrangler pages secret put SETUP_CODE --project-name study-hub
```

Then go to **Teachers → Invite teacher**, invite Munjiba with handle `munjiba`, and send her the link. Her page becomes the home page automatically.

### 5. Deploy the content worker (for HTML lessons)

```bash
npx wrangler secret put SIGNING_KEY --config content-worker/wrangler.toml   # same value as in step 2
npm run deploy:content
```

Put the printed URL (e.g. `https://study-hub-content.yourname.workers.dev`) in `CONTENT_ORIGIN` in `wrangler.toml`, then `npm run deploy` again. Without it, HTML lessons still work but run in a stricter sandbox on the main site (no `localStorage`).

### 6. Optional: direct uploads for big files (> 95 MB)

1. R2 → **Manage R2 API Tokens → Create** (Object Read & Write, this bucket only).
2. Set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` as Pages secrets (same command as above).
3. Edit `r2-cors.json` so `AllowedOrigins` has your real site URL, then:
   ```bash
   npx wrangler r2 bucket cors set study-hub-files --file r2-cors.json
   ```

### Deploy from GitHub instead

Push this folder to a GitHub repo, then in the Cloudflare dashboard: Workers & Pages → Create → Pages → Connect to Git. Build command `npm run build`, output directory `dist`. Bindings and variables come from `wrangler.toml`; secrets are set in the project's Settings → Variables and Secrets.

---

## Local development

```bash
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run build
npx wrangler pages dev dist --port 8788      # API + built site at http://localhost:8788
npm run dev                                  # optional: hot-reload UI at :5173, proxies /api to :8788
```

Open `http://localhost:8788/admin/login`, choose **নতুন অ্যাকাউন্ট খোলো**, register `mahedi.pro@gmail.com` and enter the `SETUP_CODE` from `.dev.vars` (`local-setup`). Invite yourself a test teacher from **Teachers**.

## Project layout

```
functions/api/[[route]].ts   Pages Functions entry → server/app.ts
server/                      Hono API: auth (sessions, passwords, Google), storage, routes (auth, materials, workspace, system, public)
shared/                      Types, theme presets, block definitions, file-type helpers
content-worker/              Separate Worker for HTML bundles
migrations/                  D1 schema
src/public/                  Student-facing pages, block renderers, viewers
src/admin/                   Teacher/admin workspace and page designer
```
