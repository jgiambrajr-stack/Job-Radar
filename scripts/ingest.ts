// Reads data/inbox/*.json (written by the Claude routine), applies the same filters, and upserts.
// Each file: { "source": "linkedin" | "claude-browse", "jobs": [{ company, title, url, location?, remote?, posted_at?, salary?, description_snippet?, fit_score?, fit_notes? }] }
// Processed files move to data/inbox/done/.
import { mkdirSync, readdirSync, readFileSync, renameSync } from 'node:fs'
import path from 'node:path'
import { loadCompanies, loadCriteria } from '../server/config.ts'
import { ROOT, logRun, now, upsertJobs, type IncomingJob } from '../server/db.ts'
import { matchLocation, matchTitle, tagsFor } from '../server/filter.ts'

const inbox = path.join(ROOT, 'data', 'inbox')
const done = path.join(inbox, 'done')
mkdirSync(done, { recursive: true })
const criteria = loadCriteria()
const force = process.argv.includes('--no-filter')
const canonical = (name: string) => loadCompanies().find((c) => c.name.toLowerCase() === name.toLowerCase())?.name ?? name

for (const f of readdirSync(inbox).filter((f) => f.endsWith('.json'))) {
  const started = now()
  const file = JSON.parse(readFileSync(path.join(inbox, f), 'utf8')) as { source?: string; jobs: IncomingJob[]; checked?: string[]; errors?: Record<string, string> }
  const jobs = file.jobs
    .filter((j) => j.company && j.title && j.url)
    .filter((j) => force || (matchTitle(j.title, criteria) && matchLocation(j.location, j.remote, criteria)))
    .map((j) => ({ ...j, source: j.source ?? file.source ?? 'claude', tags: j.tags ?? tagsFor(j.title, criteria) }))
  // Insert per company so the Companies panel can show what each one yielded.
  const byCompany = new Map<string, IncomingJob[]>()
  for (const j of jobs) byCompany.set(j.company, [...(byCompany.get(j.company) ?? []), j])
  let inserted = 0
  const source = file.source ?? 'claude'
  const checked = new Set([...(file.checked ?? []), ...Object.keys(file.errors ?? {})])
  const tracked = new Set(loadCompanies().map((c) => c.name.toLowerCase()))
  for (const [company, list] of byCompany) {
    const n = upsertJobs(list)
    inserted += n
    // LinkedIn finds companies we don't track; those roll up into one "LinkedIn" row instead.
    if (tracked.has(company.toLowerCase()) && source !== 'linkedin') {
      logRun({ started_at: started, source, company: canonical(company), found: list.length, new_count: n })
      checked.delete(company)
    }
  }
  const linkedinCount = source === 'linkedin' ? jobs.length : 0
  let loggedLinkedIn = false
  for (const name of checked) {
    const isLinkedIn = /linkedin/i.test(name)
    if (isLinkedIn && loggedLinkedIn) continue
    loggedLinkedIn ||= isLinkedIn
    logRun({
      started_at: started,
      source,
      company: isLinkedIn ? 'LinkedIn' : canonical(name),
      found: isLinkedIn ? linkedinCount : 0,
      new_count: isLinkedIn ? inserted : 0,
      error: file.errors?.[name],
    })
  }
  if (!checked.size && !byCompany.size) logRun({ started_at: started, source, found: 0, new_count: 0 })
  console.log(`${f}: ${file.jobs.length} submitted, ${jobs.length} matched filters, ${inserted} new`)
  renameSync(path.join(inbox, f), path.join(done, f))
}
