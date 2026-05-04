export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { job, profile, mode } = req.body;
  if (!job || !profile) return res.status(400).json({ error: 'Missing data' });

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

  const systemPrompt = systemPrompts[mode] || systemPrompts.job;
  const userPrompt = userContent[mode] || userContent.job;

  const parseResponse = (raw, m) => {
    let clean = raw.replace(/```json|```/gi, '').trim();
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (jsonMatch) clean = jsonMatch[0];
    try { return JSON.parse(clean); }
    catch(e) {
      return m === 'ugc' ? { pitchEmail: raw, mediaKitSummary: '' }
           : m === 'talent' ? { submission: raw, pitchEmail: '' }
           : { resume: raw, coverLetter: '' };
    }
  };

  // Try Claude (Anthropic) first
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 3000,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }]
        })
      });

      if (response.ok) {
        const data = await response.json();
        const raw = data.content?.[0]?.text || '';
        console.log('Claude success, raw preview:', raw.slice(0, 100));
        return res.status(200).json({ success: true, docs: parseResponse(raw, mode || 'job'), provider: 'claude' });
      }
      console.error('Claude failed:', response.status, await response.text().then(t => t.slice(0, 200)));
    } catch(e) {
      console.error('Claude error:', e.message);
    }
  }

  // Grok fallback
  if (process.env.GROK_API_KEY) {
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
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          max_tokens: 3000,
          temperature: 0.4
        })
      });

      if (response.ok) {
        const data = await response.json();
        const raw = data.choices?.[0]?.message?.content || '';
        console.log('Grok success, raw preview:', raw.slice(0, 100));
        return res.status(200).json({ success: true, docs: parseResponse(raw, mode || 'job'), provider: 'grok' });
      }
      console.error('Grok failed:', response.status);
    } catch(e) {
      console.error('Grok error:', e.message);
    }
  }

  return res.status(500).json({
    success: false,
    error: 'No AI provider available. Add ANTHROPIC_API_KEY or GROK_API_KEY in Vercel environment variables.'
  });
}
