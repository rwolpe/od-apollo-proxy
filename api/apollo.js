const https = require('https');

const TITLES = [
  'VP Marketing','CMO','Chief Marketing Officer','SVP Marketing','VP Brand',
  'Head of Marketing','Director of Marketing','Brand Partnerships',
  'Head of Partnerships','Director of Partnerships','VP Partnerships',
  'Influencer Marketing','Head of Influencer','Head of Social Media',
  'Sports Marketing','Director of Social Media','VP Digital',
  'Director Digital Marketing','Content Marketing','Growth Marketing'
];

function apolloRequest(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.apollo.io',
      path,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, body: { raw: data } }); }
      });
    });
    req.on('error', reject);
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

  const titleQS = TITLES.map(t => `person_titles[]=${encodeURIComponent(t)}`).join('&');
  const base = `/api/v1/mixed_people/api_search?api_key=${key}&q_organization_domains[]=${encodeURIComponent(domain)}`;

  try {
    // Try 1: with title filters
    let result = await apolloRequest(`${base}&${titleQS}&per_page=10&page=1`);
    let people = result.body.people || [];
    
    // Try 2: no title filter (broader)
    if (people.length === 0) {
      result = await apolloRequest(`${base}&per_page=20&page=1`);
      people = result.body.people || [];
      // Filter client-side
      if (people.length > 0) {
        const filtered = people.filter(p =>
          /market|brand|partner|social|influenc|digital|content|growth|sponsor|sport/i.test(p.title || '')
        );
        people = filtered.length > 0 ? filtered : people.slice(0, 8);
      }
    }

    // Try 3: contacts/search endpoint
    if (people.length === 0) {
      result = await apolloRequest(`/v1/contacts/search?api_key=${key}&q_organization_domains[]=${encodeURIComponent(domain)}&per_page=10&page=1`);
      people = result.body.contacts || result.body.people || [];
    }

    return res.status(200).json({ 
      people,
      total: people.length,
      debug: { status: result.status, hasError: !!result.body.error, error: result.body.error }
    });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
};
