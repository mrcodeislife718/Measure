# Measure — complete ThinkPad production launch runbook

This is the canonical path from a Linux ThinkPad to a tested, paid production launch. Do the sandbox/test steps first. Do not put secret keys in Git, screenshots, shell scripts committed to the repo, or chat messages.

## 0. What will be live

Launch offers:

- Founding Trust Audit — **$5,000 one time**, capped in code at the first five paid/reserved engagements.
- Measure Pro — **$249/month**.
- Measure Team — **$749/month**.
- Measure Scale — **$2,500/month**.
- Measure Private / Enterprise — contact-led; Private starts around $5k/month and Enterprise around $75k/year, finalized by scope.

Core production stack:

- GitHub — source and CI.
- Vercel — public site and API functions.
- Supabase — authentication, organizations, API keys, usage, evaluation history, billing state, proof metrics, contact inbox.
- Stripe — Checkout, subscriptions, one-time Trust Audits, webhooks, Billing Portal.
- Measure private runner — optional customer-controlled evaluation execution.

## 1. Prepare the ThinkPad

```bash
sudo apt update
sudo apt install -y git curl jq openssl ca-certificates

cd ~
if [ ! -d Measure/.git ]; then
  git clone https://github.com/mrcodeislife718/Measure.git
fi
cd Measure
git pull --ff-only
```

Check Node:

```bash
node -v || true
npm -v || true
```

If Node is below 22, install Node 24 through nvm:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm install 24
nvm use 24
nvm alias default 24
node -v
npm -v
```

Install and verify the project:

```bash
cd ~/Measure
npm install
npm run check
npm run demo
```

Do not continue if `npm run check` fails.

## 2. Install deployment CLIs

Vercel:

```bash
npm install -g vercel
vercel --version
vercel login
```

Stripe CLI:

```bash
npm install -g @stripe/cli
stripe version
stripe login
```

Supabase can run without a global installation:

```bash
npx supabase --version
npx supabase login
```

## 3. Create a dedicated Supabase project

Create a new Supabase project named `Measure` in the Supabase dashboard. Do not reuse an unrelated production database.

Record privately:

- project ref
- database password
- Project URL
- publishable key
- service-role/secret key

Then link this repository:

```bash
cd ~/Measure
npx supabase link --project-ref YOUR_PROJECT_REF
```

Preview migrations:

```bash
npx supabase db push --dry-run
```

Apply them:

```bash
npx supabase db push
```

Never use `supabase db reset --linked` against production.

In Supabase Dashboard → Authentication → URL Configuration, set the Site URL to the final Vercel/custom-domain URL after Vercel is linked. Add the production dashboard URL and any preview URL you intentionally use for auth testing to allowed Redirect URLs.

## 4. Link Measure to Vercel

```bash
cd ~/Measure
vercel link
```

Choose your Vercel account/team, create a project named `measure` if one does not exist, and use the current directory. Verify:

```bash
cat .vercel/project.json
```

Create a preview deployment once so Vercel gives you a URL:

```bash
vercel deploy
```

Copy the preview URL. For final production, `MEASURE_PUBLIC_URL` must be the production/custom-domain URL, not the preview URL.

## 5. Add Supabase secrets to Vercel

Use `--sensitive` for secrets. Vercel will prompt you to paste each value without putting it in source code.

Production:

```bash
vercel env add SUPABASE_URL production
vercel env add SUPABASE_PUBLISHABLE_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production --sensitive
```

Preview:

```bash
vercel env add SUPABASE_URL preview
vercel env add SUPABASE_PUBLISHABLE_KEY preview
vercel env add SUPABASE_SERVICE_ROLE_KEY preview --sensitive
```

Generate a cron secret and bootstrap internal key:

```bash
openssl rand -hex 32 > ~/.measure-cron-secret
openssl rand -hex 32 > ~/.measure-bootstrap-key
chmod 600 ~/.measure-cron-secret ~/.measure-bootstrap-key
```

Add the cron secret:

```bash
vercel env add CRON_SECRET production --sensitive < ~/.measure-cron-secret
```

Do not configure `MEASURE_INTERNAL_ORG_ID` yet; customer API keys and secure web sessions are the normal production authentication path.

## 6. Stripe sandbox — build the exact catalog before touching live money

Stripe CLI commands operate in a sandbox by default after login unless you explicitly request live mode.

Create sandbox products and capture the IDs:

```bash
TEST_PROD_PRO=$(stripe products create --name='Measure Pro' --description='Architecture-neutral private evaluation for serious builders' | jq -r .id)
TEST_PROD_TEAM=$(stripe products create --name='Measure Team' --description='Continuous operational trust evaluation for AI teams' | jq -r .id)
TEST_PROD_SCALE=$(stripe products create --name='Measure Scale' --description='Production-scale continuous evaluation and reality calibration' | jq -r .id)
TEST_PROD_PRIVATE=$(stripe products create --name='Measure Private' --description='Customer-controlled private evaluation infrastructure' | jq -r .id)
TEST_PROD_AUDIT=$(stripe products create --name='Measure Founding Trust Audit' --description='One-time founding operational trust audit' | jq -r .id)

