const https = require('https');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { domain, key } = req.body || {};

  const body = JSON.stringify({
    api_key: key,
    q_organization_domains: [domain],
    per_page: 20,
    page: 1
  });

  const r = await new Promise((resolve, reject) => {
    const req2 = https.request({
      hostname: 'api.apollo.io',
      path: '/api/v1/mixed_people/api_search',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'Content-Length': Buffer.byteLength(body) }
    }, res2 => {
      let d = ''; res2.on('data', c => d += c);
      res2.on('end', () => resolve(JSON.parse(d)));
    });
    req2.on('error', reject);
    req2.write(body); req2.end();
  });

  const all = r.people || [];
  const people = all.filter(p =>
    /market|brand|partner|social|influenc|digital|content|growth|sponsor|sport/i.test(p.title || '')
  );

  res.status(200).json({ people: people.length > 0 ? people : all.slice(0, 8), total: r.total_entries, debug: r.error });
};
