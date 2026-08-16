import { publicSupabase, readJson } from '../_lib/platform.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  try {
    const body = await readJson(req, 64_000);
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    const organizationName = String(body.organizationName ?? '').trim();
    if (!email || password.length < 10) return res.status(400).json({ error: 'email_and_password_required', minimumPasswordLength: 10 });
    const data = await publicSupabase('/auth/v1/signup', {
      method: 'POST',
      body: { email, password, data: organizationName ? { organization_name: organizationName } : {} },
    });
    return res.status(201).json({
      user: data.user ? { id: data.user.id, email: data.user.email } : null,
      session: data.access_token ? { accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: data.expires_in } : null,
      confirmationRequired: !data.access_token,
    });
  } catch (error) {
    return res.status(400).json({ error: 'registration_failed', message: error instanceof Error ? error.message : String(error) });
  }
}
