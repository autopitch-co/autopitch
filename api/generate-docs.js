export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { job, profile, mode } = req.body;
  if (!job || !profile) return res.status(400).json({ error: 'Missing data' });

  // Log key presence (not the value)
  console.log('GROK_API_KEY present:', !!process.env.GROK_API_KEY);
  console.log('GROK_API_KEY length:', process.env.GROK_API_KEY?.length);

  const systemPrompts = {
    ugc: `You are a top UGC talent manager. Write compelling, personalized outreach for creators.
Output ONLY a raw JSON object with exactly two keys: 'pitchEmail' and 'mediaKitSummary'.
- pitchEmail: A short, punchy cold email (150-200 words) that references the specific brand/opportunity, highlights the creator's niche and stats, and ends with a clear CTA. Use the creator's name. Sound human, not corporate.
- mediaKitSummary: A 3-4 sentence highlight reel of the creator's best stats, past brand partners, and content style. Make it easy to copy-paste into a media kit.
No markdown, no backticks, no explanation. Raw JSON only.`,

    talent: `You are a seasoned talent agent submitting actors for roles.
Output ONLY a raw JSON object with exactly two keys: 'submission' and 'pitchEmail'.
- submission: A professional actor submission (100-150 words) that matches the actor's type and credits to the specific role. Highlight union status, relevant experience, and special skills.
- pitchEmail: A brief, professional email to the casting director (120-160 words) that sells the actor for this specific project. Reference the project/role by name.
No markdown, no backticks, no explanation. Raw JSON only.`,

    job: `You are an expert career coach and resume writer.
Output ONLY a raw JSON object with exactly two keys: 'resume' and 'coverLetter'.
- resume: A fully tailored, ATS-optimized resume rewritten to match this specific job posting. Reorder and reword bullet points to mirror the job description's keywords. Keep all real experience but emphasize what's most relevant. Use clean formatting with sections: SUMMARY, EXPERIENCE, EDUCATION, SKILLS.
- coverLetter: A compelling, personalized cover letter (250-300 words) that opens with a strong hook, connects 2-3 specific achievements from the resume to the job's needs, and closes with confidence. Address it to the hiring team at the company. Do NOT use generic phrases like "I am writing to express my interest."
No markdown, no backticks, no explanation. Raw JSON only.`
  };

  const userContent = {
    ugc: `Creator profile — Name: ${profile.name || 'Creator'}, Bio: ${profile.bio || 'n/a'}, Rate: ${profile.rate || 'negotiable'}, Stats/Media Kit: ${profile.mediaKit || 'n/a'}.
Brand opportunity — ${job.title} at ${job.company}. ${(job.fullDescription || job.description || '').slice(0, 1200)}`,

    talent: `Actor profile — Name: ${profile.name || 'Actor'}, Union: ${profile.union || 'non-union'}, Bio/Type/Skills: ${profile.bio || 'n/a'}, Credits: ${(profile.actingResume || '').slice(0, 1500)}.
Role/Project — ${job.title} at ${job.company}. ${(job.fullDescription || job.description || '').slice(0, 1000)}`,

    job: `Candidate resume:
${(profile.resume || '').slice(0, 4000)}

${profile.bio ? `Professional summary: ${profile.bio}` : ''}

Target job — ${job.title} at ${job.company}.
Job description: ${(job.fullDescription || job.description || '').slice(0, 1500)}`
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
        max_tokens: 3000,
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
