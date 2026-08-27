import { requirePrincipal, readJson } from './_lib/platform.js';
import { economicProductionSnapshot, recordEconomicEvent } from './_lib/economics.js';

const allowedManualEvents = new Set(['paid_evaluation','independent_reproduction','decision_value','delivery_cost','retained_customer']);

export default async function handler(req, res) {
  try {
    const principal = await requirePrincipal(req, res);
    if (!principal) return;

    if (req.method === 'GET') {
      return res.status(200).json(await economicProductionSnapshot(principal.organizationId));
    }

    if (req.method === 'POST') {
      const body = await readJson(req);
      const eventType = String(body.eventType ?? '');
      if (!allowedManualEvents.has(eventType)) return res.status(400).json({ error: 'unsupported_event_type' });
      const valueUsd = body.valueUsd === undefined ? undefined : Number(body.valueUsd);
      if (valueUsd !== undefined && (!Number.isFinite(valueUsd) || valueUsd < 0)) return res.status(400).json({ error: 'invalid_value_usd' });
      const result = await recordEconomicEvent(principal.organizationId, eventType, {
        valueUsd,
        externalRef: body.externalRef ? String(body.externalRef) : undefined,
        metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
      });
      return res.status(201).json({ ...result, snapshot: await economicProductionSnapshot(principal.organizationId) });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (error) {
    console.error('economic production failure', error);
    return res.status(500).json({ error: 'economic_production_failed' });
  }
}
