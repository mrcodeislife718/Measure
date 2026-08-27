import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import process from 'node:process';

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])]));
  return value;
}
const digest = (value) => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const inputPath = process.argv[2];
if (!inputPath) throw new Error('usage: npm run repro:package -- <evaluation-evidence.json> [output.json]');
const outputPath = process.argv[3] ?? 'evidence/reproduction-package.json';
const evidence = JSON.parse(await readFile(inputPath, 'utf8'));
const packageData = {
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  purpose: 'Independent reproduction of a Measure evaluation conclusion',
  evidence,
  evidenceDigest: digest(evidence),
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  requiredChecks: [
    'environment definition is identical or version-locked',
    'participant inputs and holdback identity are integrity checked',
    'verifier version is declared',
    'sealed evidence hashes verify',
    'replay reproduces the recorded verifier outputs',
    'independent runner records disagreements rather than normalizing them away'
  ],
  commands: ['npm ci', 'npm run check', `npm run private-runner -- ${inputPath}`],
};
const sealed = { ...packageData, packageDigest: digest(packageData) };
await mkdir(outputPath.split('/').slice(0, -1).join('/') || '.', { recursive: true });
await writeFile(outputPath, `${JSON.stringify(sealed, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ outputPath, packageDigest: sealed.packageDigest, evidenceDigest: sealed.evidenceDigest }, null, 2));
