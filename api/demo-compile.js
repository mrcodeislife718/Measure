import { readJson, requireRateLimit } from './_lib/platform.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  try {
    if (!await requireRateLimit(req, res, 'demo.compile', { limit: 20, windowSeconds: 3600 })) return;
    const body = await readJson(req, 32_000);
    const states = Array.isArray(body.states) ? body.states.map(String).map((value) => value.trim()).filter(Boolean).slice(0, 8) : [];
    const action = String(body.action ?? '').trim().slice(0, 80);
    const authority = String(body.authority ?? '').trim().slice(0, 80);
    if (states.length < 2 || !action) return res.status(400).json({ error: 'two_states_and_action_required' });
    const mod = await import('../dist/src/index.js');
    const domain = mod.compileWorkflow({
      id: 'public-demo',
      states,
      transitions: [{ from: states[0], to: states[states.length - 1], action, authority: authority || undefined }],
    });
    const scenarios = mod.synthesizeScenarioFamily(domain, { maxFaultCombinationSize: 1, includeAuthorityRevocation: true, hiddenFraction: 0, limit: 12 });
    return res.status(200).json({
      demo: true,
      domain: { id: domain.id, tools: domain.tools, authorities: domain.authorities, invariants: domain.invariants, taskTemplates: domain.taskTemplates, faultSurfaces: domain.faultSurfaces },
      generatedScenarios: scenarios.length,
      scenarios: scenarios.slice(0, 6),
      note: 'The public demo is intentionally capped. Paid Measure evaluates private systems, persistent worlds, active simulations, replication, Internal Affairs, and evidence lineage.',
    });
  } catch (error) {
    return res.status(400).json({ error: 'demo_failed', message: error instanceof Error ? error.message : String(error) });
  }
}
