import { useState, useCallback } from "react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const MODES = { JOB: "job", UGC: "ugc", TALENT: "talent" };
const VIEWS = { SEARCH: "search", PROFILE: "profile", QUEUE: "queue", OUTREACH: "outreach" };

const WORK_TYPES = ["Remote", "Hybrid", "On-Site"];
const JOB_TYPES = ["Full-Time", "Part-Time", "Contract", "Freelance"];
const INDUSTRIES = ["Sports & NIL", "Real Estate", "Business Development", "Marketing", "Media & Entertainment", "Finance", "Tech", "Consulting"];
const SALARY_RANGES = ["Any", "$40k–$60k", "$60k–$80k", "$80k–$100k", "$100k–$130k", "$130k–$160k", "$160k+"];
const UGC_NICHES = ["Lifestyle", "Sports & Fitness", "Tech & Gadgets", "Fashion & Beauty", "Food & Travel", "Gaming", "Finance", "Automotive", "Health & Wellness"];
const CASTING_TYPES = ["Film", "TV", "Commercial", "Theater", "Voice Acting", "Modeling", "Music Video", "Digital"];

// ─── API CALLS ────────────────────────────────────────────────────────────────

// Search real jobs via JSearch
const searchJobs = async (filters, mode) => {
  try {
    let query = filters.keywords || "jobs";
    if (mode === MODES.UGC) query = `UGC creator ${filters.keywords || "brand deals content creator"}`;
    if (mode === MODES.TALENT) query = `casting ${filters.keywords || "actor actress talent"}`;

    const params = new URLSearchParams({
      query,
      location: filters.location || "United States",
      remote: filters.workType.includes("Remote") ? "true" : "false",
      date_posted: "month",
      page: "1"
    });

    if (filters.jobType.length) params.append("employment_type", filters.jobType[0].toUpperCase().replace("-", "_"));

    const res = await fetch(`/api/search-jobs?${params.toString()}`);
    const data = await res.json();

    if (!data.success) throw new Error(data.error);
    return data.jobs || [];
  } catch (err) {
    console.error("Job search error:", err);
    return [];
  }
};

// Find hiring manager email via Hunter.io
const findEmail = async (company, domain) => {
  try {
    const params = new URLSearchParams({ company, domain: domain || "" });
    const res = await fetch(`/api/find-email?${params.toString()}`);
    const data = await res.json();
    if (!data.success) return null;
    return data.decisionMakers?.[0] || null;
  } catch (err) {
    console.error("Find email error:", err);
    return null;
  }
};

// Find contact via Grok (fallback)
const findContact = async (company, mode) => {
  try {
    const res = await fetch("/api/find-contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company, mode })
    });
    const data = await res.json();
    if (!data.success) return null;
    return data.contact || null;
  } catch (err) {
    console.error("Find contact error:", err);
    return null;
  }
};

