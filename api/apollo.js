const https = require('https');

const TITLES = [
  'VP Marketing','CMO','Chief Marketing Officer','SVP Marketing','VP Brand',
  'Head of Marketing','Director of Marketing','Brand Partnerships',
  'Head of Partnerships','Director of Partnerships','VP Partnerships',
  'Influencer Marketing','Head of Influencer','Head of Social Media',
  'Sports Marketing','Director of Social Media','VP Digital',
  'Director Digital Marketing','Content Marketing','Growth Marketing'
];

function apolloFetch(domain, key) {
  return new Promise((resolve, reject) => {
    const titleQS = TITLES.map(t => `person_titles[]=${encodeURIComponent(t)}`).join('&');
    const path = `/api/v1/mixed_people/api_search?api_key=${key}&q_organization_domains[]=${encodeURIComponent(domain)}&${titleQS}&per_page=10&page=1`;
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
  try {
    const { status, body } = await apolloFetch(domain, key);
    return res.status(status).json(body);
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
};
