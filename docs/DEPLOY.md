# Measure production deployment runbook

This runbook is the shortest path from a fresh Linux ThinkPad terminal to a live Vercel deployment.

## 1. Clone and verify

```bash
cd ~
git clone https://github.com/mrcodeislife718/Measure.git
cd Measure
node -v
npm -v
npm install
npm run check
npm run demo
```

Measure requires Node 22 or newer. Node 24 is supported by CI.

## 2. Create the Vercel project

```bash
npx vercel login
npx vercel
```

When prompted, use the current directory, create a new project named `measure`, and keep the detected project settings. The repository already includes `vercel.json`.

After the first link, Vercel writes `.vercel/project.json` locally.

## 3. Configure production secrets

Generate a production API key locally:

```bash
openssl rand -hex 32
```

Copy the value, then add it to Vercel:

```bash
npx vercel env add MEASURE_API_KEY production
npx vercel env add MEASURE_API_KEY preview
npx vercel env add MEASURE_CONTACT_URL production
```

`MEASURE_API_KEY` protects the commercial compile and evaluate endpoints. The health endpoint remains public.

When real payment/contact destinations exist, configure them without changing code:

```bash
npx vercel env add MEASURE_PILOT_CHECKOUT_URL production
npx vercel env add MEASURE_TEAM_CHECKOUT_URL production
npx vercel env add MEASURE_ENTERPRISE_CONTACT_URL production
```

Do not commit secret values or payment-provider private keys.

## 4. Deploy production

```bash
npm run deploy:prod
```

Record the production URL returned by Vercel.

## 5. Smoke test

Replace `https://YOUR-DOMAIN.vercel.app` and `YOUR_MEASURE_API_KEY` below.

```bash
export MEASURE_URL='https://YOUR-DOMAIN.vercel.app'
export MEASURE_KEY='YOUR_MEASURE_API_KEY'

curl -fsS "$MEASURE_URL/api/health"

curl -fsS -X POST "$MEASURE_URL/api/compile" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MEASURE_KEY" \
  -d '{
    "kind":"workflow",
    "source":{
      "id":"sales-order",
      "states":["new","approved","fulfilled"],
      "transitions":[
        {"from":"new","to":"approved","action":"approve","authority":"order:approve"},
        {"from":"approved","to":"fulfilled","action":"fulfill","authority":"order:fulfill"}
      ]
    }
  }'

curl -fsS -X POST "$MEASURE_URL/api/evaluate" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MEASURE_KEY" \
  -d '{
    "participantId":"launch-smoke-test",
    "world":{
      "warehouseA":600,
      "warehouseB":700,
      "customerDemand":1000,
      "reservedTomorrow":300,
      "transferPermission":true,
      "transferFailureRate":0,
      "seed":1
    }
  }'
```

A deployment is not considered ready until health, compile, and evaluate all return successful responses.

## 6. Revenue activation

The public site routes commercial calls to `/api/checkout?plan=...`. The checkout endpoint reads URLs from environment variables, so payment-provider links can be swapped without redeploying application code.

Start with three offers:

- Pilot: paid one-system evaluation and trust report.
- Team: recurring evaluation capacity for a product/team.
- Enterprise: private deployment, custom worlds, production calibration, and support.

Do not claim the 30x advantage until Measure records the denominator: comparable human authoring/review hours and trustworthy evidence produced.

## 7. Routine release

```bash
cd ~/Measure
git pull --ff-only
npm install
npm run check
npm run deploy:prod
```

If CI or local checks fail, do not deploy.
