// Job listings, read straight from job sites and turned into job cards.
// Read directly (they let other websites read them): Remotive, RemoteOK, Himalayas, Jobicy, Arbeitnow.
// Read through Unitex Helper: SEEK, LinkedIn, Indeed and Jora for your country.

// "web developer jobs part time remote in Melbourne" → { what: "web developer", where: "Melbourne" }
function jobParts(q) {
  const m = q.match(/^(.*?)\s+(?:in|near|around)\s+(.+?)(?:\s+\$[\d,k+]+)?$/i);
  const clean = s => s.replace(/\b(jobs?|careers?|vacanc(?:y|ies)|hiring|work|full[- ]time|part[- ]time|casual|contract|internship|remote|work from home|visa sponsorship|no experience needed|entry level|mid level|senior)\b/gi, " ").replace(/\$[\d,k+]+/g, " ").replace(/\s+/g, " ").trim();
  return { what: clean(m ? m[1] : q), where: m ? m[2].trim() : "", remote: /\b(remote|work from home)\b/i.test(q) };
}
// Work types in the search, in each job site's own filter: SEEK's worktype ids, LinkedIn's f_JT, Indeed's jt.
const WORK_TYPES = [["full time", 242, "F", "fulltime"], ["part time", 243, "P", "parttime"], ["contract", 244, "C", "contract"], ["casual", 245, null, "casual"], ["internship", null, "I", "internship"]];
// The job filters, filled into each job site's own search: experience and minimum salary too.
function jobChoices() {
  const v = typeof formState === "function" && topicId === "jobs" ? formState("jobs") : {};
  const sal = String(v.salary || "").toLowerCase().replace(/,/g, "");
  return { level: v.level || "", salary: sal ? (parseFloat(sal) || 0) * (/k/.test(sal) ? 1000 : 1) : 0, remote: (v.extras || []).some(x => /remote|home/i.test(x)) };
}
const workTypes = q => WORK_TYPES.filter(([w]) => new RegExp(`\\b${w.replace(" ", "[- ]?")}\\b`, "i").test(q));
const jobWords = q => jobParts(q).what.toLowerCase().split(/\s+/).filter(w => w.length > 2);
// Most of the search's words, as whole words: "java developer" doesn't match "JavaScript Developer", "art" doesn't match "Smart".
const jobMatches = (j, q) => {
  const ws = jobWords(q); if (!ws.length) return true;
  const t = `${j.title} ${j.card.company || ""} ${(j.tags || []).join(" ")}`.toLowerCase();
  const hits = ws.filter(w => new RegExp(`(^|[^a-z0-9])${w.replace(/(es|s)$/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(e?s)?(?![a-z0-9])`).test(t)).length;
  return hits >= Math.ceil(ws.length * 0.6);
};
// 90000, 110000 → "$90k–$110k"; 45, 50 → "$45–$50/hr"; US dollars say so outside the US.
const salaryText = (min, max, cur = "") => {
  if (!min && !max) return undefined;
  const hourly = Math.max(+min || 0, +max || 0) < 1000;
  const sym = cur === "USD" ? (regionId === "US" ? "$" : "US$") : cur && cur !== "AUD" ? `${cur} ` : "$";
  const one = n => n ? (hourly ? `${sym}${Math.round(+n * 100) / 100}` : `${sym}${Math.round(n / 1000)}k`) : "";
  return [one(min), one(max)].filter(Boolean).join("–") + (hourly ? "/hr" : "");
};
const jobCard = (o, via, site) => o.url && o.title && {
  title: o.title, url: o.url, image: o.logo, snippet: o.snippet, domain: (() => { try { return new URL(o.url).hostname.replace(/^www\./, ""); } catch { return ""; } })(), via, tags: o.tags,
  card: { kind: "job", role: o.title, company: o.company, location: o.location, salary: o.salary, worktype: o.worktype, posted: o.posted, site } };
