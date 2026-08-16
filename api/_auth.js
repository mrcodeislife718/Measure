import { timingSafeEqual } from 'node:crypto';

function equalSecret(a, b) {
  const left = Buffer.from(String(a ?? ''));
  const right = Buffer.from(String(b ?? ''));
  if (!left.length || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function requireApiKey(req, res) {
  const expected = process.env.MEASURE_API_KEY;
  if (!expected) return true;
  const authorization = String(req.headers?.authorization ?? '');
  const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const supplied = req.headers?.['x-measure-key'] ?? bearer;
  if (!equalSecret(supplied, expected)) {
    res.status(401).json({ error: 'unauthorized' });
    return false;
  }
  return true;
}

export async function readJson(req, maxBytes = 1_000_000) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > maxBytes) throw new Error('request_too_large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
