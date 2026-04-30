export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { job, profile, mode } = req.body;
  if (!job || !profile) return res.status(400).json({ error: 'Missing data' });

  // Log key presence (not the value)
  console.log('GROK_API_KEY present:', !!process.env.GROK_API_KEY);
  console.log('GROK_API_KEY length:', process.env.GROK_API_KEY?.length);

  const systemPrompts = {
    ugc: "You are a UGC talent manager. Output ONLY a raw JSON object with keys 'pitchEmail' and 'mediaKitSummary'. No markdown, no backticks, no explanation.",
    talent: "You are a talent agent. Output ONLY a raw JSON object with keys 'submission' and 'pitchEmail'. No markdown, no backticks, no explanation.",
    job: "You are a career coach. Output ONLY a raw JSON object with keys 'resume' and 'coverLetter'. No markdown, no backticks, no explanation."
  };

  const userContent = {
    ugc: `Creator: ${profile.name}, Bio: ${profile.bio}, Rate: ${profile.rate || 'negotiable'}, Stats: ${profile.mediaKit || 'n/a'}. Opportunity: ${job.title} at ${job.company}. Description: ${(job.description||'').slice(0,600)}`,
    talent: `Actor: ${profile.name}, Union: ${profile.union||'non-union'}, Bio: ${profile.bio}, Resume: ${(profile.actingResume||'').slice(0,400)}. Role: ${job.title} at ${job.company}. ${(job.description||'').slice(0,600)}`,
    job: `Resume: ${(profile.resume||'').slice(0,800)}. Job: ${job.title} at ${job.company}. ${(job.description||'').slice(0,600)}`
  };

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
          { role: 'system', content: systemPrompts[mode] || systemPrompts.job },
          { role: 'user', content: userContent[mode] || userContent.job }
        ],
        max_tokens: 1500,
        temperature: 0.4
      })
    });

    const responseText = await response.text();
    console.log('Grok status:', response.status);
    console.log('Grok response preview:', responseText.slice(0, 300));

    if (!response.ok) {
      return res.status(500).json({ 
        success: false, 
        error: `Grok API error ${response.status}`,
        details: responseText.slice(0, 500)
      });
    }

    const data = JSON.parse(responseText);
    const raw = data.choices?.[0]?.message?.content || '';
    console.log('Raw content:', raw.slice(0, 200));

    // Clean and parse JSON
    let clean = raw.replace(/```json|```/gi, '').trim();
    // Find JSON object in response
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (jsonMatch) clean = jsonMatch[0];

    let docs;
    try {
      docs = JSON.parse(clean);
    } catch(e) {
      // Fallback - wrap raw in appropriate keys
      const m = mode || 'job';
      docs = m === 'ugc' ? { pitchEmail: raw, mediaKitSummary: '' }
           : m === 'talent' ? { submission: raw, pitchEmail: '' }
           : { resume: raw, coverLetter: '' };
    }

    return res.status(200).json({ success: true, docs });

  } catch (error) {
    console.error('Generate error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