const plainText = s => new DOMParser().parseFromString(s || "", "text/html").body.textContent.replace(/\s+/g, " ").trim();
async function jsonFrom(url, ms = 9000) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch (e) { throw new Error(e.name === "AbortError" ? "took too long" : /HTTP/.test(e.message) ? e.message : "blocked or offline"); }
  finally { clearTimeout(t); }
}

// ---------- job boards that let other websites read them ----------

const JOB_BOARDS = {
  remotive: { name: "Remotive (remote jobs)", async run(q) {
    const d = await jsonFrom(`https://remotive.com/api/remote-jobs?search=${encodeURIComponent(jobParts(q).what)}&limit=40`);
    return (d.jobs || []).map(j => jobCard({ title: j.title, url: j.url, company: j.company_name, logo: j.company_logo, location: j.candidate_required_location || "Remote", salary: j.salary || undefined,
      worktype: (j.job_type || "").replace(/_/g, " "), posted: j.publication_date, tags: j.tags }, "Remotive", "Remotive")).filter(Boolean);
  }},
  remoteok: { name: "RemoteOK", async run(q) {
    const tag = jobWords(q)[0] || "";
    const d = await jsonFrom(`https://remoteok.com/api${tag ? `?tag=${encodeURIComponent(tag)}` : ""}`);
    return (Array.isArray(d) ? d : []).filter(j => j.position).map(j => jobCard({ title: j.position, url: j.url || `https://remoteok.com/remote-jobs/${j.id}`, company: j.company, logo: j.company_logo || j.logo,
      location: j.location || "Remote", salary: salaryText(j.salary_min, j.salary_max, "USD"), worktype: "Remote", posted: j.date, tags: j.tags }, "RemoteOK", "RemoteOK")).filter(j => j && jobMatches(j, q)).slice(0, 30);
  }},
  himalayas: { name: "Himalayas (remote jobs)", async run(q) {
    const d = await jsonFrom(`https://himalayas.app/jobs/api/search?q=${encodeURIComponent(jobParts(q).what)}&limit=30`);
    return (d.jobs || []).map(j => jobCard({ title: j.title, url: j.applicationLink || (j.guid && /^https?:/.test(j.guid) ? j.guid : `https://himalayas.app/jobs`), company: j.companyName, logo: j.companyLogo,
      location: (j.locationRestrictions || []).join(", ") || "Remote", salary: salaryText(j.minSalary, j.maxSalary, j.currency), worktype: j.employmentType, posted: j.pubDate && new Date(j.pubDate * 1000).toISOString(), tags: j.categories }, "Himalayas", "Himalayas")).filter(Boolean);
  }},
  jobicy: { name: "Jobicy (remote jobs)", async run(q) {
    const d = await jsonFrom(`https://jobicy.com/api/v2/remote-jobs?count=30&tag=${encodeURIComponent(jobParts(q).what)}`);
    return (d.jobs || []).map(j => jobCard({ title: plainText(j.jobTitle), url: j.url, company: j.companyName, logo: j.companyLogo, location: j.jobGeo || "Remote",
      salary: salaryText(j.annualSalaryMin, j.annualSalaryMax, j.salaryCurrency), worktype: [].concat(j.jobType || [])[0], posted: j.pubDate, tags: [].concat(j.jobIndustry || []) }, "Jobicy", "Jobicy")).filter(Boolean);
  }},
  arbeitnow: { name: "Arbeitnow", async run(q) {
    const d = await jsonFrom("https://www.arbeitnow.com/api/job-board-api");
    return (d.data || []).map(j => jobCard({ title: j.title, url: j.url, company: j.company_name, location: j.remote ? `Remote${j.location ? " · " + j.location : ""}` : j.location,
      worktype: (j.job_types || [])[0], posted: j.created_at && new Date(j.created_at * 1000).toISOString(), tags: j.tags }, "Arbeitnow", "Arbeitnow")).filter(j => j && jobMatches(j, q));
  }},
};

