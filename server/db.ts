import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { loadScoring } from './config.ts'
import { ROOT } from './paths.ts'
import { rulesScore } from './score.ts'

export { ROOT }
mkdirSync(path.join(ROOT, 'data'), { recursive: true })

export const db = new DatabaseSync(process.env.JOBS_DB ?? path.join(ROOT, 'data', 'jobs.db'))
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    company TEXT NOT NULL,
    title TEXT NOT NULL,
    location TEXT,
    remote INTEGER DEFAULT 0,
    url TEXT NOT NULL,
    source TEXT NOT NULL,
    posted_at TEXT,
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL,
    description_snippet TEXT,
    salary TEXT,
    tags TEXT,
    fit_score INTEGER,
    fit_notes TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    status_changed_at TEXT NOT NULL,
    looking_for_referral INTEGER DEFAULT 0,
    referral_contact TEXT,
    notes TEXT,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS jobs_status ON jobs(status);
  CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    source TEXT NOT NULL,
    company TEXT,
    found INTEGER DEFAULT 0,
    new_count INTEGER DEFAULT 0,
    error TEXT
  );
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL,
    from_status TEXT,
    to_status TEXT NOT NULL,
    at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS events_job ON events(job_id);
`)

// Columns added after the first release.
const cols = (db.prepare('PRAGMA table_info(jobs)').all() as { name: string }[]).map((c) => c.name)
if (!cols.includes('score_source')) {
  db.exec("ALTER TABLE jobs ADD COLUMN score_source TEXT")
  db.exec("UPDATE jobs SET score_source = 'claude' WHERE fit_score IS NOT NULL")
}
// Anything still unscored gets the instant rules score.
rescoreRules('unscored')

// Jobs triaged before status history existed get one synthetic event so insights include them.
db.exec(`INSERT INTO events (job_id, from_status, to_status, at)
  SELECT id, 'new', status, status_changed_at FROM jobs
  WHERE status != 'new' AND id NOT IN (SELECT job_id FROM events)`)

export const STATUSES = ['new', 'interested', 'applied', 'interviewing', 'declined', 'dismissed'] as const
export type Status = (typeof STATUSES)[number]

export type IncomingJob = {
  company: string
  title: string
  url: string
  source: string
  location?: string | null
  remote?: boolean
  posted_at?: string | null
  description_snippet?: string | null
  salary?: string | null
  tags?: string[]
  fit_score?: number | null
  fit_notes?: string | null
}

export const now = () => new Date().toISOString()

// Same role at the same company dedupes even when two sources give different URLs (e.g. LinkedIn vs. the company ATS).
export function jobId(company: string, title: string, url: string) {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const cleanUrl = url.split('?')[0].replace(/\/$/, '')
  return createHash('sha1').update(`${norm(company)}|${norm(title)}|${cleanUrl}`).digest('hex').slice(0, 16)
}

function findExisting(j: IncomingJob) {
  const id = jobId(j.company, j.title, j.url)
  const byId = db.prepare('SELECT id FROM jobs WHERE id = ?').get(id) as { id: string } | undefined
  if (byId) return byId.id
  const byTitle = db
    .prepare('SELECT id FROM jobs WHERE lower(company) = lower(?) AND lower(title) = lower(?) AND ifnull(lower(location),\'\') = ifnull(lower(?),\'\')')
    .get(j.company, j.title, j.location ?? null) as { id: string } | undefined
  return byTitle?.id
}

/** Insert new jobs as status 'new'; for known jobs only refresh last_seen and fill empty fields. Never resurrects dismissed jobs. */
export function upsertJobs(jobs: IncomingJob[]) {
  const ts = now()
  let inserted = 0
  const insert = db.prepare(`INSERT INTO jobs
    (id, company, title, location, remote, url, source, posted_at, first_seen, last_seen, description_snippet, salary, tags, fit_score, fit_notes, score_source, status, status_changed_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'new',?,?)`)
  const touch = db.prepare(`UPDATE jobs SET last_seen = ?,
    salary = coalesce(salary, ?), description_snippet = coalesce(description_snippet, ?),
    fit_score = coalesce(fit_score, ?), fit_notes = coalesce(fit_notes, ?), posted_at = coalesce(posted_at, ?)
    WHERE id = ?`)
  db.exec('BEGIN')
  try {
    for (const j of jobs) {
      const existing = findExisting(j)
      if (existing) {
        touch.run(ts, j.salary ?? null, j.description_snippet ?? null, j.fit_score ?? null, j.fit_notes ?? null, j.posted_at ?? null, existing)
      } else {
        insert.run(
          jobId(j.company, j.title, j.url), j.company, j.title, j.location ?? null, j.remote ? 1 : 0, j.url, j.source,
          j.posted_at ?? null, ts, ts, j.description_snippet ?? null, j.salary ?? null,
          j.tags?.length ? j.tags.join(',') : null, j.fit_score ?? rulesScore(j), j.fit_notes ?? null, j.fit_score != null ? 'claude' : 'rules', ts, ts,
        )
        inserted++
      }
    }
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
  return inserted
}

/** Recompute rules scores. 'unscored': only empty ones. 'quick': all rules-scored jobs. 'all': also reset Claude scores so Claude re-scores them. */
export function rescoreRules(scope: 'unscored' | 'quick' | 'all') {
  const where = {
    unscored: 'fit_score IS NULL',
    quick: "(fit_score IS NULL OR ifnull(score_source, 'rules') = 'rules') AND status != 'dismissed'",
    all: "status != 'dismissed'",
  }[scope]
  const rows = db.prepare(`SELECT id, title, location, remote, description_snippet FROM jobs WHERE ${where}`).all() as any[]
  const cfg = loadScoring()
  const stmt = db.prepare(`UPDATE jobs SET fit_score = ?, score_source = 'rules'${scope === 'all' ? ', fit_notes = NULL' : ''} WHERE id = ?`)
  for (const j of rows) stmt.run(rulesScore(j, cfg), j.id)
  return rows.length
}

export function logEvent(jobId: string, from: string | null, to: string) {
  db.prepare('INSERT INTO events (job_id, from_status, to_status, at) VALUES (?,?,?,?)').run(jobId, from, to, now())
}

export function logRun(r: { started_at: string; source: string; company?: string; found: number; new_count: number; error?: string }) {
  db.prepare('INSERT INTO runs (started_at, finished_at, source, company, found, new_count, error) VALUES (?,?,?,?,?,?,?)')
    .run(r.started_at, now(), r.source, r.company ?? null, r.found, r.new_count, r.error ?? null)
}
