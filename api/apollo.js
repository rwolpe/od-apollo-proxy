// Vercel Serverless Function: Apollo People Search Proxy
// Deploy: push to GitHub, connect to Vercel, done.
// Endpoint: POST /api/apollo

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const { domain, key, titles, broaden, debug } = req.body || {};

  if (!domain || !key) {
    return res.status(400).json({ error: 'Missing domain or key' });
  }

  const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  const apolloHeaders = { 'Content-Type': 'application/json' };
  let attempt_used = null;
  let attempt_reason = null;
  let people = [];
  let total = null;
  let debugInfo = {};

  try {
    // ── ATTEMPT A: Domain + title filter ──
    if (!broaden && titles && titles.length > 0) {
      const bodyA = {
        api_key: key,
        q_organization_domains: cleanDomain,
        person_titles: titles,
        page: 1,
        per_page: 25
      };
      const rA = await fetch('https://api.apollo.io/v1/mixed_people/search', {
        method: 'POST',
        headers: apolloHeaders,
        body: JSON.stringify(bodyA)
      });
      const dA = await rA.json();

      if (debug) {
        debugInfo.attempt_a = {
          endpoint: '/v1/mixed_people/search',
          status: rA.status,
          total: dA.pagination?.total_entries ?? null,
          people_count: (dA.people || []).length,
          response_keys: Object.keys(dA)
        };
      }

      if (dA.people && dA.people.length > 0) {
        people = dA.people;
        total = dA.pagination?.total_entries ?? null;
        attempt_used = 'A';
        attempt_reason = 'Domain + title filter';
      }
    }

    // ── ATTEMPT B: Domain only, no title filter ──
    if (people.length === 0) {
      const bodyB = {
        api_key: key,
        q_organization_domains: cleanDomain,
        page: 1,
        per_page: 25
      };
      const rB = await fetch('https://api.apollo.io/v1/mixed_people/search', {
        method: 'POST',
        headers: apolloHeaders,
        body: JSON.stringify(bodyB)
      });
      const dB = await rB.json();

      if (debug) {
        debugInfo.attempt_b = {
          endpoint: '/v1/mixed_people/search',
          status: rB.status,
          total: dB.pagination?.total_entries ?? null,
          people_count: (dB.people || []).length,
          response_keys: Object.keys(dB)
        };
      }

      if (dB.people && dB.people.length > 0) {
        people = dB.people;
        total = dB.pagination?.total_entries ?? null;
        attempt_used = 'B';
        attempt_reason = 'Domain only, no title filter';
      }
    }

    // ── ATTEMPT C: Organization search → people by org ID ──
    if (people.length === 0) {
      const orgBody = {
        api_key: key,
        q_organization_domains: cleanDomain,
        page: 1,
        per_page: 1
      };
      const orgR = await fetch('https://api.apollo.io/v1/mixed_companies/search', {
        method: 'POST',
        headers: apolloHeaders,
        body: JSON.stringify(orgBody)
      });
      const orgD = await orgR.json();
      const orgs = orgD.organizations || orgD.accounts || [];

      if (debug) {
        debugInfo.attempt_c_org = {
          endpoint: '/v1/mixed_companies/search',
          status: orgR.status,
          orgs_found: orgs.length,
          org_name: orgs[0]?.name ?? null,
          org_id: orgs[0]?.id ?? null
        };
      }

      if (orgs.length > 0) {
        const orgId = orgs[0].id;
        const pBody = {
          api_key: key,
          organization_ids: [orgId],
          page: 1,
          per_page: 25
        };
        const pR = await fetch('https://api.apollo.io/v1/mixed_people/search', {
          method: 'POST',
          headers: apolloHeaders,
          body: JSON.stringify(pBody)
        });
        const pD = await pR.json();

        if (debug) {
          debugInfo.attempt_c_people = {
            endpoint: '/v1/mixed_people/search',
            status: pR.status,
            total: pD.pagination?.total_entries ?? null,
            people_count: (pD.people || []).length
          };
        }

        if (pD.people && pD.people.length > 0) {
          people = pD.people;
          total = pD.pagination?.total_entries ?? null;
          attempt_used = 'C';
          attempt_reason = 'Org ID lookup then people search';
        }
      }
    }

    // ── ATTEMPT D: Organization name derived from domain ──
    if (people.length === 0) {
      const orgName = cleanDomain.replace(/\.(com|io|co|net|org|us|app)$/i, '').replace(/[^a-zA-Z0-9]/g, ' ').trim();
      const bodyD = {
        api_key: key,
        q_organization_name: orgName,
        page: 1,
        per_page: 25
      };
      const rD = await fetch('https://api.apollo.io/v1/mixed_people/search', {
        method: 'POST',
        headers: apolloHeaders,
        body: JSON.stringify(bodyD)
      });
      const dD = await rD.json();

      if (debug) {
        debugInfo.attempt_d = {
          endpoint: '/v1/mixed_people/search',
          org_name_used: orgName,
          status: rD.status,
          total: dD.pagination?.total_entries ?? null,
          people_count: (dD.people || []).length
        };
      }

      if (dD.people && dD.people.length > 0) {
        people = dD.people;
        total = dD.pagination?.total_entries ?? null;
        attempt_used = 'D';
        attempt_reason = 'Organization name derived from domain: ' + orgName;
      }
    }

    // ── BUILD RESPONSE ──
    const response = {
      ok: people.length > 0,
      domain: cleanDomain,
      attempt_used: attempt_used || 'none',
      attempt_reason: attempt_reason || 'All attempts returned 0 people',
      people: people.map(p => ({
        id: p.id,
        first_name: p.first_name || '',
        last_name: p.last_name || '',
        name: p.name || ((p.first_name || '') + ' ' + (p.last_name || '')).trim(),
        title: p.title || '',
        email: p.email || null,
        email_status: p.email_status || null,
        linkedin_url: p.linkedin_url || null,
        photo_url: p.photo_url || null,
        organization_name: p.organization_name || p.organization?.name || '',
        city: p.city || '',
        state: p.state || '',
        country: p.country || '',
        departments: p.departments || [],
        seniority: p.seniority || '',
        phone_numbers: p.phone_numbers || []
      })),
      total: total
    };

    if (debug) {
      response.debug = debugInfo;
    }

    return res.status(200).json(response);

  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message || 'Unknown proxy error',
      domain: cleanDomain,
      attempt_used: attempt_used || 'none',
      people: [],
      total: 0,
      debug: debug ? debugInfo : undefined
    });
  }
}
