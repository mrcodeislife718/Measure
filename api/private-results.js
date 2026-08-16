import { authorizeUsage, meter, readJson, requirePrincipal, supabase } from './_lib/platform.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  try {
    const principal = await requirePrincipal(req, res);
    if (!principal) return;
    const body = await readJson(req, 20_000_000);
    const requestedUnits = Math.max(1, Number(body.scenarioCount ?? 0) * 10);
    const quota = await authorizeUsage(principal.organizationId, requestedUnits, 'privateRunner');
    if (!quota.allowed) return res.status(quota.reason === 'monthly_quota_exceeded' ? 429 : 403).json({ error: quota.reason, used: quota.used, limit: quota.limit });

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
    await meter(principal.organizationId, 'private_runner_units', requestedUnits, { jobId: body.jobId, evaluationId: rows?.[0]?.id });
    return res.status(201).json({ accepted: true, evaluationId: rows?.[0]?.id, status, usageUnits: requestedUnits, evidenceRoot: body.digest });
  } catch (error) {
    return res.status(400).json({ error: 'private_result_ingest_failed', message: error instanceof Error ? error.message : String(error) });
  }
}
