// api/search-jobs.js
// Vercel Serverless Function
// Searches real job listings via JSearch (RapidAPI)
// Covers: Indeed, LinkedIn, Glassdoor, ZipRecruiter, Google Jobs

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const {
    query = 'developer jobs',
    location = 'United States',
    remote = 'false',
    employment_type = '',
    date_posted = 'all',
    page = '1'
  } = req.query;

  // Build search query
  let searchQuery = query;
  if (remote === 'true') searchQuery += ' remote';
  if (location && remote !== 'true') searchQuery += ` in ${location}`;

  const params = new URLSearchParams({
    query: searchQuery,
    page: page,
    num_pages: '1',
    country: 'us',
    date_posted: date_posted,
  });

  if (employment_type) params.append('employment_types', employment_type);

  try {
    const response = await fetch(
      `https://jsearch.p.rapidapi.com/search?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          'X-RapidAPI-Key': process.env.JSEARCH_API_KEY,
          'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('JSearch error:', error);
      return res.status(response.status).json({ error: 'Job search failed', details: error });
    }

    const data = await response.json();

    // Transform JSearch results into Autopitch format
    const jobs = (data.data || []).map((job, index) => ({
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
        : job.job_salary_currency ? 'Salary available' : 'Not specified',
      description: job.job_description ? job.job_description.slice(0, 500) + '...' : '',
      fullDescription: job.job_description || '',
      applyUrl: job.job_apply_link || '',
      companyDomain: job.employer_website
        ? job.employer_website.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
        : '',
      companyLogo: job.employer_logo || '',
      postedAt: job.job_posted_at_datetime_utc || '',
      source: job.job_publisher || 'Job Board',
      match: Math.floor(Math.random() * 20) + 75, // 75-95% match score
      applied: false,
      queued: false
    }));

    return res.status(200).json({
      success: true,
      count: jobs.length,
      jobs,
      query: searchQuery
    });

  } catch (error) {
    console.error('Search jobs error:', error);
    return res.status(500).json({ error: error.message });
  }
}
