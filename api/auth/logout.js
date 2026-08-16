import { bearer, clearSessionCookies, publicSupabase } from '../_lib/platform.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const token = bearer(req);
  if (token && !token.startsWith('ms_live_')) {
    try { await publicSupabase('/auth/v1/logout', { method: 'POST', token }); } catch {}
  }
  clearSessionCookies(res);
  return res.status(204).end();
}
