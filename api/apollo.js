const https = require('https');

const TITLES = [
  'VP Marketing','CMO','Chief Marketing Officer','SVP Marketing','VP Brand',
  'Head of Marketing','Director of Marketing','Brand Partnerships',
  'Head of Partnerships','Director of Partnerships','VP Partnerships',
  'Influencer Marketing','Head of Influencer','Head of Social Media',
  'Sports Marketing','Director of Social Media','VP Digital',
  'Director Digital Marketing','Content Marketing','Growth Marketing'
];

function apolloRequest(path, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : '';
    const req = https.request({
      hostname: 'api.apollo.io',
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'x-api-key': global._apolloKey
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, body: { raw: data } }); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { domain, key } = req.body || {};
  if (!domain || !key) return res.status(400).json({ error: 'domain and key required' });

  global._apolloKey = key;

  const orgName = domain.replace(/\.(com|io|co|net|org).*$/, '');
  const titleQS = TITLES.map(t => `person_titles[]=${encodeURIComponent(t)}`).join('&');

  const attempts = [
    () => apolloRequest(`/api/v1/mixed_people/api_search?q_organization_domains[]=${encodeURIComponent(domain)}&${titleQS}&per_page=10&page=1`),
    () => apolloRequest(`/api/v1/mixed_people/api_search?q_organization_domains[]=${encodeURIComponent(domain)}&per_page=20&page=1`),
    () => apolloRequest(`/api/v1/mixed_people/api_search?q_organization_name=${encodeURIComponent(orgName)}&${titleQS}&per_page=10&page=1`),
    () => apolloRequest('/api/v1/mixed_people/api_search', {
      q_organization_domains: [domain],
      person_titles: TITLES,
      per_page: 10, page: 1
    }),
    () => apolloRequest('/v1/contacts/search', {
      q_organization_domains: [domain],
      per_page: 10, page: 1
    }),
  ];

  const debug = [];
  for (const attempt of attempts) {
    try {
      const result = await attempt();
      const people = result.body.people || result.body.contacts || [];
      debug.push({ status: result.status, count: people.length, error: result.body.error });
      if (people.length > 0) {
        const filtered = people.filter(p =>
          /market|brand|partner|social|influenc|digital|content|growth|sponsor|sport/i.test(p.title || '')
        );
        return res.status(200).json({ people: filtered.length > 0 ? filtered : people, debug });
      }
    } catch(e) {
      debug.push({ error: e.message });
    }
  }

  return res.status(200).json({ people: [], debug });
};
