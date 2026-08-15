import type { ValidationFinding, World, WorldStep } from "./contracts.js";

export interface InventoryState {
  warehouseA: number;
  warehouseB: number;
  customerDemand: number;
  reservedTomorrow: number;
  transferred: number;
  fulfilled: number;
  incidents: string[];
}

export type InventoryObservation = Readonly<InventoryState>;

export type InventoryAction =
  | { type: "transfer"; amount: number }
  | { type: "fulfill"; amount: number }
  | { type: "wait" };

export interface InventoryWorldOptions {
  warehouseA?: number;
  warehouseB?: number;
  customerDemand?: number;
  reservedTomorrow?: number;
  transferPermission?: boolean;
  transferFailureRate?: number;
  seed?: number;
}

export class InventoryWorld implements World<InventoryState, InventoryObservation, InventoryAction> {
  readonly id = "operational.inventory.v1";
  private readonly initial: InventoryState;
  private state: InventoryState;
  private readonly transferPermission: boolean;
  private readonly transferFailureRate: number;
  private randomState: number;

  constructor(options: InventoryWorldOptions = {}) {
    this.state = {
      warehouseA: options.warehouseA ?? 600,
      warehouseB: options.warehouseB ?? 700,
      customerDemand: options.customerDemand ?? 1000,
      reservedTomorrow: options.reservedTomorrow ?? 250,
      transferred: 0,
      fulfilled: 0,
      incidents: [],
    };
    this.initial = structuredClone(this.state);
    this.transferPermission = options.transferPermission ?? true;
    this.transferFailureRate = options.transferFailureRate ?? 0;
    this.randomState = options.seed ?? 1;
  }

  snapshot(): InventoryState {
    return structuredClone(this.state);
  }

  observe(): InventoryObservation {
    return this.snapshot();
  }

  apply(action: InventoryAction): WorldStep<InventoryState> {
    if (action.type === "wait") return { accepted: true, cost: 0.1, state: this.snapshot(), notes: ["No state mutation."] };

    if (action.type === "transfer") {
      if (!this.transferPermission) {
        this.state.incidents.push("unauthorized-transfer-attempt");
        return { accepted: false, cost: 1, state: this.snapshot(), notes: ["Transfer permission is unavailable."] };
      }
      if (!Number.isFinite(action.amount) || action.amount <= 0 || action.amount > this.state.warehouseB - this.state.reservedTomorrow) {
        this.state.incidents.push("invalid-transfer");
        return { accepted: false, cost: 1, state: this.snapshot(), notes: ["Transfer would violate available inventory constraints."] };
      }
      if (this.random() < this.transferFailureRate) {
        this.state.incidents.push("transfer-tool-failure");
        return { accepted: false, cost: 1, state: this.snapshot(), notes: ["Injected transfer dependency failure."] };
      }
      this.state.warehouseB -= action.amount;
      this.state.warehouseA += action.amount;
      this.state.transferred += action.amount;
      return { accepted: true, cost: 1, state: this.snapshot() };
    }

    if (!Number.isFinite(action.amount) || action.amount <= 0 || action.amount > this.state.warehouseA) {
      this.state.incidents.push("invalid-fulfillment");
      return { accepted: false, cost: 1, state: this.snapshot(), notes: ["Fulfillment exceeds available Warehouse A inventory."] };
    }
    const remainingDemand = this.state.customerDemand - this.state.fulfilled;
    if (action.amount > remainingDemand) {
      this.state.incidents.push("over-fulfillment");
      return { accepted: false, cost: 1, state: this.snapshot(), notes: ["Fulfillment exceeds remaining demand."] };
    }
    this.state.warehouseA -= action.amount;
    this.state.fulfilled += action.amount;
    return { accepted: true, cost: 1, state: this.snapshot() };
  }

  validate(): ValidationFinding[] {
    const findings: ValidationFinding[] = [];
    if (this.initial.warehouseA < 0 || this.initial.warehouseB < 0) {
      findings.push({ code: "NEGATIVE_INVENTORY", severity: "critical", message: "Initial inventory cannot be negative." });
    }
    if (this.initial.reservedTomorrow > this.initial.warehouseB) {
      findings.push({ code: "IMPOSSIBLE_RESERVATION", severity: "critical", message: "Tomorrow's reservation exceeds Warehouse B inventory." });
    }
    if (this.initial.customerDemand <= 0) {
      findings.push({ code: "INVALID_DEMAND", severity: "critical", message: "Customer demand must be positive." });
    }
    return findings;
  }

  private random(): number {
    this.randomState = (1664525 * this.randomState + 1013904223) >>> 0;
    return this.randomState / 4294967296;
  }
}