printf 'Sandbox products:\n%s\n%s\n%s\n%s\n%s\n' "$TEST_PROD_PRO" "$TEST_PROD_TEAM" "$TEST_PROD_SCALE" "$TEST_PROD_PRIVATE" "$TEST_PROD_AUDIT"
```

Create sandbox prices:

```bash
TEST_PRICE_PRO=$(stripe prices create --currency=usd --unit-amount=24900 --product="$TEST_PROD_PRO" -d 'recurring[interval]'=month | jq -r .id)
TEST_PRICE_TEAM=$(stripe prices create --currency=usd --unit-amount=74900 --product="$TEST_PROD_TEAM" -d 'recurring[interval]'=month | jq -r .id)
TEST_PRICE_SCALE=$(stripe prices create --currency=usd --unit-amount=250000 --product="$TEST_PROD_SCALE" -d 'recurring[interval]'=month | jq -r .id)
TEST_PRICE_PRIVATE=$(stripe prices create --currency=usd --unit-amount=500000 --product="$TEST_PROD_PRIVATE" -d 'recurring[interval]'=month | jq -r .id)
TEST_PRICE_AUDIT=$(stripe prices create --currency=usd --unit-amount=500000 --product="$TEST_PROD_AUDIT" | jq -r .id)

printf 'Sandbox prices:\nPRO=%s\nTEAM=%s\nSCALE=%s\nPRIVATE=%s\nAUDIT=%s\n' "$TEST_PRICE_PRO" "$TEST_PRICE_TEAM" "$TEST_PRICE_SCALE" "$TEST_PRICE_PRIVATE" "$TEST_PRICE_AUDIT"
```

Store those IDs locally for this terminal session:

```bash
cat > ~/.measure-stripe-test-prices <<EOF
export STRIPE_PRICE_PRO='$TEST_PRICE_PRO'
export STRIPE_PRICE_TEAM='$TEST_PRICE_TEAM'
export STRIPE_PRICE_SCALE='$TEST_PRICE_SCALE'
export STRIPE_PRICE_PRIVATE='$TEST_PRICE_PRIVATE'
export STRIPE_PRICE_TRUST_AUDIT='$TEST_PRICE_AUDIT'
EOF
chmod 600 ~/.measure-stripe-test-prices
```

Get the Stripe **sandbox secret key** (`sk_test_...`) from Stripe Dashboard → Developers → API keys. Read it without putting it into shell history:

```bash
read -rsp 'Paste Stripe sandbox secret key: ' STRIPE_TEST_SECRET; echo
export STRIPE_TEST_SECRET
```

## 7. Configure Stripe sandbox on Vercel preview

```bash
source ~/.measure-stripe-test-prices
printf '%s' "$STRIPE_TEST_SECRET" | vercel env add STRIPE_SECRET_KEY preview --sensitive
printf '%s' "$STRIPE_PRICE_PRO" | vercel env add STRIPE_PRICE_PRO preview
printf '%s' "$STRIPE_PRICE_TEAM" | vercel env add STRIPE_PRICE_TEAM preview
printf '%s' "$STRIPE_PRICE_SCALE" | vercel env add STRIPE_PRICE_SCALE preview
printf '%s' "$STRIPE_PRICE_PRIVATE" | vercel env add STRIPE_PRICE_PRIVATE preview
printf '%s' "$STRIPE_PRICE_TRUST_AUDIT" | vercel env add STRIPE_PRICE_TRUST_AUDIT preview
```

Also set preview public URL to the current preview deployment URL:

```bash
vercel env add MEASURE_PUBLIC_URL preview
```

For local webhook testing, terminal A:

```bash
cd ~/Measure
vercel dev
```

Terminal B:

```bash
stripe listen \
  --events checkout.session.completed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,invoice.paid,invoice.payment_failed \
  --forward-to localhost:3000/api/webhooks/stripe
