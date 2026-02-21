const https = require('https');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { domain, key } = req.body || {};
  if (!domain || !key) return res.status(400).json({ error: 'missing params' });

  const TITLES = ['VP Marketing','CMO','Head of Marketing','Brand Partnerships',
    'Head of Partnerships','Director of Marketing','Head of Social Media',
    'VP Brand','Director of Brand','Influencer Marketing','Sports Marketing'];

  function post(path, bodyObj) {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify(bodyObj);
      const r = https.request({
        hostname: 'api.apollo.io', path, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'Content-Length': Buffer.byteLength(body) }
      }, res2 => {
        let d = ''; res2.on('data', c => d += c);
        res2.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve({}); } });
      });
      r.on('error', reject);
      r.setTimeout(8000, () => { r.destroy(); reject(new Error('timeout')); });
      r.write(body); r.end();
    });
  }

  try {
    // Try each title via enrichment endpoint
    const results = await Promise.all(
      TITLES.slice(0, 5).map(title =>
        post('/api/v1/people/match', { 
          organization_domain: domain, 
          title: title,
          reveal_personal_emails: false,
          reveal_phone_number: false
        }).catch(() => ({}))
      )
    );

    const people = results
      .map(r => r.person)
      .filter(Boolean)
      .filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i);

    if (people.length > 0) return res.status(200).json({ people, source: 'enrichment' });

    // Fallback: organization search to get org ID then people
    const orgData = await post('/api/v1/organizations/enrich', { domain });
    const orgId = orgData?.organization?.id;

    if (orgId) {
      const peopleData = await post('/api/v1/mixed_people/api_search', {
        organization_ids: [orgId],
        person_titles: TITLES,
        per_page: 10, page: 1
      });
      const p2 = peopleData.people || [];
      if (p2.length > 0) return res.status(200).json({ people: p2, source: 'org_id' });
    }

    return res.status(200).json({ people: [], debug: { orgId, orgError: orgData?.error } });
  } catch(e) {
    return res.status(200).json({ people: [], error: e.message });
  }
};
