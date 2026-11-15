# Zambia Apartments

A website with three parts:

- **Landing page and listings** (public): a photo hero, the services on offer, live availability, and every available apartment, searchable by area, city, bedrooms and rent in Kwacha (ZMW). Light and dark mode, and a phone-friendly menu.
- **Apartment pages** show the services as icon cards (Wi-Fi, solar backup, borehole, security and more) and a photo gallery with captions and a full-screen viewer.
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

Every demo account uses the password `demo1234`.

| Role | Email | What you'll see |
| --- | --- | --- |
| Landlord | mwila@landlord.test | 5 apartments in Lusaka, 2 tenants, a pending application |
| Landlord | chanda@landlord.test | 4 apartments in Kitwe, Ndola and Livingstone, 1 tenant |
| Tenant | natasha@tenant.test | Lives in Kabulonga; paid up, with open issues |
| Tenant | mutale@tenant.test | Lives in Chelstone; this month's payment failed, urgent water issue |
| Tenant | bupe@tenant.test | Lives in Parklands, Kitwe |
| Tenant | kondwani@tenant.test | Not connected yet; has applied for the Rhodes Park studio |

Invite code `LSK1-2026` connects a tenant to Mwila's Rhodes Park studio.

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

## Photos

Landlords upload photos on an apartment's **Photos** tab: JPG, PNG or WebP, up to 8 MB each and 30 per apartment. The first photo is the cover on the listings. Files are checked to be real images, saved under `data/uploads/` with random names, and served at `/uploads/...`. `npm run seed` clears them along with the demo data.

**Hosting note:** free hosts such as Render's free tier wipe the disk on every deploy or restart, so uploaded photos (and the SQLite database) would be lost. Use a persistent disk, or move photos to cloud storage such as Cloudinary or S3, before going live.

The landing-page background is a free photo from [Unsplash](https://unsplash.com) (photo `photo-1494526585095-c41746248156`, Unsplash licence). To use your own, set `HERO_IMAGE_URL` in `.env`, for example to a photo you put in `public/`: `HERO_IMAGE_URL=/static/hero.jpg`.

## Settings (`.env`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `FLW_SECRET_KEY` | unset (simulator) | Enables Mobile Money via Flutterwave |
| `FLW_SECRET_HASH` | unset | Verifies Flutterwave webhooks |
| `PUBLIC_URL` | the address in the browser | Flutterwave's return link, needed when deployed |
| `SESSION_SECRET` | random on each start | Signs login cookies. Set it so logins survive restarts |
| `PORT` | `3000` | Web server port |
| `DB_PATH` | `data/zambia_apartments.db` | SQLite database file |
| `UPLOAD_DIR` | `data/uploads` | Where uploaded photos are stored |
| `HERO_IMAGE_URL` | Unsplash photo | Landing-page background image |

## Before going live

This is a working local demo. Before real tenants use it:

- Serve it over HTTPS and set `cookie.secure`.
- Use a persistent session store (sessions are currently kept in memory).
- Add password reset and SMS notifications, for example for new issues or rent reminders.
- Use Flutterwave live keys and set up the webhook.
- Store photos and the database somewhere persistent (see the hosting note above).

## Project layout

```
src/server.js          app setup, sessions, CSRF protection
src/db.js              SQLite schema
src/payments.js        Flutterwave + simulator
src/services.js        services catalogue and icons
src/uploads.js         photo upload handling
src/routes/            public, auth, tenant, landlord, pay, webhooks
views/                 EJS templates
public/style.css       styling
```
