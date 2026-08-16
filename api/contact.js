import { readJson, requireRateLimit, supabase } from './_lib/platform.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  try {
    if (!await requireRateLimit(req, res, 'contact', { limit: 5, windowSeconds: 3600 })) return;
    const body = await readJson(req, 64_000);
    const email = String(body.email ?? '').trim().toLowerCase().slice(0, 320);
    const category = ['general', 'sales', 'support', 'privacy', 'security', 'billing'].includes(body.category) ? body.category : 'general';
    const subject = String(body.subject ?? '').trim().slice(0, 200);
    const message = String(body.message ?? '').trim().slice(0, 10_000);
    if (!email.includes('@') || !subject || message.length < 10) return res.status(400).json({ error: 'valid_email_subject_and_message_required' });
    await supabase('/rest/v1/contact_messages', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: { email, category, subject, message } });
    return res.status(202).json({ accepted: true, message: 'Your message was received.' });
  } catch (error) {
    return res.status(400).json({ error: 'contact_failed', message: error instanceof Error ? error.message : String(error) });
  }
}
