import { bearer, publicSupabase, readJson, requireRateLimit } from '../_lib/platform.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  try {
    if (!await requireRateLimit(req, res, 'auth.password', { limit: 5, windowSeconds: 900 })) return;
    const token = bearer(req);
    const body = await readJson(req, 32_000);
    const password = String(body.password ?? '');
    if (!token || password.length < 10) return res.status(400).json({ error: 'recovery_token_and_password_required', minimumPasswordLength: 10 });
    await publicSupabase('/auth/v1/user', { method: 'PUT', token, body: { password } });
    return res.status(204).end();
  } catch (error) {
    return res.status(400).json({ error: 'password_update_failed', message: error instanceof Error ? error.message : String(error) });
  }
}
