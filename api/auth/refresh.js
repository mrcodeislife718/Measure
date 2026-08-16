import { publicSupabase, refreshToken, requireRateLimit, setSessionCookies } from '../_lib/platform.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  try {
    if (!await requireRateLimit(req, res, 'auth.refresh', { limit: 30, windowSeconds: 300 })) return;
    const token = refreshToken(req);
    if (!token) return res.status(401).json({ error: 'refresh_token_missing' });
    const data = await publicSupabase('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: token } });
    setSessionCookies(res, data);
    return res.status(200).json({ authenticated: true, expiresIn: data.expires_in });
  } catch (error) {
    return res.status(401).json({ error: 'refresh_failed', message: error instanceof Error ? error.message : String(error) });
  }
}
