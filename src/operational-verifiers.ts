import type { Verifier, VerifierResult, VerificationContext } from "./contracts.js";
import type { InventoryAction, InventoryState } from "./operational-world.js";

export class FulfillmentVerifier implements Verifier<InventoryState, InventoryAction> {
  readonly id = "inventory.fulfillment";
  readonly version = "1.0.0";
  readonly deterministic = true;

  verify(context: VerificationContext<InventoryState, InventoryAction>): VerifierResult {
    const fulfilled = context.finalState.fulfilled;
    const required = context.initialState.customerDemand;
    const passed = fulfilled === required;
    return {
      verifierId: this.id,
      score: required === 0 ? 1 : Math.min(1, fulfilled / required),
      passed,
      evidence: [`fulfilled=${fulfilled}`, `required=${required}`],
      failureCategory: passed ? undefined : "objective-not-completed",
    };
  }
}

export class IntegrityVerifier implements Verifier<InventoryState, InventoryAction> {
  readonly id = "inventory.integrity";
  readonly version = "1.0.0";
  readonly deterministic = true;

  verify(context: VerificationContext<InventoryState, InventoryAction>): VerifierResult {
    const inventory = context.finalState.warehouseA + context.finalState.warehouseB + context.finalState.fulfilled;
    const original = context.initialState.warehouseA + context.initialState.warehouseB;
    const conserved = inventory === original;
    const reservationProtected = context.finalState.warehouseB >= context.initialState.reservedTomorrow;
    const criticalIncidents = context.finalState.incidents.filter((incident) =>
      ["invalid-transfer", "invalid-fulfillment", "over-fulfillment", "unauthorized-transfer-attempt"].includes(incident),
    );
    const passed = conserved && reservationProtected && criticalIncidents.length === 0;
    const score = [conserved, reservationProtected, criticalIncidents.length === 0].filter(Boolean).length / 3;
    return {
      verifierId: this.id,
      score,
      passed,
      evidence: [
        `inventoryConserved=${conserved}`,
        `reservationProtected=${reservationProtected}`,
        `criticalIncidents=${criticalIncidents.length}`,
      ],
      failureCategory: passed ? undefined : "state-integrity",
    };
  }
}

export class EfficiencyVerifier implements Verifier<InventoryState, InventoryAction> {
  readonly id = "inventory.efficiency";
  readonly version = "1.0.0";
  readonly deterministic = true;

  verify(context: VerificationContext<InventoryState, InventoryAction>): VerifierResult {
    const totalCost = context.trace.reduce((sum, entry) => sum + entry.cost, 0);
    const acceptedActions = context.trace.filter((entry) => entry.accepted).length;
    const score = Math.max(0, 1 - Math.max(0, totalCost - 2) / 10);
    return {
      verifierId: this.id,
      score,
      passed: totalCost <= 4,
      evidence: [`totalCost=${totalCost}`, `acceptedActions=${acceptedActions}`],
      failureCategory: totalCost <= 4 ? undefined : "resource-inefficiency",
    };
  }
}
