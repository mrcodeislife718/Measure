import { createHash, randomBytes } from 'node:crypto';
import { readJson, requirePrincipal, required, supabase } from './_lib/platform.js';

export default async function handler(req, res) {
  try {
    const principal = await requirePrincipal(req, res);
    if (!principal) return;
    if (principal.type !== 'user') return res.status(403).json({ error: 'user_session_required' });

    if (req.method === 'GET') {
      const members = await supabase(`/rest/v1/organization_members?organization_id=eq.${principal.organizationId}&select=user_id,role,created_at`);
      const invites = await supabase(`/rest/v1/organization_invites?organization_id=eq.${principal.organizationId}&accepted_at=is.null&select=id,email,role,expires_at,created_at&order=created_at.desc`);
      return res.status(200).json({ members, invites });
    }

    if (req.method === 'POST') {
      if (!['owner', 'admin'].includes(principal.role)) return res.status(403).json({ error: 'admin_role_required' });
      const body = await readJson(req, 32_000);
      const email = String(body.email ?? '').trim().toLowerCase();
      const role = ['admin', 'member', 'viewer'].includes(body.role) ? body.role : 'member';
      if (!email || !email.includes('@')) return res.status(400).json({ error: 'valid_email_required' });
      const token = randomBytes(30).toString('base64url');
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const rows = await supabase('/rest/v1/organization_invites', {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: { organization_id: principal.organizationId, email, role, token_hash: tokenHash, invited_by: principal.user.id },
      });
      const invite = rows?.[0];
      const url = `${required('MEASURE_PUBLIC_URL').replace(/\/$/, '')}/dashboard.html?invite=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
      return res.status(201).json({ invite: { id: invite?.id, email, role, expiresAt: invite?.expires_at, url }, warning: 'Invite token is only returned now. Share this URL securely.' });
    }

    if (req.method === 'DELETE') {
      if (!['owner', 'admin'].includes(principal.role)) return res.status(403).json({ error: 'admin_role_required' });
      const id = String(req.query?.inviteId ?? '');
      if (!id) return res.status(400).json({ error: 'inviteId_required' });
      await supabase(`/rest/v1/organization_invites?id=eq.${encodeURIComponent(id)}&organization_id=eq.${principal.organizationId}`, { method: 'DELETE' });
      return res.status(204).end();
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (error) {
    return res.status(400).json({ error: 'team_failed', message: error instanceof Error ? error.message : String(error) });
  }
}