```

Stripe prints a temporary `whsec_...` signing secret. In a third terminal:

```bash
cd ~/Measure
vercel env pull .env.local
```

Add the temporary webhook secret to `.env.local` as `STRIPE_WEBHOOK_SECRET=whsec_...`, then restart `vercel dev`.

## 8. Test the whole sandbox purchase loop

Open:

```text
http://localhost:3000/dashboard.html
```

Create an account, confirm the email if your Supabase Auth project requires confirmation, sign in, select Pro, Team, or Scale, and complete Stripe Checkout with Stripe's sandbox card `4242 4242 4242 4242`, any future expiry, any CVC, and any postal code.

Verify:

1. Stripe CLI receives `checkout.session.completed` and subscription events.
2. `/api/account` changes from trial/inactive to the purchased plan/active.
3. Dashboard shows the plan.
4. Creating an API key returns an `ms_live_...` key once.
5. `/api/evaluate` works with that API key and records usage/evaluation history.
6. Billing Portal opens and lets the sandbox customer manage billing.

The Trust Audit checkout must be tested separately from `/audit.html` and should create a `trust_audits` record that becomes `paid` after the webhook.

## 9. Configure Stripe Billing Portal in sandbox

In Stripe Dashboard sandbox mode, open Billing → Customer portal. Enable:

- payment-method updates
- invoice history
- subscription cancellation at period end
- customer email/address updates as appropriate

Set Measure's privacy and terms URLs after the preview/production URLs exist.

## 10. Deploy and test preview

```bash
cd ~/Measure
git pull --ff-only
npm install
npm run check
vercel deploy
```

Set:

```bash
export MEASURE_URL='https://YOUR-PREVIEW-URL.vercel.app'
npm run smoke:prod
```

Inspect runtime errors:

```bash
vercel logs --environment preview --level error --since 30m
```

Do not switch to Stripe live mode until the sandbox loop works end to end.

## 11. Activate Stripe for live payments

Complete Stripe account activation in the Dashboard first: business/identity details, bank payout destination, statement descriptor, support details, and any tax settings appropriate to the business. Stripe determines live/test mode from the API key/mode.

After activation, confirm live CLI access:

```bash
stripe balance retrieve --live
```

Create the **live** catalog. The `--live` flag is deliberate:

```bash
LIVE_PROD_PRO=$(stripe products create --live --name='Measure Pro' --description='Architecture-neutral private evaluation for serious builders' | jq -r .id)
LIVE_PROD_TEAM=$(stripe products create --live --name='Measure Team' --description='Continuous operational trust evaluation for AI teams' | jq -r .id)
LIVE_PROD_SCALE=$(stripe products create --live --name='Measure Scale' --description='Production-scale continuous evaluation and reality calibration' | jq -r .id)
LIVE_PROD_PRIVATE=$(stripe products create --live --name='Measure Private' --description='Customer-controlled private evaluation infrastructure' | jq -r .id)
LIVE_PROD_AUDIT=$(stripe products create --live --name='Measure Founding Trust Audit' --description='One-time founding operational trust audit' | jq -r .id)

LIVE_PRICE_PRO=$(stripe prices create --live --currency=usd --unit-amount=24900 --product="$LIVE_PROD_PRO" -d 'recurring[interval]'=month | jq -r .id)
LIVE_PRICE_TEAM=$(stripe prices create --live --currency=usd --unit-amount=74900 --product="$LIVE_PROD_TEAM" -d 'recurring[interval]'=month | jq -r .id)
LIVE_PRICE_SCALE=$(stripe prices create --live --currency=usd --unit-amount=250000 --product="$LIVE_PROD_SCALE" -d 'recurring[interval]'=month | jq -r .id)
LIVE_PRICE_PRIVATE=$(stripe prices create --live --currency=usd --unit-amount=500000 --product="$LIVE_PROD_PRIVATE" -d 'recurring[interval]'=month | jq -r .id)
LIVE_PRICE_AUDIT=$(stripe prices create --live --currency=usd --unit-amount=500000 --product="$LIVE_PROD_AUDIT" | jq -r .id)

printf 'LIVE PRICES — SAVE SECURELY\nPRO=%s\nTEAM=%s\nSCALE=%s\nPRIVATE=%s\nAUDIT=%s\n' "$LIVE_PRICE_PRO" "$LIVE_PRICE_TEAM" "$LIVE_PRICE_SCALE" "$LIVE_PRICE_PRIVATE" "$LIVE_PRICE_AUDIT"
```

## 12. Add live Stripe configuration to Vercel production

Get the live `sk_live_...` key from Stripe Dashboard. Read it without shell history:

```bash
read -rsp 'Paste Stripe LIVE secret key: ' STRIPE_LIVE_SECRET; echo
export STRIPE_LIVE_SECRET
```

Add production variables:

```bash
printf '%s' "$STRIPE_LIVE_SECRET" | vercel env add STRIPE_SECRET_KEY production --sensitive
printf '%s' "$LIVE_PRICE_PRO" | vercel env add STRIPE_PRICE_PRO production
printf '%s' "$LIVE_PRICE_TEAM" | vercel env add STRIPE_PRICE_TEAM production
printf '%s' "$LIVE_PRICE_SCALE" | vercel env add STRIPE_PRICE_SCALE production
printf '%s' "$LIVE_PRICE_PRIVATE" | vercel env add STRIPE_PRICE_PRIVATE production
printf '%s' "$LIVE_PRICE_AUDIT" | vercel env add STRIPE_PRICE_TRUST_AUDIT production
vercel env add MEASURE_PUBLIC_URL production
vercel env add MEASURE_ENTERPRISE_CONTACT_URL production
```

Set `MEASURE_PUBLIC_URL` to the exact production/custom-domain origin, for example `https://measure.example.com` with no trailing path.