// ---------- job sites read through Unitex Helper ----------

const slug = s => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const INDEED_HOSTS = { AU: "au.indeed.com", UK: "uk.indeed.com", US: "www.indeed.com", CA: "ca.indeed.com", NZ: "nz.indeed.com", "*": "www.indeed.com" };
const SEEK_HOSTS = { AU: "www.seek.com.au", NZ: "www.seek.co.nz" };
const JORA_HOSTS = { AU: "au.jora.com", NZ: "nz.jora.com" };
const textOfSel = (box, sel) => box.querySelector(sel)?.textContent.replace(/\s+/g, " ").trim() || undefined;

// Any object in the page's data that has a job title and a company is a job.
// The work type as the job site lists it: SEEK's workTypes, Indeed's job-types attributes, or a jobType field.
function jobTypeOf(o) {
  const list = [].concat(o.workTypes || [], o.workType || [], o.jobTypes || [], o.jobType || [], o.employmentType || [])
    .concat((o.taxonomyAttributes || []).filter(t => /job.?types?/i.test(t.label || "")).flatMap(t => (t.attributes || []).map(a => a.label)))
    .map(x => typeof x === "string" ? x : x?.label || x?.name || x?.description || "").filter(Boolean);
  return [...new Set(list)].join(", ") || undefined;
}
function jobsFromData(html, base, via, site, urlFor) {
  const out = [], seen = new Set();
  const blobs = [...html.matchAll(/(?:SEEK_REDUX_DATA|__INITIAL_STATE__|__NEXT_DATA__"[^>]*>|providerData\["mosaic-provider-jobcards"\])\s*=?\s*(\{[\s\S]*?\})\s*;?\s*(?:<\/script>|window\.)/g)].map(m => m[1]);
  for (const b of blobs) {
    let data; try { data = JSON.parse(b); } catch { continue; }
    walk(data, o => {
      const title = typeof o.title === "string" ? o.title : typeof o.displayTitle === "string" ? o.displayTitle : null;
      const company = o.advertiser?.description || o.companyName || (typeof o.company === "string" ? o.company : o.company?.name) || o.employer?.name;
      if (!title || !company || out.length > 40) return;
      const url = urlFor(o);
      if (!url || seen.has(url)) return;
      seen.add(url);
      out.push(jobCard({ title, url, company, logo: o.branding?.serpLogoUrl || o.companyBrandingAttributes?.logoUrl,
        location: o.location?.label || o.locations?.[0]?.label || o.formattedLocation || (typeof o.location === "string" ? o.location : undefined),
        salary: o.salaryLabel || o.salary?.label || (typeof o.salary === "string" ? o.salary : undefined) || o.salarySnippet?.text || o.extractedSalary && salaryText(o.extractedSalary.min, o.extractedSalary.max),
        worktype: jobTypeOf(o), posted: o.listingDate || o.pubDate }, via, site));
    });
  }
  return out.filter(Boolean);
}

const JOB_SITES = {
  seek: { name: "SEEK", domain: "seek.com.au", regions: ["AU", "NZ"], async run(q, { page: P = 0 } = {}) {
    const { what, where } = jobParts(q);
    const h = SEEK_HOSTS[regionId] || SEEK_HOSTS.AU;
    const wt = workTypes(q).map(w => w[1]).filter(Boolean);
    const f = jobChoices();
    const params = new URLSearchParams({ ...(wt.length ? { worktype: wt.join(",") } : {}), ...(f.salary ? { salaryrange: `${f.salary}-`, salarytype: "annual" } : {}), ...(P ? { page: P + 1 } : {}) }).toString();
    const url = `https://${h}/${what ? slug(what) + "-jobs" : "jobs"}${where ? `/in-${slug(where)}` : ""}${params ? "?" + params : ""}`;
    const res = await helperFetch(url);
    let jobs = jobsFromData(res.html, res.url, "SEEK", "SEEK", o => o.id && /^\d+$/.test(String(o.id)) && `https://${h}/job/${o.id}`);
    if (!jobs.length) {
      const doc = adFreeDoc(res.html);
      jobs = [...doc.querySelectorAll("article[data-card-type='JobCard'], article[data-automation='normalJob']")].map(a => {
        const link = a.querySelector("a[data-automation='jobTitle']");
        return link && jobCard({ title: link.textContent.trim(), url: unwrapLink(link.getAttribute("href"), res.url)?.replace(/\?.*$/, ""), company: textOfSel(a, "[data-automation='jobCompany']"),
          location: textOfSel(a, "[data-automation='jobLocation']"), salary: textOfSel(a, "[data-automation='jobSalary']"), posted: textOfSel(a, "[data-automation='jobListingDate']") }, "SEEK", "SEEK");
      }).filter(Boolean);
    }
    if (!jobs.length && botCheck(res.html)) throw new Error("asked for a bot check (open SEEK once yourself to clear it)");
    return jobs;
  }},
  linkedin: { name: "LinkedIn Jobs", domain: "linkedin.com/jobs", async run(q, { page: P = 0 } = {}) {
    const { what, where, remote } = jobParts(q);
    const loc = where || REGIONS.find(r => r.id === regionId)?.name || "";
    const res = await helperFetch(`https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(what)}&location=${encodeURIComponent(loc === "Worldwide" ? "" : loc)}${remote || jobChoices().remote ? "&f_WT=2" : ""}${workTypes(q).some(w => w[2]) ? "&f_JT=" + workTypes(q).map(w => w[2]).filter(Boolean).join("%2C") : ""}${{ "Entry level": "&f_E=1%2C2", "Mid level": "&f_E=3%2C4", Senior: "&f_E=4%2C5%2C6" }[jobChoices().level] || ""}&start=${P * 25}`);
    const doc = adFreeDoc(res.html);
    return [...doc.querySelectorAll(".base-card, .job-search-card")].map(c => {
      const a = c.querySelector("a.base-card__full-link, a[href*='/jobs/view/']");
      return a && jobCard({ title: textOfSel(c, ".base-search-card__title, h3"), url: a.getAttribute("href").split("?")[0], company: textOfSel(c, ".base-search-card__subtitle, h4"),
        logo: c.querySelector("img")?.getAttribute("data-delayed-url") || undefined, location: textOfSel(c, ".job-search-card__location"), salary: textOfSel(c, ".job-search-card__salary-info"),
        posted: c.querySelector("time")?.getAttribute("datetime") }, "LinkedIn", "LinkedIn");
    }).filter(Boolean);
  }},
  indeed: { name: "Indeed", domain: "indeed.com", async run(q, { page: P = 0 } = {}) {
    const { what, where } = jobParts(q);
    const h = INDEED_HOSTS[regionId] || INDEED_HOSTS["*"];
    const f = jobChoices();
    const jt = (workTypes(q).length === 1 ? `&jt=${workTypes(q)[0][3]}` : "") + ({ "Entry level": "&explvl=entry_level", "Mid level": "&explvl=mid_level", Senior: "&explvl=senior_level" }[f.level] || "")
      + (f.remote ? "&remotejob=032b3046-06a3-4876-8dfd-474eb5e7ed11" : "") + (f.salary ? `&salaryType=${encodeURIComponent("$" + f.salary.toLocaleString("en"))}` : "");
    const res = await helperFetch(`https://${h}/jobs?q=${encodeURIComponent(what)}&l=${encodeURIComponent(where)}${jt}${P ? `&start=${P * 10}` : ""}`);
    const jobs = jobsFromData(res.html, res.url, "Indeed", "Indeed", o => o.jobkey && `https://${h}/viewjob?jk=${o.jobkey}`);
    if (!jobs.length && botCheck(res.html)) throw new Error("asked for a bot check (open Indeed once yourself to clear it)");
    return jobs;
  }},
  jora: { name: "Jora", domain: "jora.com", regions: ["AU", "NZ"], async run(q, { page: P = 0 } = {}) {
    const { what, where } = jobParts(q);
    const h = JORA_HOSTS[regionId] || JORA_HOSTS.AU;
    const res = await helperFetch(`https://${h}/j?q=${encodeURIComponent(what)}&l=${encodeURIComponent(where)}${P ? `&p=${P + 1}` : ""}`);
    const doc = adFreeDoc(res.html);
    return [...doc.querySelectorAll(".job-card, article.result, [data-testid='job-card']")].map(c => {
      const a = c.querySelector(".job-title a, h2 a, a.job-link");
      return a && jobCard({ title: a.textContent.trim(), url: unwrapLink(a.getAttribute("href"), res.url)?.split("?")[0], company: textOfSel(c, ".job-company, .company"),
        location: textOfSel(c, ".job-location, .location"), snippet: textOfSel(c, ".job-abstract, .abstract, p"),
        worktype: textOfSel(c, ".job-type, .badge.-job-type, [class*='job-type'], [data-testid*='job-type']") || undefined, salary: textOfSel(c, ".badge.-salary, .salary"), posted: textOfSel(c, ".job-listed-date, .date") }, "Jora", "Jora");
    }).filter(Boolean);
  }},
};

// Which job sites put the work type in their own search address (see their run()).
const TYPE_SEARCHED = { seek: q => workTypes(q).length > 0 && workTypes(q).every(w => w[1]), linkedin: q => workTypes(q).length > 0 && workTypes(q).every(w => w[2]), indeed: q => workTypes(q).length === 1 };
// Which of the other filters each job site puts in its own search address (see their run()).
const FILTERS_SEARCHED = { seek: { salary: true }, linkedin: { remote: true, level: true }, indeed: { remote: true, level: true, salary: true } };
// Boards that only list remote jobs, even when a job's place says "Worldwide" or "Europe".
const REMOTE_BOARDS = new Set(["remotive", "remoteok", "himalayas", "jobicy"]);
// The job readers for this country: helper ones only with Unitex Helper.
function jobSourcesFor() {
  // Local job sites first (SEEK, LinkedIn, Indeed, Jora), then the remote-job boards.
  const out = {};
  for (const [id, s] of Object.entries(JOB_SITES)) {
    if (s.regions && regionId !== "*" && !s.regions.includes(regionId)) continue;
    // These sites searched the place themselves (Broadbeach is on the Gold Coast), so their places are trusted.
    // SEEK, LinkedIn and Indeed were asked for the work type too (worktype=, f_JT=, jt=), so theirs only has that work type.
    // The same goes for remote, experience and minimum salary: a job that doesn't say so itself still matched the site's filter.
    out["jobsite_" + id] = { ...s, paged: true, enabled: () => !!helperVersion(), run: async (q, o) => {
      const f = jobChoices(), asked = FILTERS_SEARCHED[id] || {};
      const searched = { placeSearched: !!jobParts(q).where, typeSearched: !!TYPE_SEARCHED[id]?.(q),
        remoteSearched: !!asked.remote && (f.remote || (id === "linkedin" && jobParts(q).remote)), levelSearched: !!asked.level && !!f.level, salarySearched: !!asked.salary && !!f.salary };
      return (await s.run(q, o)).map(j => ({ ...j, card: { ...j.card, ...searched } }));
    } };
  }
  for (const [id, s] of Object.entries(JOB_BOARDS)) out["jobs_" + id] = REMOTE_BOARDS.has(id) ? { ...s, run: async (q, o) => (await s.run(q, o)).map(j => ({ ...j, card: { ...j.card, remote: true } })) } : s;
  return out;
}