// Generate docs via Claude
const generateDocs = async (job, profile, mode) => {
  const systemPrompt = mode === MODES.TALENT
    ? `You are an elite talent agent. Given an actor profile and casting opportunity, output ONLY JSON with keys "submission" (tailored actor submission note) and "pitchEmail" (direct email to casting director). No markdown.`
    : mode === MODES.UGC
    ? `You are a top UGC talent manager. Given a creator profile and brand opportunity, output ONLY JSON with keys "pitchEmail" (compelling brand pitch) and "mediaKitSummary" (3-sentence creator highlight). No markdown.`
    : `You are an elite career strategist. Given a resume and job description, output ONLY JSON with keys "resume" (tailored resume) and "coverLetter" (compelling cover letter). No markdown.`;

  const userPrompt = mode === MODES.TALENT
    ? `ACTOR PROFILE:\n${JSON.stringify(profile)}\n\nROLE:\n${job.title} at ${job.company}\n${job.description}`
    : mode === MODES.UGC
    ? `CREATOR PROFILE:\n${JSON.stringify(profile)}\n\nOPPORTUNITY:\n${job.title} at ${job.company}\n${job.description}`
    : `RESUME:\n${profile.resume}\n\nJOB:\n${job.title} at ${job.company}\n${job.description}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }]
      })
    });
    const data = await res.json();
    const raw = data.content?.map(b => b.text || "").join("").trim();
    const clean = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch (err) {
    console.error("Generate docs error:", err);
    return null;
  }
};

// ─── STYLES ───────────────────────────────────────────────────────────────────
const S = {
  app: { minHeight: "100vh", background: "#06060f", color: "#ddd8cc", fontFamily: "'DM Mono', monospace", display: "flex", flexDirection: "column" },
  header: { background: "linear-gradient(135deg, #0d0d1f 0%, #06060f 100%)", borderBottom: "1px solid #1a1a2e", padding: "14px 24px", display: "flex", alignItems: "center", gap: "16px" },
  logoIcon: { width: 36, height: 36, background: "linear-gradient(135deg, #d4a843, #f0c060)", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", color: "#06060f", fontWeight: "900", fontFamily: "serif" },
  logoText: { fontSize: "20px", fontWeight: "800", color: "#f0c060", fontFamily: "serif", letterSpacing: "-0.5px" },
  logoSub: { fontSize: "9px", color: "#44445a", letterSpacing: "3px", textTransform: "uppercase" },
  modeBtn: (active, color) => ({ padding: "6px 14px", borderRadius: "6px", border: `1px solid ${active ? color : "#1a1a2e"}`, background: active ? color + "18" : "transparent", color: active ? color : "#44445a", fontSize: "11px", fontWeight: "700", cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }),
  nav: { display: "flex", gap: "0", background: "#0a0a18", borderBottom: "1px solid #1a1a2e", padding: "0 24px" },
  navBtn: (active) => ({ padding: "10px 18px", background: "none", border: "none", borderBottom: `2px solid ${active ? "#d4a843" : "transparent"}`, color: active ? "#d4a843" : "#44445a", fontSize: "11px", fontWeight: "700", letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer", fontFamily: "inherit" }),
  body: { display: "flex", flex: 1, overflow: "hidden" },
  sidebar: { width: "260px", minWidth: "260px", background: "#0a0a18", borderRight: "1px solid #1a1a2e", padding: "16px", overflowY: "auto" },
  main: { flex: 1, overflowY: "auto", padding: "20px" },
  label: { fontSize: "9px", color: "#44445a", letterSpacing: "2px", textTransform: "uppercase", display: "block", marginBottom: "5px", marginTop: "14px" },
  input: { width: "100%", padding: "8px 10px", background: "#0d0d1f", border: "1px solid #1a1a2e", borderRadius: "5px", color: "#ddd8cc", fontSize: "12px", fontFamily: "inherit", outline: "none", boxSizing: "border-box" },
  textarea: { width: "100%", padding: "10px", background: "#0d0d1f", border: "1px solid #1a1a2e", borderRadius: "5px", color: "#ddd8cc", fontSize: "11px", fontFamily: "'Courier New', monospace", outline: "none", resize: "vertical", boxSizing: "border-box", lineHeight: "1.6" },
  btn: (v = "primary") => ({ padding: v === "sm" ? "4px 10px" : "9px 18px", background: v === "primary" ? "linear-gradient(135deg, #d4a843, #f0c060)" : v === "danger" ? "transparent" : "#0d0d1f", border: v === "primary" ? "none" : v === "danger" ? "1px solid #4a1a1a" : "1px solid #1a1a2e", borderRadius: "5px", color: v === "primary" ? "#06060f" : v === "danger" ? "#e06c6c" : "#88889a", fontSize: v === "sm" ? "10px" : "12px", fontWeight: v === "primary" ? "800" : "600", cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }),
  tag: (active, color = "#d4a843") => ({ padding: "3px 8px", borderRadius: "20px", border: `1px solid ${active ? color : "#1a1a2e"}`, background: active ? color + "18" : "transparent", color: active ? color : "#44445a", fontSize: "10px", cursor: "pointer", transition: "all 0.15s" }),
  card: (highlight) => ({ background: highlight ? "#0d1a0d" : "#0d0d1f", border: `1px solid ${highlight ? "#2a4a2a" : "#1a1a2e"}`, borderRadius: "8px", padding: "14px", marginBottom: "10px", cursor: "pointer", transition: "all 0.2s" }),
  badge: (color) => ({ padding: "2px 7px", borderRadius: "3px", fontSize: "9px", fontWeight: "700", letterSpacing: "1px", background: color + "22", color, border: `1px solid ${color}44` }),
  pre: { background: "#0a0a18", border: "1px solid #1a1a2e", borderRadius: "6px", padding: "14px", color: "#b8b4ac", fontSize: "11px", lineHeight: "1.7", whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "'Courier New', monospace", maxHeight: "350px", overflowY: "auto", margin: 0 },
  spinner: { width: 20, height: 20, border: "2px solid #1a1a2e", borderTop: "2px solid #d4a843", borderRadius: "50%", animation: "spin 0.8s linear infinite" }
};

function Chip({ label, options, selected, onToggle, color = "#d4a843" }) {
  return (
    <div>
      <span style={S.label}>{label}</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
        {options.map(o => <span key={o} style={S.tag(selected.includes(o), color)} onClick={() => onToggle(o)}>{o}</span>)}
      </div>
    </div>
  );
}

export default function AutopitchApp() {
  const [mode, setMode] = useState(MODES.JOB);
  const [view, setView] = useState(VIEWS.SEARCH);
  const [profile, setProfile] = useState({ name: "", email: "", resume: "", bio: "", niche: [], followerRange: "", platforms: [], rate: "", actingResume: "", headshot: "", union: "" });
  const [filters, setFilters] = useState({ keywords: "", location: "", workType: [], jobType: [], industry: [], salary: "Any", castingType: [] });
  const toggleFilter = (key, val) => setFilters(f => ({ ...f, [key]: f[key].includes(val) ? f[key].filter(x => x !== val) : [...f[key], val] }));

  const [jobs, setJobs] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [queue, setQueue] = useState([]);
  const [outreach, setOutreach] = useState([]);
  const [generatedDocs, setGeneratedDocs] = useState({});
  const [generating, setGenerating] = useState({});
  const [findingEmail, setFindingEmail] = useState({});
  const [processing, setProcessing] = useState(false);
  const [processLog, setProcessLog] = useState([]);
  const [copyMsg, setCopyMsg] = useState({});

  const log = (msg, type = "info") => setProcessLog(p => [...p, { msg, type, time: new Date().toLocaleTimeString() }]);

  const modeColor = mode === MODES.JOB ? "#d4a843" : mode === MODES.UGC ? "#e07ad4" : "#8a7ad4";

  const runSearch = async () => {
    setSearching(true);
    setSelectedJob(null);
    setJobs([]);
    try {
      const results = await searchJobs(filters, mode);
      setJobs(results);
    } catch (e) {
      console.error(e);
    } finally {
      setSearching(false);
    }
  };

  const handleFindEmail = async (job) => {
    setFindingEmail(f => ({ ...f, [job.id]: true }));
    try {
      let contact = await findEmail(job.company, job.companyDomain);
      if (!contact) contact = await findContact(job.company, mode);
      if (contact) {
        setJobs(j => j.map(jj => jj.id === job.id ? { ...jj, contact: contact.email, contactName: contact.name, contactTitle: contact.title } : jj));
        if (selectedJob?.id === job.id) setSelectedJob(s => ({ ...s, contact: contact.email, contactName: contact.name, contactTitle: contact.title }));
      }
    } catch (e) { console.error(e); }
    finally { setFindingEmail(f => ({ ...f, [job.id]: false })); }
  };

  const handleGenerateDocs = async (job) => {
    setGenerating(g => ({ ...g, [job.id]: true }));
    try {
      const docs = await generateDocs(job, profile, mode);
      if (docs) setGeneratedDocs(d => ({ ...d, [job.id]: docs }));
    } catch (e) { console.error(e); }
    finally { setGenerating(g => ({ ...g, [job.id]: false })); }
  };

  const addToQueue = (job) => {
    if (!queue.find(q => q.id === job.id)) setQueue(q => [...q, { ...job, status: "pending" }]);
  };

  const removeFromQueue = (id) => setQueue(q => q.filter(j => j.id !== id));

  const processQueue = async () => {
    if (!queue.length) return;
    setProcessing(true);
    setProcessLog([]);
    log(`Starting batch — ${queue.length} opportunities`, "start");

    for (let i = 0; i < queue.length; i++) {
      const job = queue[i];
      log(`[${i + 1}/${queue.length}] Processing: ${job.title} @ ${job.company}`, "info");
      setQueue(q => q.map(j => j.id === job.id ? { ...j, status: "processing" } : j));

      try {
        if (!job.contact) {
          log(`Finding contact for ${job.company}...`, "info");
          let contact = await findEmail(job.company, job.companyDomain);
          if (!contact) contact = await findContact(job.company, mode);
          if (contact) {
            setQueue(q => q.map(j => j.id === job.id ? { ...j, contact: contact.email, contactName: contact.name } : j));
            job.contact = contact.email;
            job.contactName = contact.name;
          }
        }

        log(`Generating tailored documents...`, "info");
        const docs = await generateDocs(job, profile, mode);
        if (docs) {
          setGeneratedDocs(d => ({ ...d, [job.id]: docs }));
          setOutreach(o => [...o, {
            id: job.id, job: job.title, company: job.company,
            contact: job.contact || "No email found",
            contactName: job.contactName || "",
            docs, status: "ready", date: new Date().toLocaleDateString()
          }]);
          log(`Done — docs generated, outreach ready`, "success");
          setQueue(q => q.map(j => j.id === job.id ? { ...j, status: "done" } : j));
        }
        await new Promise(r => setTimeout(r, 600));
      } catch (e) {
        log(`Failed for ${job.title}`, "error");
        setQueue(q => q.map(j => j.id === job.id ? { ...j, status: "failed" } : j));
      }
    }
    log(`Batch complete — ${queue.length} processed`, "start");
    setProcessing(false);
  };

  const copy = async (text, key) => {
    await navigator.clipboard.writeText(text);
    setCopyMsg(m => ({ ...m, [key]: true }));
    setTimeout(() => setCopyMsg(m => ({ ...m, [key]: false })), 1800);
  };

  const docKeys = mode === MODES.TALENT
    ? [{ k: "submission", label: "Actor Submission" }, { k: "pitchEmail", label: "Direct Pitch Email" }]
    : mode === MODES.UGC
    ? [{ k: "pitchEmail", label: "Brand Pitch Email" }, { k: "mediaKitSummary", label: "Media Kit Summary" }]
    : [{ k: "resume", label: "Tailored Resume" }, { k: "coverLetter", label: "Cover Letter" }];

  return (
    <div style={S.app}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>

      {/* HEADER */}
      <div style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={S.logoIcon}>AP</div>
          <div><div style={S.logoText}>Autopitch</div><div style={S.logoSub}>AI Application Engine</div></div>
        </div>
        <div style={{ display: "flex", gap: "6px", marginLeft: "16px" }}>
          {[{ m: MODES.JOB, label: "💼 Jobs", color: "#d4a843" }, { m: MODES.UGC, label: "🎯 UGC", color: "#e07ad4" }, { m: MODES.TALENT, label: "🎬 Casting", color: "#8a7ad4" }].map(({ m, label, color }) => (
            <button key={m} style={S.modeBtn(mode === m, color)} onClick={() => { setMode(m); setJobs([]); setSelectedJob(null); }}>{label}</button>
          ))}
        </div>
        {queue.length > 0 && (
          <div style={{ marginLeft: "auto", background: "#d4a84322", border: "1px solid #d4a843", borderRadius: "20px", padding: "3px 12px", fontSize: "11px", color: "#d4a843", fontWeight: "700" }}>
            {queue.length} queued
          </div>
        )}
      </div>

      {/* NAV */}
      <div style={S.nav}>
        {[{ v: VIEWS.SEARCH, label: "Search" }, { v: VIEWS.PROFILE, label: "Profile" }, { v: VIEWS.QUEUE, label: `Queue (${queue.length})` }, { v: VIEWS.OUTREACH, label: `Outreach (${outreach.length})` }].map(n => (
          <button key={n.v} style={S.navBtn(view === n.v)} onClick={() => setView(n.v)}>{n.label}</button>
        ))}
      </div>

      <div style={S.body}>

        {/* ── SEARCH VIEW ── */}
        {view === VIEWS.SEARCH && (
          <>
            {/* Sidebar */}
            <div style={S.sidebar}>
              <div style={{ fontSize: "9px", color: "#44445a", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "10px" }}>Filters</div>
              <span style={S.label}>Keywords</span>
              <input style={S.input} placeholder={mode === MODES.TALENT ? "actor, commercial, voice..." : mode === MODES.UGC ? "fitness, lifestyle, UGC..." : "NIL, BD, marketing..."} value={filters.keywords} onChange={e => setFilters(f => ({ ...f, keywords: e.target.value }))} />
              {mode === MODES.JOB && <>
                <span style={S.label}>Location</span>
                <input style={S.input} placeholder="City, State" value={filters.location} onChange={e => setFilters(f => ({ ...f, location: e.target.value }))} />
                <Chip label="Work Type" options={WORK_TYPES} selected={filters.workType} onToggle={v => toggleFilter("workType", v)} color="#5aaa8a" />
                <Chip label="Job Type" options={JOB_TYPES} selected={filters.jobType} onToggle={v => toggleFilter("jobType", v)} />
                <Chip label="Industry" options={INDUSTRIES} selected={filters.industry} onToggle={v => toggleFilter("industry", v)} color="#d4a843" />
              </>}
              {mode === MODES.UGC && <Chip label="Niche" options={UGC_NICHES} selected={filters.industry} onToggle={v => toggleFilter("industry", v)} color="#e07ad4" />}
              {mode === MODES.TALENT && <Chip label="Casting Type" options={CASTING_TYPES} selected={filters.castingType} onToggle={v => toggleFilter("castingType", v)} color="#8a7ad4" />}
              <div style={{ marginTop: "16px" }}>
                <button style={{ ...S.btn("primary"), width: "100%", marginBottom: "6px" }} onClick={runSearch} disabled={searching}>
                  {searching ? "Searching..." : `⚡ Search ${mode === MODES.TALENT ? "Castings" : mode === MODES.UGC ? "Brand Deals" : "Jobs"}`}
                </button>
                {jobs.length > 0 && (
                  <button style={{ ...S.btn(), width: "100%", fontSize: "10px" }} onClick={() => { const ids = new Set(queue.map(j => j.id)); setQueue(q => [...q, ...jobs.filter(j => !ids.has(j.id)).map(j => ({ ...j, status: "pending" }))]); }}>
                    + Add All to Queue
                  </button>
                )}
              </div>
            </div>

            {/* Results */}
            <div style={{ width: "300px", minWidth: "300px", overflowY: "auto", padding: "16px", borderRight: "1px solid #1a1a2e" }}>
              {searching ? (
                <div style={{ textAlign: "center", padding: "60px 0", color: "#44445a" }}>
                  <div style={{ ...S.spinner, margin: "0 auto 12px" }} />
                  <div style={{ fontSize: "12px", animation: "pulse 1.5s infinite" }}>Searching real listings...</div>
                </div>
              ) : jobs.length === 0 ? (
                <div style={{ textAlign: "center", padding: "60px 0", color: "#2a2a40", fontSize: "12px" }}>Set filters and search</div>
              ) : (
                <>
                  <div style={{ fontSize: "9px", color: "#44445a", marginBottom: "10px", letterSpacing: "1px" }}>{jobs.length} LIVE RESULTS</div>
                  {jobs.map(job => (
                    <div key={job.id} style={{ ...S.card(selectedJob?.id === job.id), border: `1px solid ${selectedJob?.id === job.id ? modeColor : "#1a1a2e"}` }} onClick={() => setSelectedJob(job)}>
                      <div style={{ fontSize: "12px", fontWeight: "700", color: "#ddd8cc", marginBottom: "3px" }}>{job.title}</div>
                      <div style={{ fontSize: "11px", color: "#6666aa", marginBottom: "6px" }}>{job.company}</div>
                      <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
                        {job.remote && <span style={S.badge("#5aaa8a")}>Remote</span>}
                        <span style={S.badge(modeColor)}>{job.type || "Full-Time"}</span>
                        {job.salary !== "Not specified" && <span style={{ fontSize: "10px", color: "#44445a" }}>{job.salary}</span>}
                      </div>
                      {job.source && <div style={{ fontSize: "9px", color: "#2a2a40", marginTop: "4px" }}>via {job.source}</div>}
                      {queue.find(q => q.id === job.id) && <div style={{ fontSize: "9px", color: "#d4a843", marginTop: "4px" }}>✓ Queued</div>}
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* Detail */}
            <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
              {!selectedJob ? (
                <div style={{ textAlign: "center", padding: "80px 0", color: "#2a2a40", fontSize: "12px" }}>Select an opportunity to view details</div>
              ) : (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                    <div>
                      <h2 style={{ margin: "0 0 4px", fontSize: "20px", color: "#ddd8cc" }}>{selectedJob.title}</h2>
                      <div style={{ color: "#6666aa", fontSize: "13px", marginBottom: "8px" }}>{selectedJob.company}</div>
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        {selectedJob.remote && <span style={S.badge("#5aaa8a")}>Remote</span>}
                        <span style={S.badge(modeColor)}>{selectedJob.type}</span>
                        {selectedJob.salary !== "Not specified" && <span style={S.badge("#d4a843")}>{selectedJob.salary}</span>}
                        {selectedJob.location && <span style={S.badge("#88889a")}>{selectedJob.location}</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "6px", flexDirection: "column", alignItems: "flex-end" }}>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button style={S.btn()} onClick={() => addToQueue(selectedJob)}>
                          {queue.find(q => q.id === selectedJob.id) ? "✓ Queued" : "+ Queue"}
                        </button>
                        <button style={S.btn("primary")} onClick={() => { addToQueue(selectedJob); handleGenerateDocs(selectedJob); }}>
                          ⚡ Generate Now
                        </button>
                      </div>
                      {!selectedJob.contact ? (
                        <button style={{ ...S.btn(), fontSize: "10px" }} onClick={() => handleFindEmail(selectedJob)} disabled={findingEmail[selectedJob.id]}>
                          {findingEmail[selectedJob.id] ? "Finding..." : "🔍 Find Contact Email"}
                        </button>
                      ) : (
                        <div style={{ fontSize: "11px", color: "#5aaa8a" }}>
                          ✓ {selectedJob.contactName && `${selectedJob.contactName} — `}{selectedJob.contact}
                        </div>
                      )}
                    </div>
                  </div>

                  {selectedJob.applyUrl && (
                    <div style={{ marginBottom: "16px" }}>
                      <a href={selectedJob.applyUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "11px", color: "#d4a843", textDecoration: "none" }}>
                        View Original Listing →
                      </a>
                    </div>
                  )}

                  <div style={{ fontSize: "9px", color: "#44445a", letterSpacing: "1px", marginBottom: "8px" }}>DESCRIPTION</div>
                  <p style={{ color: "#9994aa", fontSize: "12px", lineHeight: "1.8", marginBottom: "24px" }}>{selectedJob.fullDescription || selectedJob.description}</p>

                  {generating[selectedJob.id] && (
                    <div style={{ textAlign: "center", padding: "30px", color: "#d4a843" }}>
                      <div style={{ ...S.spinner, margin: "0 auto 10px" }} />
                      <div style={{ fontSize: "12px" }}>Generating tailored documents...</div>
                    </div>
                  )}

                  {generatedDocs[selectedJob.id] && !generating[selectedJob.id] && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                      {docKeys.map(({ k, label }) => generatedDocs[selectedJob.id][k] && (
                        <div key={k}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                            <span style={{ fontSize: "9px", color: modeColor, letterSpacing: "1px", textTransform: "uppercase" }}>{label}</span>
                            <button style={S.btn("sm")} onClick={() => copy(generatedDocs[selectedJob.id][k], k + selectedJob.id)}>
                              {copyMsg[k + selectedJob.id] ? "✓" : "Copy"}
                            </button>
                          </div>
                          <pre style={S.pre}>{generatedDocs[selectedJob.id][k]}</pre>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {/* ── PROFILE VIEW ── */}
        {view === VIEWS.PROFILE && (
          <div style={S.main}>
            <div style={{ maxWidth: "680px" }}>
              <h2 style={{ fontSize: "18px", marginBottom: "4px" }}>
                {mode === MODES.TALENT ? "Actor Profile" : mode === MODES.UGC ? "Creator Profile" : "Your Resume"}
              </h2>
              <p style={{ color: "#44445a", fontSize: "12px", marginBottom: "20px" }}>Your master profile — used to generate tailored documents for every application.</p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                {[["name", "Full Name"], ["email", "Email"]].map(([k, l]) => (
                  <div key={k}><span style={S.label}>{l}</span><input style={S.input} value={profile[k]} onChange={e => setProfile(p => ({ ...p, [k]: e.target.value }))} placeholder={l} /></div>
                ))}
              </div>

              {mode === MODES.JOB && <>
                <span style={S.label}>Bio (for cold emails)</span>
                <textarea style={S.textarea} rows={2} value={profile.bio} onChange={e => setProfile(p => ({ ...p, bio: e.target.value }))} placeholder="2-3 sentence professional summary..." />
                <span style={S.label}>Master Resume *</span>
                <textarea style={S.textarea} rows={20} value={profile.resume} onChange={e => setProfile(p => ({ ...p, resume: e.target.value }))} placeholder={"EXPERIENCE\nCompany | Title | Dates\n- Achievement\n\nEDUCATION\n...\n\nSKILLS\n..."} />
              </>}

              {mode === MODES.UGC && <>
                <span style={S.label}>Handle (@)</span>
                <input style={S.input} value={profile.handle || ""} onChange={e => setProfile(p => ({ ...p, handle: e.target.value }))} placeholder="@yourhandle" />
                <span style={S.label}>Base Rate</span>
                <input style={S.input} value={profile.rate} onChange={e => setProfile(p => ({ ...p, rate: e.target.value }))} placeholder="e.g. $500/video" />
                <span style={S.label}>Creator Bio</span>
                <textarea style={S.textarea} rows={4} value={profile.bio} onChange={e => setProfile(p => ({ ...p, bio: e.target.value }))} placeholder="Who you are, your niche, why brands love working with you..." />
                <span style={S.label}>Media Kit / Stats</span>
                <textarea style={S.textarea} rows={4} value={profile.mediaKit || ""} onChange={e => setProfile(p => ({ ...p, mediaKit: e.target.value }))} placeholder="Avg engagement: 4.2%&#10;Past partners: Nike, Red Bull&#10;Monthly reach: 2.3M..." />
              </>}

              {mode === MODES.TALENT && <>
                <span style={S.label}>Union Status</span>
                <input style={S.input} value={profile.union} onChange={e => setProfile(p => ({ ...p, union: e.target.value }))} placeholder="SAG-AFTRA, Non-Union, Eligible" />
                <span style={S.label}>Bio / About</span>
                <textarea style={S.textarea} rows={3} value={profile.bio} onChange={e => setProfile(p => ({ ...p, bio: e.target.value }))} placeholder="Type, range, special skills, training..." />
                <span style={S.label}>Acting Resume</span>
                <textarea style={S.textarea} rows={14} value={profile.actingResume} onChange={e => setProfile(p => ({ ...p, actingResume: e.target.value }))} placeholder={"FILM\nRole | Project | Director\n\nTV\n...\n\nTRAINING\n...\n\nSKILLS\n..."} />
              </>}
            </div>
          </div>
        )}

        {/* ── QUEUE VIEW ── */}
        {view === VIEWS.QUEUE && (
          <div style={S.main}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div>
                <h2 style={{ fontSize: "18px", margin: "0 0 4px" }}>Queue</h2>
                <p style={{ color: "#44445a", fontSize: "12px", margin: 0 }}>Batch process overnight — generates docs and finds contact emails for every opportunity</p>
              </div>
              {queue.length > 0 && !processing && (
                <button style={S.btn("primary")} onClick={processQueue}>⚡ Process All ({queue.length})</button>
              )}
              {processing && <div style={{ color: "#d4a843", fontSize: "12px", display: "flex", alignItems: "center", gap: "8px" }}><div style={S.spinner} />Processing...</div>}
            </div>

            {queue.length === 0 ? (
              <div style={{ textAlign: "center", padding: "80px 0", color: "#2a2a40", fontSize: "12px" }}>Queue is empty. Search and add opportunities.</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                {queue.map(job => (
                  <div key={job.id} style={{ ...S.card(false), border: `1px solid ${job.status === "done" ? "#2a4a2a" : job.status === "processing" ? "#4a4a0a" : job.status === "failed" ? "#4a1a1a" : "#1a1a2e"}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontSize: "12px", fontWeight: "700", marginBottom: "2px" }}>{job.title}</div>
                        <div style={{ fontSize: "11px", color: "#6666aa" }}>{job.company}</div>
                        {job.contact && <div style={{ fontSize: "10px", color: "#5aaa8a", marginTop: "4px" }}>✓ {job.contact}</div>}
                      </div>
                      <span style={S.badge(job.status === "done" ? "#5aaa8a" : job.status === "processing" ? "#d4a843" : job.status === "failed" ? "#e06c6c" : "#44445a")}>
                        {job.status === "done" ? "Done" : job.status === "processing" ? "Working..." : job.status === "failed" ? "Failed" : "Pending"}
                      </span>
                    </div>
                    <div style={{ marginTop: "10px", display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                      <button style={S.btn("danger")} onClick={() => removeFromQueue(job.id)}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {processLog.length > 0 && (
              <div style={{ marginTop: "20px" }}>
                <div style={{ fontSize: "9px", color: "#44445a", letterSpacing: "2px", marginBottom: "6px" }}>PROCESS LOG</div>
                <div style={{ background: "#0a0a18", border: "1px solid #1a1a2e", borderRadius: "6px", padding: "12px", maxHeight: "200px", overflowY: "auto" }}>
                  {processLog.map((l, i) => (
                    <div key={i} style={{ fontSize: "11px", color: l.type === "success" ? "#5aaa8a" : l.type === "error" ? "#e06c6c" : l.type === "start" ? "#d4a843" : "#66667a", marginBottom: "3px", fontFamily: "monospace" }}>
                      <span style={{ color: "#2a2a40", marginRight: "6px" }}>[{l.time}]</span>{l.msg}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── OUTREACH VIEW ── */}
        {view === VIEWS.OUTREACH && (
          <div style={S.main}>
            <h2 style={{ fontSize: "18px", marginBottom: "4px" }}>Outreach</h2>
            <p style={{ color: "#44445a", fontSize: "12px", marginBottom: "20px" }}>Generated documents and emails ready to send</p>

            {outreach.length === 0 ? (
              <div style={{ textAlign: "center", padding: "80px 0", color: "#2a2a40", fontSize: "12px" }}>No outreach yet. Process your queue to generate.</div>
            ) : outreach.map(e => (
              <div key={e.id} style={{ ...S.card(false), marginBottom: "14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: "700", marginBottom: "2px" }}>{e.job}</div>
                    <div style={{ fontSize: "11px", color: "#6666aa" }}>{e.company}</div>
                    {e.contact !== "No email found" && <div style={{ fontSize: "10px", color: "#5aaa8a", marginTop: "4px" }}>To: {e.contactName ? `${e.contactName} — ` : ""}{e.contact}</div>}
                  </div>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button style={S.btn("sm")} onClick={() => copy(Object.values(e.docs).join("\n\n---\n\n"), "all" + e.id)}>
                      {copyMsg["all" + e.id] ? "✓" : "Copy All"}
                    </button>
                    {e.contact !== "No email found" && (
                      <a href={`mailto:${e.contact}?subject=Re: ${e.job}&body=${encodeURIComponent(e.docs.coverLetter || e.docs.pitchEmail || e.docs.submission || "")}`}
                        style={{ ...S.btn("primary"), textDecoration: "none", fontSize: "10px", padding: "4px 10px" }}>
                        Open in Mail
                      </a>
                    )}
                  </div>
                </div>
                {docKeys.map(({ k, label }) => e.docs[k] && (
                  <div key={k} style={{ marginBottom: "10px" }}>
                    <div style={{ fontSize: "9px", color: modeColor, letterSpacing: "1px", marginBottom: "4px" }}>{label}</div>
                    <pre style={{ ...S.pre, maxHeight: "120px" }}>{e.docs[k]}</pre>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
