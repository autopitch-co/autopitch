// api/find-email.js
// Vercel Serverless Function
// Finds hiring manager / brand contact / casting director emails
// Uses Hunter.io API with fast timeout

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { domain, company } = req.query;

  if (!domain && !company) {
    return res.status(400).json({ error: 'Domain or company name required' });
  }

  try {
    let targetDomain = domain;

    // If no domain, guess from company name
    if (!targetDomain && company) {
      targetDomain = company
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .trim()
        .split(' ')[0] + '.com';
    }

    // Use AbortController for timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    const url = `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(targetDomain)}&limit=5&api_key=${process.env.HUNTER_API_KEY}`;
    
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      return res.status(200).json({ 
        success: true,
        domain: targetDomain,
        decisionMakers: [],
        message: 'No results found'
      });
    }

    const data = await response.json();
    const emails = data.data?.emails || [];

    // Filter for decision makers
    const keywords = ['hiring', 'talent', 'recruiter', 'hr', 'partnership', 'brand', 'marketing', 'creator', 'casting', 'director', 'manager', 'founder', 'owner', 'president', 'head', 'vp', 'chief'];

    let decisionMakers = emails
      .filter(e => {
        const pos = (e.position || '').toLowerCase();
        const dept = (e.department || '').toLowerCase();
        return keywords.some(k => pos.includes(k) || dept.includes(k));
      })
      .slice(0, 3)
      .map(e => ({
        email: e.value,
        name: `${e.first_name || ''} ${e.last_name || ''}`.trim(),
        title: e.position || '',
        confidence: e.confidence,
      }));

    // Fallback to any emails found
    if (!decisionMakers.length) {
      decisionMakers = emails.slice(0, 2).map(e => ({
        email: e.value,
        name: `${e.first_name || ''} ${e.last_name || ''}`.trim(),
        title: e.position || '',
        confidence: e.confidence,
      }));
    }

    return res.status(200).json({
      success: true,
      domain: targetDomain,
      organization: data.data?.organization || company,
      decisionMakers,
      totalFound: emails.length
    });

  } catch (error) {
    if (error.name === 'AbortError') {
      return res.status(200).json({ 
        success: false, 
        error: 'Request timed out',
        decisionMakers: []
      });
    }
    console.error('Find email error:', error);
    return res.status(200).json({ 
      success: false, 
      error: error.message,
      decisionMakers: []
    });
  }
}
