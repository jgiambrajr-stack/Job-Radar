import type { Company } from './config.ts'

export type RawJob = {
  title: string
  url: string
  location?: string | null
  remote?: boolean
  posted_at?: string | null
  description_snippet?: string | null
  salary?: string | null
}

// Queries for ATSs that search server-side. Greenhouse/Ashby/Lever return every job, so we filter locally.
const QUERIES = ['product designer', 'ux designer', 'interaction designer', 'design engineer', 'design systems']
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36'

async function getJson(url: string, init: RequestInit = {}) {
  const res = await fetch(url, { ...init, headers: { 'User-Agent': UA, Accept: 'application/json', ...init.headers }, signal: AbortSignal.timeout(20000) })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${new URL(url).host}`)
  return res.json() as Promise<any>
}

const strip = (html?: string | null) =>
  html ? html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&amp;|&#39;|&quot;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400) : null

const toIso = (v: unknown) => {
  if (v == null || v === '') return null
  const d = typeof v === 'number' ? new Date(v < 1e12 ? v * 1000 : v) : new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const dedupe = (jobs: RawJob[]) => [...new Map(jobs.map((j) => [j.url, j])).values()]

async function greenhouse(c: Company): Promise<RawJob[]> {
  const d = await getJson(`https://boards-api.greenhouse.io/v1/boards/${c.slug}/jobs`)
  return d.jobs.map((j: any) => ({
    title: j.title,
    url: j.absolute_url,
    location: j.location?.name,
    posted_at: toIso(j.first_published ?? j.updated_at),
  }))
}

async function ashby(c: Company): Promise<RawJob[]> {
  const d = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${c.slug}?includeCompensation=true`)
  return d.jobs
    .filter((j: any) => j.isListed !== false)
    .map((j: any) => ({
      title: j.title,
      url: j.jobUrl,
      location: [j.location, ...(j.secondaryLocations ?? []).map((s: any) => s.location)].filter(Boolean).join('; '),
      remote: j.workplaceType ? j.workplaceType === 'Remote' : j.isRemote === true,
      posted_at: toIso(j.publishedAt),
      salary: j.compensation?.scrapeableCompensationSalarySummary ?? j.compensation?.compensationTierSummary ?? null,
      description_snippet: j.descriptionPlain?.slice(0, 400) ?? null,
    }))
}

async function lever(c: Company): Promise<RawJob[]> {
  const d = await getJson(`https://api.lever.co/v0/postings/${c.slug}?mode=json`)
  return d.map((j: any) => ({
    title: j.text,
    url: j.hostedUrl,
    location: j.categories?.allLocations?.join('; ') ?? j.categories?.location,
    remote: j.workplaceType === 'remote',
    posted_at: toIso(j.createdAt),
    salary: j.salaryRange ? `${j.salaryRange.currency} ${j.salaryRange.min}-${j.salaryRange.max}` : null,
    description_snippet: j.descriptionPlain?.slice(0, 400) ?? null,
  }))
}

// url like https://adobe.wd5.myworkdayjobs.com/external_experienced (an optional /en-US/ segment is fine)
async function workday(c: Company): Promise<RawJob[]> {
  const u = new URL(c.url!)
  const tenant = u.hostname.split('.')[0]
  const site = u.pathname.split('/').filter((p) => p && !/^[a-z]{2}-[A-Z]{2}$/.test(p))[0]
  const api = `${u.origin}/wday/cxs/${tenant}/${site}/jobs`
  const out: RawJob[] = []
  for (const q of QUERIES) {
    for (let offset = 0; offset < 100; offset += 20) {
      const d = await getJson(api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appliedFacets: {}, limit: 20, offset, searchText: q }),
      })
      for (const j of d.jobPostings ?? []) {
        if (!j.externalPath) continue
        out.push({ title: j.title, url: `${u.origin}/${site}${j.externalPath}`, location: j.locationsText, remote: /remote/i.test(j.locationsText ?? '') })
      }
      if ((d.jobPostings ?? []).length < 20) break
    }
  }
  return dedupe(out)
}

async function amazon(): Promise<RawJob[]> {
  const out: RawJob[] = []
  for (const q of QUERIES) {
    const d = await getJson(`https://www.amazon.jobs/en/search.json?base_query=${encodeURIComponent(q)}&country=USA&result_limit=100&sort=recent`)
    for (const j of d.jobs ?? []) {
      out.push({
        title: j.title.trim(),
        url: `https://www.amazon.jobs${j.job_path}`,
        location: j.normalized_location ?? j.location,
        remote: /virtual|remote/i.test(`${j.location} ${j.normalized_location}`),
        posted_at: toIso(j.posted_date),
        description_snippet: strip(j.description_short ?? j.description),
      })
    }
  }
  return dedupe(out)
}

// Eightfold (Netflix, Microsoft). Tenants use either /api/pcsx/search (Microsoft) or /api/apply/v2/jobs (Netflix),
// set per company as `api` in companies.json. It rate-limits hard, so: two broad queries, sequential, paced.
async function eightfold(c: Company): Promise<RawJob[]> {
  const base = new URL(c.url!).origin
  const out: RawJob[] = []
  const queries = ['designer', 'design engineer']
  for (const [i, q] of queries.entries()) {
    if (i) await sleep(3000)
    const query = `domain=${c.slug}&query=${encodeURIComponent(q)}&start=0&num=50`
    const positions: any[] =
      c.api === 'v2'
        ? ((await getJson(`${base}/api/apply/v2/jobs?${query}`)).positions ?? [])
        : ((await getJson(`${base}/api/pcsx/search?${query}`)).data?.positions ?? [])
    for (const p of positions) {
      const locs: string[] = p.standardizedLocations?.length ? p.standardizedLocations : (p.locations ?? [p.location])
      const link = p.canonicalPositionUrl ?? p.positionUrl ?? `/careers/job/${p.id}`
      out.push({
        title: p.name ?? p.posting_name,
        url: link.startsWith('http') ? link : `${base}${link}`,
        location: locs.filter(Boolean).join('; '),
        remote: /remote/i.test(`${p.workLocationOption ?? p.work_location_option ?? ''} ${locs.join(' ')}`),
        posted_at: toIso(p.postedTs ?? p.t_create),
      })
    }
  }
  return dedupe(out)
}

// iCIMS Jibe career sites (GitHub, DocuSign). url is the career site root that job pages hang off.
async function jibe(c: Company): Promise<RawJob[]> {
  const root = c.url!.replace(/\/$/, '')
  const origin = new URL(root).origin
  const out: RawJob[] = []
  for (const q of QUERIES) {
    const d = await getJson(`${origin}/api/jobs?keywords=${encodeURIComponent(q)}&page=1&limit=100`)
    for (const { data: j } of d.jobs ?? []) {
      out.push({
        title: j.title,
        url: `${root}/jobs/${j.slug}`,
        location: j.full_location ?? j.location_name,
        remote: /remote/i.test(`${j.location_type} ${j.full_location}`) || j.location_type === 'ANY',
        posted_at: toIso(j.posted_date),
        description_snippet: strip(j.description),
      })
    }
  }
  return dedupe(out.filter((j) => j.title))
}

export const ADAPTERS: Record<string, (c: Company) => Promise<RawJob[]>> = { greenhouse, ashby, lever, workday, amazon, eightfold, jibe }
