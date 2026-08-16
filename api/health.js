export default function handler(_req, res) {
  res.status(200).json({
    service: 'measure',
    status: 'ok',
    architectureNeutral: true,
    publicationStates: ['verified', 'qualified', 'inconclusive', 'invalid'],
    timestamp: new Date().toISOString(),
  });
}
