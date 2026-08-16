import { requireApiKey, readJson } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!requireApiKey(req, res)) return;
  try {
    const body = await readJson(req);
    const mod = await import('../dist/src/index.js');
    const options = {
      warehouseA: Number(body.world?.warehouseA ?? 600),
      warehouseB: Number(body.world?.warehouseB ?? 700),
      customerDemand: Number(body.world?.customerDemand ?? 1000),
      reservedTomorrow: Number(body.world?.reservedTomorrow ?? 300),
      transferPermission: body.world?.transferPermission !== false,
      transferFailureRate: Number(body.world?.transferFailureRate ?? 0),
      seed: Number(body.world?.seed ?? 1),
    };
    const participant = {
      id: String(body.participantId ?? 'api.deterministic-baseline'),
      kind: String(body.participantKind ?? 'deterministic-policy'),
      act(observation) {
        const remaining = observation.customerDemand - observation.fulfilled;
        if (remaining <= 0) return { type: 'wait' };
        if (observation.warehouseA >= remaining) return { type: 'fulfill', amount: remaining };
        const transferable = Math.max(0, observation.warehouseB - observation.reservedTomorrow);
        const needed = remaining - observation.warehouseA;
        if (transferable >= needed && needed > 0) return { type: 'transfer', amount: needed };
        if (observation.warehouseA > 0) return { type: 'fulfill', amount: Math.min(remaining, observation.warehouseA) };
        return { type: 'wait' };
      },
    };
    const result = await mod.runEvaluation({
      runId: String(body.runId ?? `api-${Date.now()}`),
      benchmarkId: 'operational-intelligence.inventory.v1',
      task: "Fulfill current customer demand while preserving tomorrow's reserved inventory.",
      maxSteps: Number(body.maxSteps ?? 8),
      resourceBudget: Number(body.resourceBudget ?? 8),
      participant,
      worldFactory: () => new mod.InventoryWorld(options),
      verifiers: [new mod.FulfillmentVerifier(), new mod.IntegrityVerifier(), new mod.EfficiencyVerifier()],
      stopWhen: (state) => state.fulfilled >= state.customerDemand,
    });
    return res.status(200).json(result);
  } catch (error) {
    return res.status(400).json({ error: 'evaluation_failed', message: error instanceof Error ? error.message : String(error) });
  }
}
