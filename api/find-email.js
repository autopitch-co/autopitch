// api/find-email.js
// Vercel Serverless Function
// Finds hiring manager / brand contact / casting director emails
// Uses Hunter.io API

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { domain, company, name, role } = req.query;

  if (!domain && !company) {
    return res.status(400).json({ error: 'Domain or company name required' });
  }

  try {
    let targetDomain = domain;

    // If no domain provided, try to find it from company name
    if (!targetDomain && company) {
      // Clean company name to guess domain
      targetDomain = company
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .replace(/inc|llc|ltd|corp|company|co$/g, '')
        + '.com';
    }

    // Step 1: Domain search - find all emails at the company
    const domainSearchUrl = `https://api.hunter.io/v2/domain-search?domain=${targetDomain}&limit=10&api_key=${process.env.HUNTER_API_KEY}`;

    const domainResponse = await fetch(domainSearchUrl);
    const domainData = await domainResponse.json();

    if (domainData.errors) {
      return res.status(400).json({ error: domainData.errors[0].details });
    }

    const emails = domainData.data?.emails || [];
    const organization = domainData.data?.organization || company;

    // Step 2: If name provided, try email finder for specific person
    let specificEmail = null;
    if (name && targetDomain) {
      const nameParts = name.trim().split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts[nameParts.length - 1] || '';

      if (firstName && lastName) {
        const finderUrl = `https://api.hunter.io/v2/email-finder?domain=${targetDomain}&first_name=${firstName}&last_name=${lastName}&api_key=${process.env.HUNTER_API_KEY}`;
        const finderResponse = await fetch(finderUrl);
        const finderData = await finderResponse.json();

        if (finderData.data?.email) {
          specificEmail = {
            email: finderData.data.email,
            confidence: finderData.data.score,
            name: `${firstName} ${lastName}`,
            verified: finderData.data.sources?.length > 0
          };
        }
      }
    }

    // Step 3: Filter for decision makers — hiring, marketing, partnerships, casting
    const decisionMakerKeywords = [
      'hiring', 'talent', 'recruiter', 'hr', 'human resources',
      'partnership', 'brand', 'marketing', 'creator', 'influencer',
      'casting', 'director', 'manager', 'executive', 'vp', 'chief',
      'founder', 'owner', 'president', 'head'
    ];

    const decisionMakers = emails
      .filter(e => {
        const pos = (e.position || '').toLowerCase();
        const dept = (e.department || '').toLowerCase();
        return decisionMakerKeywords.some(k => pos.includes(k) || dept.includes(k));
      })
      .slice(0, 5)
      .map(e => ({
        email: e.value,
        name: `${e.first_name || ''} ${e.last_name || ''}`.trim(),
        position: e.position || '',
        department: e.department || '',
        confidence: e.confidence,
        verified: e.verification?.status === 'valid'
      }));

    // If no decision makers found, return top emails
    const fallbackEmails = emails.slice(0, 3).map(e => ({
      email: e.value,
      name: `${e.first_name || ''} ${e.last_name || ''}`.trim(),
      position: e.position || '',
      confidence: e.confidence,
      verified: e.verification?.status === 'valid'
    }));

    return res.status(200).json({
      success: true,
      domain: targetDomain,
      organization,
      specificContact: specificEmail,
      decisionMakers: decisionMakers.length > 0 ? decisionMakers : fallbackEmails,
      totalFound: emails.length,
      pattern: domainData.data?.pattern || null
    });

  } catch (error) {
    console.error('Find email error:', error);
    return res.status(500).json({ error: error.message });
  }
}
