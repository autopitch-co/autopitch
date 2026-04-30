// api/generate-docs.js
// Uses Grok API for document generation

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { job, profile, mode } = req.body;
  if (!job || !profile) return res.status(400).json({ error: 'Job and profile required' });

  const systems = {
    talent: "You are an elite talent agent. Output ONLY valid JSON with exactly these keys: 'submission' (tailored actor submission, 3 paragraphs) and 'pitchEmail' (direct email to casting director). No markdown. No explanation. Just raw JSON.",
    ugc: "You are a top UGC talent manager. Output ONLY valid JSON with exactly these keys: 'pitchEmail' (compelling brand pitch email, 3 paragraphs) and 'mediaKitSummary' (3-sentence creator highlight). No markdown. No explanation. Just raw JSON.",
    job: "You are an elite career strategist. Output ONLY valid JSON with exactly these keys: 'resume' (tailored resume as plain text) and 'coverLetter' (compelling 3-paragraph cover letter). No markdown. No explanation. Just raw JSON."
  };

  const users = {
    talent: `ACTOR PROFILE:\nName: ${profile.name || 'Actor'}\nUnion: ${profile.union || 'Non-Union'}\nBio: ${profile.bio || ''}\nResume:\n${profile.actingResume || ''}\n\nROLE:\n${job.title} at ${job.company}\n${(job.fullDescription || job.description || '').slice(0, 1000)}`,
    ugc: `CREATOR PROFILE:\nName: ${profile.name || 'Creator'}\nBio: ${profile.bio || ''}\nRate: ${profile.rate || 'Negotiable'}\nStats: ${profile.mediaKit || 'Available on request'}\n\nOPPORTUNITY:\n${job.title} at ${job.company}\n${(job.fullDescription || job.description || '').slice(0, 1000)}`,
    job: `RESUME:\n${profile.resume || 'No resume provided'}\n\nJOB:\n${job.title} at ${job.company}\n${(job.fullDescription || job.description || '').slice(0, 1000)}`
  };

  // Try multiple Grok model names
  const models = ['grok-3-latest', 'grok-3', 'grok-2-latest', 'grok-2', 'grok-beta'];
  
  let lastError = null;

  for (const model of models) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      const response = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.GROK_API_KEY}`
        },
        body: JSON.stringify({
          model,
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

      const responseText = await response.text();
      console.log(`Model ${model} status:`, response.status);

      if (!response.ok) {
        lastError = `${model}: ${response.status} - ${responseText}`;
        continue; // Try next model
      }

      const data = JSON.parse(responseText);
      const raw = data.choices?.[0]?.message?.content || '';
      const clean = raw.replace(/```json|```/g, '').trim();

      let docs;
      try {
        docs = JSON.parse(clean);
      } catch(e) {
        // Return raw content if JSON parse fails
        docs = mode === 'ugc'
          ? { pitchEmail: raw, mediaKitSummary: 'See pitch email above.' }
          : mode === 'talent'
          ? { submission: raw, pitchEmail: raw }
          : { resume: raw, coverLetter: raw };
      }

      return res.status(200).json({ success: true, docs, model });

    } catch (error) {
      if (error.name === 'AbortError') {
        lastError = `${model}: timed out`;
        continue;
      }
      lastError = `${model}: ${error.message}`;
      continue;
    }
  }

  // All models failed
  return res.status(500).json({ 
    error: 'All Grok models failed', 
    details: lastError,
    success: false 
  });
}
