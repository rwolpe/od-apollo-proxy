const https = require('https');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { domain, key } = req.body || {};
  if (!domain || !key) return res.status(400).json({ error: 'missing params' });

  const body = JSON.stringify({
    api_key: key,
    q_organization_domains: [domain],
    per_page: 20, page: 1
  });

  try {
    const data = await Promise.race([
      new Promise((resolve, reject) => {
        const r = https.request({
          hostname: 'api.apollo.io',
          path: '/api/v1/mixed_people/api_search',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': key,
            'Content-Length': Buffer.byteLength(body)
          }
        }, res2 => {
          let d = '';
          res2.on('data', c => d += c);
          res2.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve({}); } });
        });
        r.on('error', reject);
        r.setTimeout(8000, () => { r.destroy(); reject(new Error('timeout')); });
        r.write(body); r.end();
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 9000))
    ]);

    const all = data.people || [];
    const filtered = all.filter(p =>
      /market|brand|partner|social|influenc|digital|content|growth|sponsor|sport/i.test(p.title || '')
    );
    return res.status(200).json({
      people: filtered.length > 0 ? filtered : all.slice(0, 8),
      total: data.total_entries,
      debug: data.error || null
    });
  } catch(e) {
    return res.status(200).json({ people: [], error: e.message });
  }
};
