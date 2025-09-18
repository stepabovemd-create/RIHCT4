
# Relax Inn – Portal (Test Bundle)

This is a minimal Next.js project with:
- `/` – simple landing with CTA
- `/apply` – test-mode intake page (no real payments yet)
- `/api/stripe/webhook` – Stripe webhook endpoint (verifies signature + logs events)

## Quick start (local)

```bash
npm i
cp .env.example .env.local
# paste your TEST keys + price IDs in .env.local
npm run dev
```
Open http://localhost:3000 and http://localhost:3000/apply

### Stripe CLI (optional) to test webhooks locally
```bash
stripe login
stripe listen --forward-to http://localhost:3000/api/stripe/webhook
# set STRIPE_WEBHOOK_SECRET from the CLI output
stripe trigger invoice.payment_succeeded
```

## Deploy on Vercel (to get a preview URL)
1. Create a GitHub repo and upload these files.
2. In Vercel, **New Project** → Import the GitHub repo.
3. Add environment variables from `.env.example` (use TEST keys).
4. Deploy. Your preview URL will look like:
   `https://<project-name>-<hash>.vercel.app`

Your webhook endpoint will be:
```
https://<project-name>-<hash>.vercel.app/api/stripe/webhook
```

Once verified with Stripe for live mode, create live Prices and swap to live keys in Vercel.
