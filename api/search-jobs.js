export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const {
    query = 'jobs',
    location = 'United States',
    remote = 'false',
    employment_type = '',
    date_posted = 'all',
    page = '1',
    mode = 'job'
  } = req.query;

  if (mode === 'ugc') {
    return handleUgcSearch(req, res, { query, remote });
  }

  // Standard job/talent search via JSearch
  let searchQuery = query;
  if (remote === 'true') searchQuery += ' remote';
  if (location && remote !== 'true') searchQuery += ` in ${location}`;

  const params = new URLSearchParams({
    query: searchQuery, page, num_pages: '1', country: 'us', date_posted,
  });
  if (employment_type) {
    const typeMap = { 'FULL_TIME':'FULLTIME','PART_TIME':'PARTTIME','CONTRACT':'CONTRACTOR','INTERN':'INTERN' };
    params.append('employment_types', typeMap[employment_type] || employment_type);
  }

  try {
    const response = await fetch(`https://jsearch.p.rapidapi.com/search?${params.toString()}`, {
      headers: {
        'X-RapidAPI-Key': process.env.JSEARCH_API_KEY,
        'X-RapidAPI-Host': 'jsearch.p.rapidapi.com'
      }
    });
    if (!response.ok) {
      const error = await response.text();
      return res.status(response.status).json({ error: 'Job search failed', details: error });
    }
    const data = await response.json();
    const jobs = transformJSearch(data.data || []);
    return res.status(200).json({ success: true, count: jobs.length, jobs, query: searchQuery });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

// ── UGC MULTI-SOURCE SEARCH ───────────────────────────────────────────────────

async function handleUgcSearch(req, res, { query, remote }) {
  const keywords = query || 'UGC creator brand deal';

  // Run all sources in parallel
  const [jsearchResults, upworkResults, serpResults] = await Promise.allSettled([
    searchJSearchUgc(keywords, remote === 'true'),
    searchUpwork(keywords),
    searchSerpUgc(keywords),
  ]);

  let jobs = [];

  if (jsearchResults.status === 'fulfilled') jobs.push(...jsearchResults.value);
  if (upworkResults.status === 'fulfilled') jobs.push(...upworkResults.value);
  if (serpResults.status === 'fulfilled') jobs.push(...serpResults.value);

  // Deduplicate by title+company
  const seen = new Set();
  jobs = jobs.filter(j => {
    const key = `${j.title}|${j.company}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return res.status(200).json({ success: true, count: jobs.length, jobs });
}

// JSearch with two parallel UGC-specific queries
async function searchJSearchUgc(keywords, isRemote) {
  const queries = [
    `UGC creator ${keywords}${isRemote ? ' remote' : ''}`,
    `content creator brand deal ${keywords}${isRemote ? ' remote' : ''}`,
  ];

  const results = await Promise.allSettled(queries.map(q =>
    fetch(`https://jsearch.p.rapidapi.com/search?${new URLSearchParams({ query: q, page: '1', num_pages: '1', country: 'us', date_posted: 'month' })}`, {
      headers: { 'X-RapidAPI-Key': process.env.JSEARCH_API_KEY, 'X-RapidAPI-Host': 'jsearch.p.rapidapi.com' }
    }).then(r => r.json()).then(d => transformJSearch(d.data || []))
  ));

  return results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
}

// Upwork RSS feed (free, no API key)
async function searchUpwork(keywords) {
  try {
    const q = encodeURIComponent(`UGC creator ${keywords}`);
    const url = `https://www.upwork.com/ab/feed/jobs/rss?q=${q}&sort=recency&paging=0%3B20`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Autopitch/1.0)' }
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseUpworkRss(xml);
  } catch(e) {
    console.error('Upwork RSS error:', e.message);
    return [];
  }
}

function parseUpworkRss(xml) {
  const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
  return items.slice(0, 10).map((item, i) => {
    const get = (tag) => {
      const m = item.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`) )
                || item.match(new RegExp(`<${tag}[^>]*>([^<]*)<\\/${tag}>`));
      return m ? m[1].trim() : '';
    };
    const title = get('title');
    const desc = get('description').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const link = get('link');
    const pubDate = get('pubDate');
    return {
      id: `upwork_${i}_${Date.now()}`,
      title: title || 'UGC Creator Opportunity',
      company: 'Upwork Client',
      location: 'Remote',
      type: 'Freelance',
      remote: true,
      salary: extractBudget(desc),
      description: desc.slice(0, 500),
      fullDescription: desc,
      applyUrl: link,
      companyDomain: 'upwork.com',
      source: 'Upwork',
      postedAt: pubDate,
    };
  }).filter(j => j.title);
}

function extractBudget(text) {
  const m = text.match(/\$[\d,]+(?:\s*[-–]\s*\$[\d,]+)?(?:\s*\/\s*(?:hr|hour|project))?/i);
  return m ? m[0] : 'Not specified';
}

// Google SERP scrape for UGC platforms (Billo, Collabstr, Insense, etc.)
async function searchSerpUgc(keywords) {
  if (!process.env.SERPAPI_KEY && !process.env.SERPER_API_KEY) return [];

  try {
    const q = `UGC creator brand deal opportunity ${keywords} site:billo.app OR site:collabstr.com OR site:insense.pro OR site:joinbrands.com OR site:fiverr.com`;

    if (process.env.SERPER_API_KEY) {
      const res = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'X-API-KEY': process.env.SERPER_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q, num: 10 })
      });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.organic || []).map((r, i) => ({
        id: `serp_${i}_${Date.now()}`,
        title: r.title || 'UGC Opportunity',
        company: extractDomain(r.link),
        location: 'Remote',
        type: 'Freelance',
        remote: true,
        salary: 'Not specified',
        description: r.snippet || '',
        fullDescription: r.snippet || '',
        applyUrl: r.link,
        companyDomain: extractDomain(r.link),
        source: platformLabel(r.link),
      }));
    }
  } catch(e) {
    console.error('SERP error:', e.message);
  }
  return [];
}

function extractDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return 'Unknown'; }
}

function platformLabel(url) {
  if (url.includes('billo')) return 'Billo';
  if (url.includes('collabstr')) return 'Collabstr';
  if (url.includes('insense')) return 'Insense';
  if (url.includes('joinbrands')) return 'JoinBrands';
  if (url.includes('fiverr')) return 'Fiverr';
  if (url.includes('aspire')) return 'Aspire';
  return extractDomain(url);
}

// ── SHARED ────────────────────────────────────────────────────────────────────

function transformJSearch(data) {
  return data.map((job, index) => ({
    id: job.job_id || `job_${index}`,
    title: job.job_title || 'Unknown Title',
    company: job.employer_name || 'Unknown Company',
    location: job.job_city
      ? `${job.job_city}${job.job_state ? ', ' + job.job_state : ''}`
      : job.job_country || 'Location not specified',
    type: job.job_employment_type || 'Full-Time',
    remote: job.job_is_remote || false,
    salary: job.job_min_salary && job.job_max_salary
      ? `$${Math.round(job.job_min_salary/1000)}K–$${Math.round(job.job_max_salary/1000)}K`
      : 'Not specified',
    description: job.job_description ? job.job_description.slice(0, 500) + '...' : '',
    fullDescription: job.job_description || '',
    applyUrl: job.job_apply_link || '',
    companyDomain: job.employer_website
      ? job.employer_website.replace(/^https?:\/\//, '').replace(/\/.*$/, '') : '',
    companyLogo: job.employer_logo || '',
    postedAt: job.job_posted_at_datetime_utc || '',
    source: job.job_publisher || 'Job Board',
    applied: false,
    queued: false
  }));
}
