// api/generate-docs.js
// Uses Grok API for document generation (no separate Anthropic API needed)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { job, profile, mode } = req.body;
  if (!job || !profile) return res.status(400).json({ error: 'Job and profile required' });

  const systems = {
    talent: "You are an elite talent agent. Output ONLY valid JSON with keys 'submission' (tailored actor submission, 3 paragraphs) and 'pitchEmail' (direct email to casting director). No markdown. No explanation.",
    ugc: "You are a top UGC talent manager. Output ONLY valid JSON with keys 'pitchEmail' (compelling brand pitch email, 3 paragraphs) and 'mediaKitSummary' (3-sentence creator highlight). No markdown. No explanation.",
    job: "You are an elite career strategist. Output ONLY valid JSON with keys 'resume' (tailored resume as plain text) and 'coverLetter' (compelling 3-paragraph cover letter). No markdown. No explanation."
  };

  const users = {
    talent: `ACTOR PROFILE:\nName: ${profile.name}\nUnion: ${profile.union || 'Non-Union'}\nBio: ${profile.bio}\nResume:\n${profile.actingResume}\n\nROLE:\n${job.title} at ${job.company}\n${job.fullDescription || job.description}`,
    ugc: `CREATOR PROFILE:\nName: ${profile.name}\nBio: ${profile.bio}\nRate: ${profile.rate || 'Negotiable'}\nStats: ${profile.mediaKit || 'Available on request'}\n\nOPPORTUNITY:\n${job.title} at ${job.company}\n${job.fullDescription || job.description}`,
    job: `RESUME:\n${profile.resume}\n\nJOB:\n${job.title} at ${job.company}\n${job.fullDescription || job.description}`
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'grok-3-latest',
        messages: [
          { role: 'system', content: systems[mode] || systems.job },
          { role: 'user', content: users[mode] || users.job }
        ],
        max_tokens: 2000,
        temperature: 0.3
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: 'Generation failed', details: err });
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || '';
    const clean = raw.replace(/```json|```/g, '').trim();

    let docs;
    try {
      docs = JSON.parse(clean);
    } catch(e) {
      docs = mode === 'ugc'
        ? { pitchEmail: raw, mediaKitSummary: '' }
        : mode === 'talent'
        ? { submission: raw, pitchEmail: '' }
        : { resume: raw, coverLetter: '' };
    }

    return res.status(200).json({ success: true, docs });

  } catch (error) {
    if (error.name === 'AbortError') {
      return res.status(504).json({ error: 'Timed out — try again' });
    }
    return res.status(500).json({ error: error.message });
  }
}
