# Tour Masters Apartments

Find a home. Rent it. Manage it. A web platform where tenants in Zambia find, rent and pay for homes, and landlords list, fill and manage them.

**Live site:** https://tour-masters-apartments.onrender.com (free hosting: it may take about 50 seconds to wake up, and it resets to the demo data on every deploy)

**More documentation:** [project report](docs/project-report.md) · [architecture and routes](docs/architecture.md) · [deployment](docs/deployment.md)

The site has four parts:

- **Landing page and listings** (public): a full-screen slideshow of apartment photos, each with a clickable name, a search bar (city, bedrooms, maximum rent in Kwacha, ZMW), the services on offer, and every apartment, vacant or occupied. Light and dark mode, a phone-friendly menu, and a short logo animation on the first visit.
- **Apartment pages** show the services as icon cards (Wi-Fi, solar backup, borehole, security and more), a photo gallery with captions and a full-screen viewer, a map of the neighbourhood with directions from the visitor's location, and a contact box for the landlord (Call, WhatsApp, email).
- **Tenant portal** lets a tenant connect to their apartment and landlord, report problems, suggest improvements, keep their details up to date and pay rent with Mobile Money (MTN MoMo, Airtel Money or Zamtel Kwacha).
- **Landlord dashboard** lets a landlord list apartments, upload photos (with captions, a cover photo and ordering), tick the services each apartment offers, approve applications, invite tenants, see each tenant's details, respond to problems and suggestions, and track rent payments.

Many landlords can use the site. Each one sees only their own apartments and tenants.

## Run it

Requires Node.js 22.5 or newer, because it uses the built-in `node:sqlite`.

```bash
npm install
npm run seed     # creates data/zambia_apartments.db with demo data (wipes existing data)
npm start        # http://localhost:3000
```

## Demo accounts

Every demo account uses the password `demo1234`. `npm run seed` creates **10 landlords** (33 homes, 19 rented) across 7 cities, with photos, services, addresses, tenants, households, payment history and issues.

| Landlord | Email | City |
| --- | --- | --- |
| Mwila Banda | mwila@landlord.test | Lusaka: 5 homes, a pending application, 2 without photos |
| Chanda Mulenga | chanda@landlord.test | Kitwe, Ndola, Livingstone |
| Chipo Sakala | chipo@landlord.test | Lusaka |
| Mulenga Chileshe | mulenga@landlord.test | Kitwe |
| Lweendo Hamoonga | lweendo@landlord.test | Livingstone |
| Thandiwe Ngoma | thandiwe@landlord.test | Ndola |
| Kalaba Musonda | kalaba@landlord.test | Kabwe |
| Nchimunya Mweemba | nchimunya@landlord.test | Lusaka |
| Mwansa Bwalya | mwansa@landlord.test | Chingola |
| Sibongile Lungu | sibongile@landlord.test | Chipata |

Tenants log in as `<first name>@tenant.test`, for example:

| Tenant | Email | Notes |
| --- | --- | --- |
| Natasha Phiri | natasha@tenant.test | Kabulonga (Mwila); paid up, open issues |
| Mutale Zulu | mutale@tenant.test | Chelstone (Mwila); this month's payment failed |
| Bupe Tembo | bupe@tenant.test | Kitwe (Chanda); household not given yet |
| Kondwani Mwale | kondwani@tenant.test | Not connected; applied for the Rhodes Park studio |
| Joseph Mwape | joseph@tenant.test | Itawa, Ndola (Thandiwe) |

The others are chilufya, lubinda, inonge, musonda, twaambo, kelvin, mirriam, grace, emmanuel, ruth, brian, esther, moses, precious and daniel (`@tenant.test`).

Invite code `LSK1-2026` connects a tenant to Mwila's Rhodes Park studio.

