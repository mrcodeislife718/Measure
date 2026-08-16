import { publicSupabase, readJson, requireRateLimit, setSessionCookies } from '../_lib/platform.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  try {
    if (!await requireRateLimit(req, res, 'auth.register', { limit: 5, windowSeconds: 600 })) return;
    const body = await readJson(req, 64_000);
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    const organizationName = String(body.organizationName ?? '').trim().slice(0, 120);
    const inviteToken = String(body.inviteToken ?? '').trim();
    if (!email || password.length < 10) return res.status(400).json({ error: 'email_and_password_required', minimumPasswordLength: 10 });
    const metadata = {};
    if (organizationName) metadata.organization_name = organizationName;
    if (inviteToken) metadata.invite_token = inviteToken;
    const data = await publicSupabase('/auth/v1/signup', { method: 'POST', body: { email, password, data: metadata } });
    if (data.access_token) setSessionCookies(res, data);
    return res.status(201).json({
      user: data.user ? { id: data.user.id, email: data.user.email } : null,
      authenticated: Boolean(data.access_token),
      confirmationRequired: !data.access_token,
    });
  } catch (error) {
    return res.status(400).json({ error: 'registration_failed', message: error instanceof Error ? error.message : String(error) });
  }
}
