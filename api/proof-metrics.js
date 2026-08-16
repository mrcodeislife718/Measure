import { readJson, requirePrincipal, supabase } from './_lib/platform.js';

export default async function handler(req, res) {
  try {
    const principal = await requirePrincipal(req, res);
    if (!principal) return;

    if (req.method === 'GET') {
      const rows = await supabase(`/rest/v1/proof_metrics?organization_id=eq.${principal.organizationId}&select=*&order=created_at.desc&limit=500`);
      const totals = rows.reduce((acc, row) => {
        acc.environmentAuthoringMinutes += Number(row.environment_authoring_minutes ?? 0);
        acc.expertReviewMinutes += Number(row.expert_review_minutes ?? 0);
        acc.scenariosValidated += Number(row.scenarios_validated ?? 0);
        acc.failuresDiscovered += Number(row.failures_discovered ?? 0);
        acc.falsePositiveFindings += Number(row.false_positive_findings ?? 0);
        acc.trustworthyEvidenceUnits += Number(row.trustworthy_evidence_units ?? 0);
        acc.computeCostUsd += Number(row.compute_cost_usd ?? 0);
        return acc;
      }, { environmentAuthoringMinutes: 0, expertReviewMinutes: 0, scenariosValidated: 0, failuresDiscovered: 0, falsePositiveFindings: 0, trustworthyEvidenceUnits: 0, computeCostUsd: 0 });
      const humanHours = Math.max(1 / 60, (totals.environmentAuthoringMinutes + totals.expertReviewMinutes) / 60);
      return res.status(200).json({ rows, totals, trustworthyEvidencePerHumanHour: totals.trustworthyEvidenceUnits / humanHours });
    }

    if (req.method === 'POST') {
      const body = await readJson(req, 128_000);
      const rows = await supabase('/rest/v1/proof_metrics', {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: {
          organization_id: principal.organizationId,
          evaluation_id: body.evaluationId ?? null,
          environment_authoring_minutes: Number(body.environmentAuthoringMinutes ?? 0),
          expert_review_minutes: Number(body.expertReviewMinutes ?? 0),
          scenarios_generated: Number(body.scenariosGenerated ?? 0),
          scenarios_validated: Number(body.scenariosValidated ?? 0),
          failures_discovered: Number(body.failuresDiscovered ?? 0),
          false_positive_findings: Number(body.falsePositiveFindings ?? 0),
          simulation_reality_agreement: body.simulationRealityAgreement === undefined ? null : Number(body.simulationRealityAgreement),
          compute_cost_usd: Number(body.computeCostUsd ?? 0),
          trustworthy_evidence_units: Number(body.trustworthyEvidenceUnits ?? 0),
          customer_outcome: body.customerOutcome ?? null,
        },
      });
      return res.status(201).json({ metric: rows?.[0] });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (error) {
    return res.status(400).json({ error: 'proof_metrics_failed', message: error instanceof Error ? error.message : String(error) });
  }
}
