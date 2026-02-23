/ Vercel Serverless Function: Apollo People Search Proxy v2.2
// Apollo NOW REQUIRES api key in X-Api-Key header, not in body

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { domain, key, titles, broaden, debug } = req.body || {};
  if (!domain || !key) return res.status(400).json({ ok: false, error: 'Missing domain or key', people: [], total: 0 });

  const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  let attempt_used = null;
  let attempt_reason = null;
  let people = [];
  let total = null;
  let debugInfo = {};

  // Apollo fetch with key in header (required as of 2025)
  async function apolloFetch(endpoint, body) {
    const r = await fetch('https://api.apollo.io' + endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': key,
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify(body)
    });

    const text = await r.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error('Apollo returned non-JSON (HTTP ' + r.status + '): ' + text.slice(0, 200));
    }

    if (r.status >= 400) {
      throw new Error('Apollo error (' + r.status + '): ' + (data.message || data.error || JSON.stringify(data).slice(0, 200)));
    }

    return data;
  }

  try {
    // ATTEMPT A: Domain + title filter
    if (!broaden && titles && titles.length > 0) {
      try {
        const dA = await apolloFetch('/v1/mixed_people/search', {
          q_organization_domains: cleanDomain,
          person_titles: titles,
          page: 1,
          per_page: 25
        });
        if (debug) debugInfo.attempt_a = { status: 'ok', total: dA.pagination?.total_entries ?? null, people_count: (dA.people || []).length };
        if (dA.people && dA.people.length > 0) {
          people = dA.people;
          total = dA.pagination?.total_entries ?? null;
          attempt_used = 'A';
          attempt_reason = 'Domain + title filter';
        }
      } catch (e) {
        if (debug) debugInfo.attempt_a = { status: 'error', error: e.message };
      }
    }

    // ATTEMPT B: Domain only
    if (people.length === 0) {
      try {
        const dB = await apolloFetch('/v1/mixed_people/search', {
          q_organization_domains: cleanDomain,
          page: 1,
          per_page: 25
        });
        if (debug) debugInfo.attempt_b = { status: 'ok', total: dB.pagination?.total_entries ?? null, people_count: (dB.people || []).length };
        if (dB.people && dB.people.length > 0) {
          people = dB.people;
          total = dB.pagination?.total_entries ?? null;
          attempt_used = 'B';
          attempt_reason = 'Domain only, no title filter';
        }
      } catch (e) {
        if (debug) debugInfo.attempt_b = { status: 'error', error: e.message };
      }
    }

    // ATTEMPT C: Org search then people by org ID
    if (people.length === 0) {
      try {
        const orgD = await apolloFetch('/v1/mixed_companies/search', {
          q_organization_domains: cleanDomain,
          page: 1,
          per_page: 1
        });
        const orgs = orgD.organizations || orgD.accounts || [];
        if (debug) debugInfo.attempt_c_org = { orgs_found: orgs.length, org_name: orgs[0]?.name ?? null, org_id: orgs[0]?.id ?? null };

        if (orgs.length > 0) {
          const pD = await apolloFetch('/v1/mixed_people/search', {
            organization_ids: [orgs[0].id],
            page: 1,
            per_page: 25
          });
          if (debug) debugInfo.attempt_c_people = { total: pD.pagination?.total_entries ?? null, people_count: (pD.people || []).length };
          if (pD.people && pD.people.length > 0) {
            people = pD.people;
            total = pD.pagination?.total_entries ?? null;
            attempt_used = 'C';
            attempt_reason = 'Org ID lookup then people search';
          }
        }
      } catch (e) {
        if (debug) debugInfo.attempt_c = { status: 'error', error: e.message };
      }
    }

    // ATTEMPT D: People search by org name
    if (people.length === 0) {
      try {
        const orgName = cleanDomain.replace(/\.(com|io|co|net|org|us|app)$/i, '').replace(/[^a-zA-Z0-9]/g, ' ').trim();
        const dD = await apolloFetch('/v1/mixed_people/search', {
          q_organization_name: orgName,
          page: 1,
          per_page: 25
        });
        if (debug) debugInfo.attempt_d = { org_name_used: orgName, total: dD.pagination?.total_entries ?? null, people_count: (dD.people || []).length };
        if (dD.people && dD.people.length > 0) {
          people = dD.people;
          total = dD.pagination?.total_entries ?? null;
          attempt_used = 'D';
          attempt_reason = 'Org name from domain: ' + orgName;
        }
      } catch (e) {
        if (debug) debugInfo.attempt_d = { status: 'error', error: e.message };
      }
    }

    // BUILD RESPONSE
    return res.status(200).json({
      ok: people.length > 0,
      domain: cleanDomain,
      attempt_used: attempt_used || 'none',
      attempt_reason: attempt_reason || 'All attempts returned 0 people',
      people: people.map(function(p) {
        return {
          id: p.id,
          first_name: p.first_name || '',
          last_name: p.last_name || '',
          name: p.name || ((p.first_name || '') + ' ' + (p.last_name || '')).trim(),
          title: p.title || '',
          email: p.email || null,
          email_status: p.email_status || null,
          linkedin_url: p.linkedin_url || null,
          photo_url: p.photo_url || null,
          organization_name: p.organization_name || '',
          city: p.city || '',
          state: p.state || '',
          country: p.country || '',
          departments: p.departments || [],
          seniority: p.seniority || '',
          phone_numbers: p.phone_numbers || []
        };
      }),
      total: total,
      debug: debug ? debugInfo : undefined
    });

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
