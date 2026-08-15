import { createHash } from "node:crypto";

export interface ContaminationItem {
  id: string;
  text: string;
  visibility: "public" | "private" | "sealed";
}

export interface ContaminationFinding {
  itemId: string;
  matchedId: string;
  similarity: number;
  risk: "low" | "medium" | "high";
}

function tokens(text: string): Set<string> {
  return new Set(text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  const intersection = [...a].filter((value) => b.has(value)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

export function contentFingerprint(text: string): string {
  return createHash("sha256").update(text.normalize("NFKC")).digest("hex");
}

export function scanContamination(targets: ContaminationItem[], corpus: ContaminationItem[]): ContaminationFinding[] {
  const findings: ContaminationFinding[] = [];
  for (const target of targets) {
    const targetTokens = tokens(target.text);
    for (const candidate of corpus) {
      if (target.id === candidate.id) continue;
      const similarity = jaccard(targetTokens, tokens(candidate.text));
      if (similarity < 0.35) continue;
      findings.push({
        itemId: target.id,
        matchedId: candidate.id,
        similarity,
        risk: similarity >= 0.8 ? "high" : similarity >= 0.55 ? "medium" : "low",
      });
    }
  }
  return findings.sort((a, b) => b.similarity - a.similarity);
}
