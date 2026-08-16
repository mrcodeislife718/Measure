import { issueApiKey, requirePrincipal, supabase } from './_lib/platform.js';

export default async function handler(req, res) {
  try {
    const principal = await requirePrincipal(req, res);
    if (!principal) return;
    if (principal.type !== 'user') return res.status(403).json({ error: 'user_session_required' });

    if (req.method === 'GET') {
      const rows = await supabase(`/rest/v1/api_keys?organization_id=eq.${principal.organizationId}&select=id,name,prefix,created_at,last_used_at,revoked_at&order=created_at.desc`);
      return res.status(200).json({ keys: rows });
    }

    if (req.method === 'POST') {
      const name = String(req.body?.name ?? 'Default').trim().slice(0, 80) || 'Default';
      const created = issueApiKey();
      const rows = await supabase('/rest/v1/api_keys', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: {
          organization_id: principal.organizationId,
          name,
          prefix: created.prefix,
          key_hash: created.hash,
          created_by: principal.user.id,
        },
      });
      return res.status(201).json({ key: created.key, record: Array.isArray(rows) ? rows[0] : rows, warning: 'This key is shown once. Store it securely.' });
    }

    if (req.method === 'DELETE') {
      const id = String(req.query?.id ?? '');
      if (!id) return res.status(400).json({ error: 'id_required' });
      await supabase(`/rest/v1/api_keys?id=eq.${encodeURIComponent(id)}&organization_id=eq.${principal.organizationId}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: { revoked_at: new Date().toISOString() },
      });
      return res.status(204).end();
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (error) {
    return res.status(500).json({ error: 'api_keys_failed', message: error instanceof Error ? error.message : String(error) });
  }
}