Demo photos are free [Unsplash](https://unsplash.com) photos (Unsplash licence), saved in `public/demo-photos/` (about 11.5 MB). Credits are in `public/demo-photos/CREDITS.md`.

## How tenants get connected

1. **Invite code.** On an apartment's page the landlord clicks *Create invite code* and gives the code to the tenant. The tenant enters it at sign-up or on *My home*.
2. **Application.** The tenant applies from a public listing, and the landlord approves it from the dashboard.

Either way the apartment becomes *occupied* and leaves the public listings. When the landlord ends the tenancy, the apartment is listed again, and its history is kept.

## Mobile Money payments (Flutterwave)

Paystack doesn't operate in Zambia, so payments go through [Flutterwave](https://flutterwave.com), which collects Zambian Mobile Money in ZMW.

Without configuration the app runs a **built-in simulator**. When a tenant clicks *Pay rent*, they see a mock Mobile Money prompt with Approve and Decline buttons, and no money moves.

To take payments through Flutterwave:

1. Create a Flutterwave account. In the dashboard, open **Settings → API Keys** and copy the **test Secret Key** (`FLWSECK_TEST-...-X`). Do not use the public key (`FLWPUBK...`).
2. Open `.env` in the project folder and paste it after `FLW_SECRET_KEY=`. If `.env` doesn't exist, copy `.env.example` to `.env` first.
3. Restart the app. The console prints `Flutterwave key accepted (test mode).` If it says the key was rejected, check for typos or extra spaces.
4. Tenants are now sent to Flutterwave's checkout, limited to Zambian Mobile Money. When they return, the app verifies the transaction with Flutterwave, including the currency and amount, before marking it paid. A payment still processing shows a **Check** button. Test mode shows a badge and charges nothing; use Flutterwave's test numbers from their docs.
5. Once the site is online:
   - set `PUBLIC_URL` in `.env`;
   - put any long random text in `FLW_SECRET_HASH`;
   - in the Flutterwave dashboard under **Settings → Webhooks**, set the URL to `https://your-domain/webhooks/flutterwave` and the secret hash to the same text.

   Payments are then confirmed even if the tenant closes the browser. Webhooks can't reach `localhost`, so locally the app relies on the return-page check.

Notes:

- **Networks:** Flutterwave's collection API documents MTN and Zamtel; its Zambia licence announcement also lists Airtel Money. Confirm Airtel is enabled on your account before relying on it.
- **Non-Zambian accounts:** Flutterwave says merchants registered outside Zambia must email them to enable Zambian Mobile Money.
- **Live mode:** switch to the live key (`FLWSECK-...-X`) only when you're ready to take real money; the app prints a warning at startup when one is in use. `.env` is in `.gitignore`, so keys are never committed.

## Email alerts

The site emails people when something happens:

| Event | Who gets an email |
| --- | --- |
| Someone applies for an apartment | Landlord |
| A tenant connects with an invite code | Landlord |
| A tenant reports a problem or makes a suggestion | Landlord |
| The landlord replies to an issue or changes its status | Tenant |
| An application is approved or declined (or the apartment goes to someone else) | Applicant |
| Rent is paid | Landlord, plus a receipt to the tenant |

Each email has a button straight to the right page. Anyone can switch alerts off on their **Account** page, which also lists the last emails sent to them.

**Without a mail server** (the default), emails are not sent: each one is saved as an HTML file in `data/outbox/` so you can open it in a browser and see exactly what would go out.

**To send for real**, fill in the SMTP settings in `.env` (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`) and restart. The console prints whether the mail server accepted the connection. Also set `PUBLIC_URL` so the buttons in emails point at your live site. Demo addresses ending in `.test` are never emailed.

Every email, sent or not, is recorded in the `email_log` table with its status.

## Photos

Landlords upload photos on an apartment's **Photos** tab: JPG, PNG or WebP, up to 8 MB each and 30 per apartment. The first photo is the cover on the listings. Files are checked to be real images, saved under `data/uploads/` with random names, and served at `/uploads/...`. `npm run seed` clears them along with the demo data.

**Hosting note:** free hosts such as Render's free tier wipe the disk on every deploy or restart, so uploaded photos (and the SQLite database) would be lost. Use a persistent disk, or move photos to cloud storage such as Cloudinary or S3, before going live.

The landing-page slideshow uses the cover photos of up to six apartments, vacant ones first. If no apartment has a photo, it falls back to a free Unsplash photo saved as `public/demo-photos/hero-home-at-dusk.jpg` (Unsplash licence); set `HERO_IMAGE_URL` in `.env` to use your own, for example `HERO_IMAGE_URL=/static/hero.jpg`.

## Deployment

The live site runs on [Render](https://render.com) from `render.yaml`: one free Node web service that installs with `npm ci`, loads the demo data and starts the server. Render's GitHub app watches this repository, so every push to `main` redeploys the site in about a minute. Details and settings are in [docs/deployment.md](docs/deployment.md).

## Settings (`.env`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `FLW_SECRET_KEY` | unset (simulator) | Enables Mobile Money via Flutterwave |
| `FLW_SECRET_HASH` | unset | Verifies Flutterwave webhooks |
| `PUBLIC_URL` | Render's address, else the address in the browser | Flutterwave's return link and the links in emails |
| `SESSION_SECRET` | random on each start | Signs login cookies. Set it so logins survive restarts |
| `PORT` | `3000` | Web server port |
| `DB_PATH` | `data/zambia_apartments.db` | SQLite database file |
| `UPLOAD_DIR` | `data/uploads` | Where uploaded photos are stored |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | unset (save to `data/outbox`) | Mail server for email alerts |
| `HERO_IMAGE_URL` | `/static/demo-photos/hero-home-at-dusk.jpg` | Landing-page background image |

## Before going live

The live site is a demo. Before real tenants use it:

- Set `cookie.secure` (Render already serves the site over HTTPS).
- Use a persistent session store (sessions are currently kept in memory).
- Connect a mail server (see Email alerts) and add password reset; consider SMS alerts too.
- Use Flutterwave live keys and set up the webhook.
- Store photos and the database somewhere persistent (see the hosting note above).

## Project layout

```
src/server.js          app setup, sessions, CSRF protection
src/db.js              SQLite schema
src/payments.js        Flutterwave + simulator
src/services.js        services catalogue and icons
src/uploads.js         photo upload handling
src/mailer.js          sending email (SMTP or data/outbox)
src/notify.js          the email for each event
src/routes/            public, auth, account, tenant, landlord, pay, webhooks
src/seed.js            demo data (npm run seed)
views/                 EJS templates (partials/ holds the header, footer, logo, slideshow)
public/style.css       styling, light and dark themes
public/logo.svg        TM monogram (also the browser tab icon)
render.yaml            Render deployment blueprint
docs/                  project report, architecture, deployment
```

`promo/` (the promo video and its source) is kept out of git because of its size.
