const https = require('https');

function hunterRequest(domain, apiKey) {
  return new Promise((resolve, reject) => {
    const path = `/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${apiKey}&limit=20`;
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

const RELEVANT = /market|brand|partner|social|influenc|digital|content|growth|sponsor|sport|creative|campaign|media|pr |public.rel/i;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { domain, key } = req.body || {};
  if (!domain || !key) return res.status(400).json({ error: 'missing domain or key' });

  try {
    const data = await hunterRequest(domain, key);
    const emails = data?.data?.emails || [];
    
    const relevant = emails.filter(e => RELEVANT.test(e.position || ''));
    const people = (relevant.length > 0 ? relevant : emails.slice(0, 8)).map(e => ({
      first_name: e.first_name,
      last_name: e.last_name,
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
