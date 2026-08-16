import { meter, readJson, requirePrincipal, supabase } from './_lib/platform.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  try {
    const principal = await requirePrincipal(req, res);
    if (!principal) return;
    const orgRows = await supabase(`/rest/v1/organizations?id=eq.${principal.organizationId}&select=plan,entitlement,subscription_status&limit=1`);
    const organization = orgRows?.[0];
    if (!organization || !['private', 'enterprise'].includes(organization.plan) || !['active', 'trialing'].includes(organization.subscription_status)) {
      return res.status(403).json({ error: 'private_runner_entitlement_required' });
    }

    const body = await readJson(req, 20_000_000);
    const mod = await import('../dist/src/index.js');
    if (!mod.verifyPrivateRunnerPackage(body)) return res.status(400).json({ error: 'invalid_private_runner_package' });

    const statusCounts = body.report?.statusCounts ?? {};
    const status = Number(statusCounts.invalid ?? 0) > 0 ? 'invalid'
      : Number(statusCounts.inconclusive ?? 0) > 0 ? 'inconclusive'
      : Number(statusCounts.qualified ?? 0) > 0 ? 'qualified'
      : 'verified';

    const rows = await supabase('/rest/v1/evaluations', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: {
        organization_id: principal.organizationId,
        participant_id: String(body.report?.results?.[0]?.participantId ?? 'private-runner'),
        status,
        request: { privateRunner: true, jobId: body.jobId, domain: body.domain, runtime: body.runtime },
        result: body,
        evidence_root: body.digest,
        completed_at: new Date().toISOString(),
      },
    });
    const units = Number(body.scenarioCount ?? 0) * 10;
    await meter(principal.organizationId, 'private_runner_units', units, { jobId: body.jobId, evaluationId: rows?.[0]?.id });
    return res.status(201).json({ accepted: true, evaluationId: rows?.[0]?.id, status, usageUnits: units, evidenceRoot: body.digest });
  } catch (error) {
    return res.status(400).json({ error: 'private_result_ingest_failed', message: error instanceof Error ? error.message : String(error) });
  }
}
