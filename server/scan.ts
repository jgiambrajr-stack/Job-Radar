import { ADAPTERS } from './adapters.ts'
import { loadCompanies, loadCriteria, type Company } from './config.ts'
import { db, logRun, now, upsertJobs, type IncomingJob } from './db.ts'
import { matchLocation, matchTitle, tagsFor } from './filter.ts'

export type ScanResult = { company: string; fetched: number; matched: number; new: number; error?: string }

const COOLDOWN_MS = 6 * 3600_000

/** A feed that just rate-limited us gets left alone for a while; retrying only extends the block. */
function cooldownUntil(company: string): Date | null {
  const last = db
    .prepare("SELECT error, finished_at FROM runs WHERE company = ? AND (error IS NULL OR error NOT LIKE 'Rate limited%') ORDER BY id DESC LIMIT 1")
    .get(company) as { error: string | null; finished_at: string } | undefined
  if (!last?.error || !/^(403|429)\b/.test(last.error)) return null
  const until = new Date(new Date(last.finished_at).getTime() + COOLDOWN_MS)
  return until.getTime() > Date.now() ? until : null
}

export async function scanCompany(c: Company, opts: { ignoreCooldown?: boolean } = {}): Promise<ScanResult> {
  const started = now()
  const until = opts.ignoreCooldown ? null : cooldownUntil(c.name)
  if (until) {
    const error = `Rate limited, retrying after ${until.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
    logRun({ started_at: started, source: c.adapter, company: c.name, found: 0, new_count: 0, error })
    return { company: c.name, fetched: 0, matched: 0, new: 0, error }
  }
  const criteria = loadCriteria()
  try {
    const raw = await ADAPTERS[c.adapter](c)
    const matched: IncomingJob[] = raw
      .filter((j) => matchTitle(j.title, criteria) && matchLocation(j.location, j.remote, criteria))
      .map((j) => ({ ...j, company: c.name, source: c.adapter, tags: tagsFor(j.title, criteria) }))
    const inserted = upsertJobs(matched)
    logRun({ started_at: started, source: c.adapter, company: c.name, found: matched.length, new_count: inserted })
    return { company: c.name, fetched: raw.length, matched: matched.length, new: inserted }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    logRun({ started_at: started, source: c.adapter, company: c.name, found: 0, new_count: 0, error })
    return { company: c.name, fetched: 0, matched: 0, new: 0, error }
  }
}

/** Runs every enabled company that has an API adapter. claude-browse companies are left to the Claude routine. */
export async function scanAll() {
  const companies = loadCompanies().filter((c) => c.enabled && ADAPTERS[c.adapter])
  return Promise.all(companies.map(scanCompany))
}
