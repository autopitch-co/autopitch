// api/find-contact.js
// Vercel Serverless Function
// Uses Grok to find brand contacts, casting directors, hiring managers
// Fallback when Hunter.io doesn't have the email

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { company, role, mode } = req.body;

  if (!company) return res.status(400).json({ error: 'Company name required' });

  // Build the right search prompt based on mode
  let prompt = '';

  if (mode === 'ugc') {
    prompt = `Find the name, job title, and email address of the person who handles influencer partnerships, UGC content, brand deals, or creator collaborations at ${company}. Search for their LinkedIn profile, company website, or any public sources. Return ONLY a JSON object with fields: name, title, email, confidence (high/medium/low), source. If you cannot find a specific email, provide the most likely email format based on the company domain.`;
  } else if (mode === 'talent') {
    prompt = `Find the name, job title, and contact email of the casting director or talent acquisition contact at ${company}. This could be a casting agency, production company, or studio. Search LinkedIn, IMDbPro, or their official website. Return ONLY a JSON object with fields: name, title, email, confidence (high/medium/low), source. If you cannot find a specific email, provide the most likely contact method.`;
  } else {
    prompt = `Find the name, job title, and email address of the hiring manager or talent acquisition director at ${company}${role ? ' for a ' + role + ' position' : ''}. Search LinkedIn, the company website careers page, or any public sources. Return ONLY a JSON object with fields: name, title, email, confidence (high/medium/low), source. If you cannot find a specific email, provide the most likely email format based on the company domain.`;
  }

  try {
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'grok-3-latest',
        messages: [
          {
            role: 'system',
            content: 'You are a research assistant that finds professional contact information from public sources. Always return valid JSON only. Never make up emails - if unsure, provide a confidence level of low and explain what you found.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 500,
        temperature: 0.1
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Grok error:', error);
      return res.status(response.status).json({ error: 'Contact search failed', details: error });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '{}';

    // Parse the JSON response from Grok
    let contact = {};
    try {
      const clean = content.replace(/```json|```/g, '').trim();
      contact = JSON.parse(clean);
    } catch (e) {
      // If JSON parsing fails, return the raw content
      contact = { raw: content, confidence: 'low' };
    }

    return res.status(200).json({
      success: true,
      company,
      mode,
      contact,
      source: 'grok'
    });

  } catch (error) {
    console.error('Find contact error:', error);
    return res.status(500).json({ error: error.message });
  }
}
