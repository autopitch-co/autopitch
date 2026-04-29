// api/find-contact.js
// Grok fallback for finding contacts when Hunter.io fails

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { company, mode } = req.body;
  if (!company) return res.status(400).json({ error: 'Company name required' });

  const prompts = {
    ugc: `Find the name, title, and email of the influencer partnerships or UGC contact at ${company}. Return ONLY JSON: {"name":"","title":"","email":"","confidence":"low/medium/high"}`,
    talent: `Find the casting director or talent contact email at ${company}. Return ONLY JSON: {"name":"","title":"","email":"","confidence":"low/medium/high"}`,
    job: `Find the hiring manager or recruiter email at ${company}. Return ONLY JSON: {"name":"","title":"","email":"","confidence":"low/medium/high"}`
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'grok-3-latest',
        messages: [
          { role: 'system', content: 'Return ONLY valid JSON. No markdown. No explanation.' },
          { role: 'user', content: prompts[mode] || prompts.job }
        ],
        max_tokens: 200,
        temperature: 0.1
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || '{}';
    const clean = raw.replace(/```json|```/g, '').trim();
    const contact = JSON.parse(clean);

    return res.status(200).json({ success: true, company, contact, source: 'grok' });

  } catch (error) {
    if (error.name === 'AbortError') {
      return res.status(200).json({ success: false, error: 'Timed out', contact: null });
    }
    return res.status(200).json({ success: false, error: error.message, contact: null });
  }
}
