const https = require('https');

const HUNTER_KEY = '4019efdb41c5c8b987de2907ca4048f3da40a772';

const RELEVANT = /market|brand|partner|social|influenc|digital|content|growth|sponsor|sport|creative|campaign|media|pr |public.rel/i;

function hunterRequest(domain) {
  return new Promise((resolve, reject) => {
    const path = `/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${HUNTER_KEY}&limit=20`;
    const req = https.request({
      hostname: 'api.hunter.io',
      path,
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve({}); } });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { domain } = req.body || {};
  if (!domain) return res.status(400).json({ error: 'missing domain' });

  try {
    const data = await hunterRequest(domain);
    const emails = data?.data?.emails || [];
    const relevant = emails.filter(e => RELEVANT.test(e.position || ''));
    const people = (relevant.length > 0 ? relevant : emails.slice(0, 8)).map(e => ({
      name: `${e.first_name || ''} ${e.last_name || ''}`.trim(),
      title: e.position || '',
      email: e.value,
      linkedin_url: e.linkedin,
      organization: { name: data?.data?.organization || domain }
    }));
    return res.status(200).json({ people, total: people.length });
  } catch(e) {
    return res.status(200).json({ people: [], error: e.message });
  }
};
