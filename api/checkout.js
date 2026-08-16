const FALLBACK = 'https://github.com/mrcodeislife718/Measure/issues/new?title=Measure%20commercial%20pilot&body=I%20am%20interested%20in%20a%20Measure%20evaluation%20pilot.';

export default function handler(req, res) {
  const plan = String(req.query?.plan ?? 'pilot').toLowerCase();
  const targets = {
    pilot: process.env.MEASURE_PILOT_CHECKOUT_URL,
    team: process.env.MEASURE_TEAM_CHECKOUT_URL,
    enterprise: process.env.MEASURE_ENTERPRISE_CONTACT_URL,
  };
  const target = targets[plan] || process.env.MEASURE_CONTACT_URL || FALLBACK;
  res.setHeader('Cache-Control', 'no-store');
  res.redirect(302, target);
}
