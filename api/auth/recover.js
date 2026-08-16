import { publicSupabase, readJson, requireRateLimit, required } from '../_lib/platform.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  try {
    if (!await requireRateLimit(req, res, 'auth.recover', { limit: 5, windowSeconds: 900 })) return;
    const body = await readJson(req, 32_000);
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'email_required' });
    await publicSupabase('/auth/v1/recover', {
      method: 'POST',
      body: { email, redirect_to: `${required('MEASURE_PUBLIC_URL').replace(/\/$/, '')}/dashboard.html?recovery=1` },
    });
    return res.status(202).json({ accepted: true, message: 'If the account exists, a recovery email will be sent.' });
  } catch {
    return res.status(202).json({ accepted: true, message: 'If the account exists, a recovery email will be sent.' });
  }
}