## 13. Create the live Stripe webhook endpoint

After the production URL is known:

```bash
export MEASURE_URL='https://YOUR-PRODUCTION-DOMAIN'

LIVE_WEBHOOK=$(stripe webhook_endpoints create --live \
  --url="$MEASURE_URL/api/webhooks/stripe" \
  -d 'enabled_events[0]'=checkout.session.completed \
  -d 'enabled_events[1]'=customer.subscription.created \
  -d 'enabled_events[2]'=customer.subscription.updated \
  -d 'enabled_events[3]'=customer.subscription.deleted \
  -d 'enabled_events[4]'=invoice.paid \
  -d 'enabled_events[5]'=invoice.payment_failed)

LIVE_WEBHOOK_SECRET=$(printf '%s' "$LIVE_WEBHOOK" | jq -r .secret)
[ -n "$LIVE_WEBHOOK_SECRET" ] && [ "$LIVE_WEBHOOK_SECRET" != null ] || { echo 'Webhook secret missing'; exit 1; }
printf '%s' "$LIVE_WEBHOOK_SECRET" | vercel env add STRIPE_WEBHOOK_SECRET production --sensitive
unset LIVE_WEBHOOK_SECRET LIVE_WEBHOOK STRIPE_LIVE_SECRET
```

A webhook signing secret is separate from the Stripe API key.

## 14. Final production deployment

```bash
cd ~/Measure
git pull --ff-only
npm install
npm run check
vercel deploy --prod
```

Then:

```bash
export MEASURE_URL='https://YOUR-PRODUCTION-DOMAIN'
npm run smoke:prod
```

Check errors:

```bash
vercel logs --environment production --level error --since 30m
```

## 15. Production purchase verification

Do not simulate a real payment by exposing keys or bypassing Checkout. Use the public UI exactly as a customer would.

Verify in this order:

1. `/api/health` returns healthy.
2. `/api/demo-compile` works but remains capped and rate-limited.
3. Registration/login works and cookies are HttpOnly/Secure in production.
4. Pro/Team/Scale Checkout opens in Stripe live mode.
5. Trust Audit opens a $5,000 live Checkout Session.
6. Stripe webhook shows successful deliveries.
7. Purchased organization receives the correct entitlement.
8. API key creation works.
9. Evaluation usage is metered and appears in the dashboard.
10. Cancellation/payment failure changes subscription state through webhooks.
11. Billing Portal works.
12. Contact/privacy/security pages work.

You can perform a legitimate small live purchase only if it fits your payment/account-testing practices; otherwise verify with an actual first customer purchase. Never create fake customer activity or misrepresent sandbox transactions as revenue.

## 16. Supabase Auth production URL configuration

After final production deployment, return to Supabase Dashboard → Authentication → URL Configuration:

- Site URL: exact production origin.
- Redirect URL: `https://YOUR-PRODUCTION-DOMAIN/dashboard.html*`

If password-recovery email redirects are not permitted there, recovery will not complete correctly.

## 17. Private runner

Build first:

```bash
cd ~/Measure
npm run build
```

Run a customer-controlled job:

```bash
npm run private-runner -- ./job.json ./result.json
```

Private/Enterprise customers can upload the resulting package to `/api/private-results` with an entitled Measure API key. The package digest is verified before ingestion.

## 18. Release discipline

Every production release:

```bash
cd ~/Measure
git pull --ff-only
npm install
npm run check
vercel deploy
# smoke-test preview
vercel deploy --prod
MEASURE_URL='https://YOUR-PRODUCTION-DOMAIN' npm run smoke:prod
vercel logs --environment production --level error --since 30m
```

If local checks, GitHub CI, preview testing, Stripe sandbox, or production smoke checks fail, do not call the release complete.

## 19. Revenue and proof discipline

Every founding Trust Audit must record:

- environment authoring minutes
- expert review minutes
- scenarios generated and independently validated
- failures discovered
- later false positives
- compute cost
- simulation/reality agreement when production evidence becomes available
- trustworthy evidence units
- customer outcome

The locked study in `docs/COMPETITIVE_PROOF.md` determines whether Measure earned a competitive multiplier. Never publish `30x` unless the measured primary-metric ratio is actually at least 30.00x.
