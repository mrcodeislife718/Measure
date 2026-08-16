async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  try {
    const body = await readJson(req);
    const mod = await import('../dist/src/index.js');
    let domain;
    if (body.kind === 'workflow') domain = mod.compileWorkflow(body.source);
    else if (body.kind === 'openapi') domain = mod.compileOpenApi(body.source);
    else if (body.kind === 'sql') domain = mod.compileSqlSchema(String(body.source ?? ''), body.id ?? 'sql:api');
    else if (body.kind === 'repository') domain = mod.compileRepositoryManifest(body.source);
    else if (body.kind === 'trace') domain = mod.compileTrace(body.source);
    else return res.status(400).json({ error: 'unsupported_kind', supported: ['workflow','openapi','sql','repository','trace'] });

    const scenarios = mod.synthesizeScenarioFamily(domain, {
      maxFaultCombinationSize: 2,
      includeAuthorityRevocation: true,
      hiddenFraction: 0.2,
      limit: 250,
    });
    return res.status(200).json({
      domain: {
        id: domain.id,
        sourceKind: domain.sourceKind,
        sourceDigest: domain.sourceDigest,
        entities: domain.entities.length,
        tools: domain.tools.length,
        authorities: domain.authorities.length,
        invariants: domain.invariants.length,
        taskTemplates: domain.taskTemplates.length,
        faultSurfaces: domain.faultSurfaces.length,
        reviewRequired: domain.reviewRequired,
      },
      generatedScenarios: scenarios.length,
      hiddenScenarios: scenarios.filter((scenario) => scenario.hidden).length,
      sampleScenarios: scenarios.slice(0, 5),
    });
  } catch (error) {
    return res.status(400).json({ error: 'compile_failed', message: error instanceof Error ? error.message : String(error) });
  }
}
