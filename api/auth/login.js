import { publicSupabase, readJson } from '../_lib/platform.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  try {
    const body = await readJson(req, 64_000);
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    if (!email || !password) return res.status(400).json({ error: 'email_and_password_required' });
    const data = await publicSupabase('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
    return res.status(200).json({
      user: data.user ? { id: data.user.id, email: data.user.email } : null,
      session: { accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: data.expires_in },
    });
  } catch (error) {
    return res.status(401).json({ error: 'login_failed', message: error instanceof Error ? error.message : String(error) });
  }
}
