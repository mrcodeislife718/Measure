import { createHash, randomBytes, createHmac, timingSafeEqual } from 'node:crypto';

export function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`missing required environment variable ${name}`);
  return value;
}

export async function readJson(req, maxBytes = 1_000_000) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) throw new Error('request_too_large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function readRaw(req, maxBytes = 2_000_000) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) throw new Error('request_too_large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function supabase(path, options = {}) {
  const url = `${required('SUPABASE_URL')}${path}`;
  const headers = {
    apikey: required('SUPABASE_SERVICE_ROLE_KEY'),
    Authorization: `Bearer ${required('SUPABASE_SERVICE_ROLE_KEY')}`,
    ...(options.headers ?? {}),
  };
  if (options.body !== undefined && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : typeof options.body === 'string' ? options.body : JSON.stringify(options.body),
  });
  const text = await response.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!response.ok) throw new Error(`supabase_${response.status}:${typeof data === 'string' ? data : JSON.stringify(data)}`);
  return data;
}

export async function publicSupabase(path, options = {}) {
  const key = required('SUPABASE_PUBLISHABLE_KEY');
  const response = await fetch(`${required('SUPABASE_URL')}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      apikey: key,
      Authorization: options.token ? `Bearer ${options.token}` : `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!response.ok) throw new Error(`supabase_auth_${response.status}:${typeof data === 'string' ? data : JSON.stringify(data)}`);
  return data;
}

export function bearer(req) {
  const value = String(req.headers.authorization ?? '');
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

export async function userFromToken(token) {
  if (!token) return null;
  try {
    return await publicSupabase('/auth/v1/user', { token });
  } catch {
    return null;
  }
}

export async function orgForUser(userId) {
  const rows = await supabase(`/rest/v1/organization_members?user_id=eq.${encodeURIComponent(userId)}&select=organization_id,role,organizations(*)&limit=1`);
  const row = Array.isArray(rows) ? rows[0] : undefined;
  if (!row) return null;
  return { id: row.organization_id, role: row.role, organization: row.organizations };
}

export function hashApiKey(key) {
  return createHash('sha256').update(key).digest('hex');
}

export function issueApiKey() {
  const secret = randomBytes(30).toString('base64url');
  const key = `ms_live_${secret}`;
  return { key, prefix: key.slice(0, 16), hash: hashApiKey(key) };
}

export async function principal(req) {
  const token = bearer(req);
  if (!token) return null;

  if (process.env.MEASURE_API_KEY && token === process.env.MEASURE_API_KEY && process.env.MEASURE_INTERNAL_ORG_ID) {
    return { type: 'internal', organizationId: process.env.MEASURE_INTERNAL_ORG_ID, name: 'Measure internal' };
  }

  if (token.startsWith('ms_live_')) {
    const hash = hashApiKey(token);
    const rows = await supabase(`/rest/v1/api_keys?key_hash=eq.${hash}&revoked_at=is.null&select=id,organization_id,name,prefix&limit=1`);
    const key = Array.isArray(rows) ? rows[0] : undefined;
    if (!key) return null;
    await supabase(`/rest/v1/api_keys?id=eq.${key.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: { last_used_at: new Date().toISOString() } });
    return { type: 'api_key', organizationId: key.organization_id, apiKeyId: key.id, name: key.name };
  }
  const user = await userFromToken(token);
  if (!user?.id) return null;
  const membership = await orgForUser(user.id);
  if (!membership) return null;
  return { type: 'user', user, organizationId: membership.id, role: membership.role, organization: membership.organization };
}

export async function requirePrincipal(req, res) {
  const p = await principal(req);
  if (!p) {
    res.status(401).json({ error: 'unauthorized' });
    return null;
  }
  return p;
}

export async function meter(organizationId, metric, quantity = 1, metadata = {}) {
  await supabase('/rest/v1/usage_events', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: { organization_id: organizationId, metric, quantity, metadata },
  });
}

export const PLAN_ENTITLEMENTS = {
  trial: { monthlyEvaluationUnits: 0, concurrency: 1, retentionDays: 7 },
  pro: { monthlyEvaluationUnits: 25_000, concurrency: 3, retentionDays: 30 },
  team: { monthlyEvaluationUnits: 150_000, concurrency: 10, retentionDays: 90 },
  scale: { monthlyEvaluationUnits: 1_000_000, concurrency: 50, retentionDays: 365 },
  private: { monthlyEvaluationUnits: 2_500_000, concurrency: 100, retentionDays: 730, privateRunner: true },
  enterprise: { monthlyEvaluationUnits: 10_000_000, concurrency: 500, retentionDays: 2555, privateRunner: true, sso: true },
};

export async function getOrganization(organizationId) {
  const rows = await supabase(`/rest/v1/organizations?id=eq.${organizationId}&select=*&limit=1`);
  return rows?.[0] ?? null;
}

export async function currentMonthlyUnits(organizationId) {
  const since = new Date();
  since.setUTCDate(1);
  since.setUTCHours(0, 0, 0, 0);
  const rows = await supabase(`/rest/v1/usage_events?organization_id=eq.${organizationId}&created_at=gte.${encodeURIComponent(since.toISOString())}&select=metric,quantity`);
  return rows.reduce((sum, row) => String(row.metric).includes('units') ? sum + Number(row.quantity ?? 0) : sum, 0);
}

export async function authorizeUsage(organizationId, requestedUnits = 1, requiredFeature) {
  const organization = await getOrganization(organizationId);
  if (!organization) return { allowed: false, reason: 'organization_not_found' };
  if (organization.plan === 'trial' || !['active', 'trialing'].includes(organization.subscription_status)) {
    return { allowed: false, reason: 'paid_plan_required', organization };
  }
  const entitlement = { ...(PLAN_ENTITLEMENTS[organization.plan] ?? PLAN_ENTITLEMENTS.trial), ...(organization.entitlement ?? {}) };
  if (requiredFeature && !entitlement[requiredFeature]) return { allowed: false, reason: 'feature_not_entitled', organization, entitlement };
  const used = await currentMonthlyUnits(organizationId);
  const limit = Number(entitlement.monthlyEvaluationUnits ?? 0);
  if (limit > 0 && used + requestedUnits > limit) return { allowed: false, reason: 'monthly_quota_exceeded', organization, entitlement, used, limit };
  return { allowed: true, organization, entitlement, used, limit, remaining: Math.max(0, limit - used) };
}

export async function stripeRequest(path, params = {}, method = 'POST') {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    body.set(key, String(value));
  }
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${required('STRIPE_SECRET_KEY')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: method === 'GET' ? undefined : body.toString(),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`stripe_${response.status}:${JSON.stringify(data)}`);
  return data;
}

export function verifyStripeSignature(rawBody, header) {
  const secret = required('STRIPE_WEBHOOK_SECRET');
  const fields = Object.fromEntries(String(header ?? '').split(',').map((part) => part.split('=', 2)));
  const timestamp = fields.t;
  const signatures = String(header ?? '').split(',').filter((part) => part.startsWith('v1=')).map((part) => part.slice(3));
  if (!timestamp || !signatures.length) return false;
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody.toString('utf8')}`).digest('hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  return signatures.some((signature) => {
    try {
      const candidate = Buffer.from(signature, 'hex');
      return candidate.length === expectedBuffer.length && timingSafeEqual(candidate, expectedBuffer);
    } catch {
      return false;
    }
  });
}
