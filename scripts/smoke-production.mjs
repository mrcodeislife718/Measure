const base = String(process.env.MEASURE_URL ?? '').replace(/\/$/, '');
if (!base) {
  console.error('Set MEASURE_URL, for example: MEASURE_URL=https://measure.example.com npm run smoke:prod');
  process.exit(2);
}

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, options);
  const text = await response.text();
  let body = text;
  try { body = text ? JSON.parse(text) : null; } catch {}
  if (!response.ok) throw new Error(`${path} returned ${response.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  return { status: response.status, body };
}

const checks = [];
checks.push(['health', await request('/api/health')]);
checks.push(['landing', await request('/')]);
checks.push(['dashboard', await request('/dashboard.html')]);
checks.push(['audit', await request('/audit.html')]);
checks.push(['public-demo', await request('/api/demo-compile', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ states: ['queued', 'approved'], action: 'approve', authority: 'job:approve' }),
})]);

for (const [name, result] of checks) console.log(`PASS ${name} ${result.status}`);

if (process.env.MEASURE_KEY) {
  const authHeaders = { Authorization: `Bearer ${process.env.MEASURE_KEY}`, 'Content-Type': 'application/json' };
  checks.push(['account', await request('/api/account', { headers: authHeaders })]);
  checks.push(['usage', await request('/api/usage', { headers: authHeaders })]);
  console.log('PASS authenticated account/usage');
} else {
  console.log('SKIP authenticated checks: MEASURE_KEY not set');
}

console.log(`Measure production smoke passed at ${base}`);
