import { sha256 } from "./hash.js";

export interface EvidenceRecord {
  sequence: number;
  type: string;
  payload: unknown;
  previousHash: string;
  hash: string;
}

export class EvidenceLedger {
  readonly records: EvidenceRecord[] = [];

  append(type: string, payload: unknown): EvidenceRecord {
    const previousHash = this.records.at(-1)?.hash ?? "GENESIS";
    const sequence = this.records.length;
    const hash = sha256({ sequence, type, payload, previousHash });
    const record = { sequence, type, payload, previousHash, hash };
    this.records.push(record);
    return record;
  }

  verify(): boolean {
    let previousHash = "GENESIS";
    for (const record of this.records) {
      if (record.previousHash !== previousHash) return false;
      const expected = sha256({
        sequence: record.sequence,
        type: record.type,
        payload: record.payload,
        previousHash: record.previousHash,
      });
      if (expected !== record.hash) return false;
      previousHash = record.hash;
    }
    return true;
  }

  root(): string {
    return this.records.at(-1)?.hash ?? sha256("EMPTY_LEDGER");
  }
}
