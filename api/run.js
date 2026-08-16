import { authorizeUsage, meter, readJson, requirePrincipal, supabase } from './_lib/platform.js';

function sanitizeRequest(body) {
  return {
    source: { kind: body.source?.kind, id: body.source?.id },
    participant: { type: 'http', id: body.participant?.id, kind: body.participant?.kind, urlOrigin: (() => { try { return new URL(body.participant?.url).origin; } catch { return 'invalid'; } })() },
    maxScenarios: body.maxScenarios,
    maxFaultCombinationSize: body.maxFaultCombinationSize,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  try {
    const principal = await requirePrincipal(req, res);
    if (!principal) return;
    const body = await readJson(req, 2_000_000);
    if (body.participant?.type !== 'http') return res.status(400).json({ error: 'hosted_runner_supports_public_https_participants_only', usePrivateRunnerFor: ['commands','localhost','private networks','sensitive internal systems'] });
    const maxScenarios = Math.max(1, Math.min(25, Number(body.maxScenarios ?? 5)));
    const estimatedUnits = maxScenarios * 10;
    const quota = await authorizeUsage(principal.organizationId, estimatedUnits);
    if (!quota.allowed) return res.status(quota.reason === 'monthly_quota_exceeded' ? 429 : 402).json({ error: quota.reason, used: quota.used, limit: quota.limit });

    const mod = await import('../dist/src/index.js');
    const source = body.source ?? {};
    let domain;
    if (source.kind === 'workflow') domain = mod.compileWorkflow(source.value);
    else if (source.kind === 'openapi') domain = mod.compileOpenApi(source.value);
    else if (source.kind === 'sql') domain = mod.compileSqlSchema(String(source.value ?? ''), source.id ?? 'sql:hosted');
    else if (source.kind === 'repository') domain = mod.compileRepositoryManifest(source.value);
    else if (source.kind === 'trace') domain = mod.compileTrace(source.value);
    else return res.status(400).json({ error: 'unsupported_source_kind', supported: ['workflow','openapi','sql','repository','trace'] });

    const participant = new mod.HttpParticipant({
      id: String(body.participant.id ?? 'hosted-participant'),
      kind: String(body.participant.kind ?? 'http-participant'),
      url: String(body.participant.url ?? ''),
      headers: body.participant.headers && typeof body.participant.headers === 'object' ? body.participant.headers : {},
      timeoutMs: Math.max(1000, Math.min(30_000, Number(body.participant.timeoutMs ?? 15_000))),
      allowPrivateNetwork: false,
    });

    const scenarios = mod.synthesizeScenarioFamily(domain, {
      maxFaultCombinationSize: Math.max(0, Math.min(3, Number(body.maxFaultCombinationSize ?? 2))),
      includeAuthorityRevocation: true,
      hiddenFraction: 0.2,
      limit: maxScenarios,
    });
    if (!scenarios.length) return res.status(422).json({ error: 'no_valid_scenarios_generated' });

    const evaluationRows = await supabase('/rest/v1/evaluations', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: { organization_id: principal.organizationId, participant_id: participant.id, status: 'running', request: sanitizeRequest(body) },
    });
    const evaluation = evaluationRows?.[0];

    try {
      const report = await mod.runCompiledScenarioFamily({
        domain,
        scenarios,
        participant,
        initialEntities: body.initialEntities && typeof body.initialEntities === 'object' ? body.initialEntities : undefined,
        maxScenarios,
      });
      const invalid = Number(report.statusCounts?.invalid ?? 0) > 0;
      const inconclusive = Number(report.statusCounts?.inconclusive ?? 0) > 0;
      const qualified = Number(report.statusCounts?.qualified ?? 0) > 0;
      const status = invalid ? 'invalid' : inconclusive ? 'inconclusive' : qualified ? 'qualified' : 'verified';
      const units = report.results.reduce((sum, item) => sum + item.trace.length + item.verifierResults.length * 2 + 2, 0);
      await meter(principal.organizationId, 'hosted_evaluation_units', units, { evaluationId: evaluation?.id, domainId: domain.id, scenarios: report.scenariosRun });
      if (evaluation?.id) {
        await supabase(`/rest/v1/evaluations?id=eq.${evaluation.id}`, {
          method: 'PATCH', headers: { Prefer: 'return=minimal' },
          body: { status, result: report, evidence_root: report.evidenceRoots.join(':'), completed_at: new Date().toISOString() },
        });
      }
      return res.status(200).json({ evaluationId: evaluation?.id, status, usageUnits: units, quota: { usedBefore: quota.used, limit: quota.limit }, report });
    } catch (error) {
      if (evaluation?.id) await supabase(`/rest/v1/evaluations?id=eq.${evaluation.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: { status: 'failed', result: { error: error instanceof Error ? error.message : String(error) }, completed_at: new Date().toISOString() } });
      throw error;
    }
  } catch (error) {
    return res.status(400).json({ error: 'hosted_evaluation_failed', message: error instanceof Error ? error.message : String(error) });
  }
}
