import { existsSync } from 'node:fs'
import path from 'node:path'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { ADAPTERS } from './adapters.ts'
import { loadCompanies, loadCriteria, loadScoring, saveCompanies, saveScoring, validateScoring } from './config.ts'
import { ROOT, STATUSES, db, logEvent, now, rescoreRules } from './db.ts'
import { scoreBreakdown } from './score.ts'
import { insights } from './insights.ts'
import { detectAts } from './detect.ts'
import { scanAll, scanCompany } from './scan.ts'
import { startSweep, sweepStatus } from './sweep.ts'

const PORT = Number(process.env.PORT ?? 4321)
const app = new Hono()

app.get('/api/jobs', (c) => {
  const rows = db.prepare('SELECT * FROM jobs ORDER BY first_seen DESC').all() as any[]
  return c.json(rows.map((r) => ({ ...r, remote: !!r.remote, looking_for_referral: !!r.looking_for_referral, tags: r.tags ? r.tags.split(',') : [] })))
})

app.patch('/api/jobs/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<Record<string, unknown>>()
  const current = db.prepare('SELECT status, looking_for_referral FROM jobs WHERE id = ?').get(id) as { status: string; looking_for_referral: number } | undefined
  if (!current) return c.json({ error: 'not found' }, 404)
  const sets: string[] = []
  const vals: (string | number | null)[] = []
  if (typeof body.status === 'string') {
    if (!STATUSES.includes(body.status as never)) return c.json({ error: 'bad status' }, 400)
    sets.push('status = ?')
    vals.push(body.status)
    if (body.status !== current.status) sets.push(`status_changed_at = '${now()}'`)
  }
  if ('notes' in body) sets.push('notes = ?'), vals.push((body.notes as string) ?? null)
  if ('referral_contact' in body) sets.push('referral_contact = ?'), vals.push((body.referral_contact as string) ?? null)
  if ('looking_for_referral' in body) sets.push('looking_for_referral = ?'), vals.push(body.looking_for_referral ? 1 : 0)
  if (!sets.length) return c.json({ ok: true })
  db.prepare(`UPDATE jobs SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`).run(...vals, now(), id)
  if (typeof body.status === 'string' && body.status !== current.status) logEvent(id, current.status, body.status)
  if (body.looking_for_referral && !current.looking_for_referral) logEvent(id, current.status, 'referral')
  return c.json({ ok: true })
})

app.get('/api/meta', (c) => {
  const lastRun = db.prepare('SELECT max(finished_at) AS t FROM runs').get() as { t: string | null }
  // Only each company's latest result counts; a planned rate-limit pause isn't a failure.
  const errors = db
    .prepare(`SELECT company, error FROM runs WHERE id IN (SELECT max(id) FROM runs WHERE company IS NOT NULL GROUP BY company)
      AND error IS NOT NULL AND error NOT LIKE 'Rate limited%'`)
    .all()
  return c.json({ lastRun: lastRun.t, errors, homeArea: loadCriteria().homeArea })
})

app.get('/api/companies', (c) => {
  const stats = db.prepare(`SELECT company, max(finished_at) AS last_checked,
      (SELECT error FROM runs r2 WHERE r2.company = runs.company ORDER BY id DESC LIMIT 1) AS last_error
    FROM runs WHERE company IS NOT NULL GROUP BY company`).all() as { company: string; last_checked: string; last_error: string | null }[]
  const counts = db.prepare("SELECT company, count(*) AS n FROM jobs WHERE status != 'dismissed' GROUP BY company").all() as { company: string; n: number }[]
  const linkedin = stats.find((s) => s.company === 'LinkedIn')
  const linkedinJobs = (db.prepare("SELECT count(*) AS n FROM jobs WHERE source = 'linkedin' AND status != 'dismissed'").get() as { n: number }).n
  return c.json([
    ...loadCompanies().map((co) => ({
      ...co,
      last_checked: stats.find((s) => s.company === co.name)?.last_checked ?? null,
      last_error: stats.find((s) => s.company === co.name)?.last_error ?? null,
      jobs: counts.find((n) => n.company.toLowerCase() === co.name.toLowerCase())?.n ?? 0,
    })),
    // The LinkedIn catch-all isn't a company, but it belongs in the list of sources Claude checks.
    { name: 'LinkedIn', adapter: 'linkedin', enabled: true, builtin: true, note: 'Catch-all search for companies not listed above', last_checked: linkedin?.last_checked ?? null, last_error: linkedin?.last_error ?? null, jobs: linkedinJobs },
  ])
})

app.post('/api/companies', async (c) => {
  const { name, url } = await c.req.json<{ name: string; url: string }>()
  if (!name?.trim() || !url?.trim()) return c.json({ error: 'Name and careers URL are required' }, 400)
  try {
    new URL(url)
  } catch {
    return c.json({ error: 'That URL does not look valid' }, 400)
  }
  const companies = loadCompanies()
  if (companies.some((co) => co.name.toLowerCase() === name.trim().toLowerCase())) return c.json({ error: `${name} is already tracked` }, 409)
  const company = await detectAts(name.trim(), url)
  const test = ADAPTERS[company.adapter] ? await scanCompany(company, { ignoreCooldown: true }) : null
  if (test?.error) {
    // Feed detected but unreadable: let Claude browse it instead.
    company.adapter = 'claude-browse'
    company.url = url.trim()
    delete company.slug
  }
  saveCompanies([...companies, company])
  return c.json({ company, test })
})

app.patch('/api/companies/:name', async (c) => {
  const name = decodeURIComponent(c.req.param('name'))
  const { enabled } = await c.req.json<{ enabled: boolean }>()
  saveCompanies(loadCompanies().map((co) => (co.name === name ? { ...co, enabled } : co)))
  return c.json({ ok: true })
})

app.delete('/api/companies/:name', (c) => {
  const name = decodeURIComponent(c.req.param('name'))
  saveCompanies(loadCompanies().filter((co) => co.name !== name))
  return c.json({ ok: true })
})

app.get('/api/jobs/:id/score', (c) => {
  const j = db.prepare('SELECT title, location, remote, description_snippet, fit_score, score_source, fit_notes FROM jobs WHERE id = ?').get(c.req.param('id')) as any
  if (!j) return c.json({ error: 'not found' }, 404)
  return c.json({ source: j.score_source ?? 'rules', score: j.fit_score, notes: j.fit_notes, rules: scoreBreakdown(j) })
})

app.get('/api/scoring', (c) => c.json(loadScoring()))
app.put('/api/scoring', async (c) => {
  const body = await c.req.json()
  const err = validateScoring(body)
  if (err) return c.json({ error: err }, 400)
  saveScoring(body)
  return c.json({ ok: true })
})
// Preview uses the unsaved config from the form, so "Try a title" reflects edits live.
app.post('/api/scoring/preview', async (c) => {
  const { title, location, config } = await c.req.json()
  if (validateScoring(config)) return c.json({ score: null, parts: [] })
  return c.json(scoreBreakdown({ title: String(title ?? ''), location: location ?? null }, config))
})
app.post('/api/scoring/rescore', async (c) => {
  const { scope } = await c.req.json<{ scope: 'quick' | 'all' }>()
  if (scope !== 'quick' && scope !== 'all') return c.json({ error: 'bad scope' }, 400)
  return c.json({ updated: rescoreRules(scope) })
})

app.get('/api/insights', (c) => c.json(insights()))

app.get('/api/linkedin-sweep', (c) => c.json(sweepStatus()))
app.post('/api/linkedin-sweep', (c) => c.json(startSweep()))

app.post('/api/refresh', async (c) => c.json(await scanAll()))

// Launched via `pnpm today`: shut down a couple of minutes after the last dashboard tab closes.
let lastPing = Date.now()
app.post('/api/ping', (c) => {
  lastPing = Date.now()
  return c.json({ ok: true })
})
if (process.env.AUTO_EXIT) {
  setInterval(() => {
    if (Date.now() - lastPing > 120_000 && sweepStatus().state !== 'running') {
      console.log('Dashboard closed. Stopping server.')
      process.exit(0)
    }
  }, 15_000)
}

const dist = path.join(ROOT, 'dist')
if (existsSync(dist)) {
  app.use('/*', serveStatic({ root: path.relative(process.cwd(), dist) || '.' }))
  app.get('*', serveStatic({ path: path.join(path.relative(process.cwd(), dist), 'index.html') }))
}

serve({ fetch: app.fetch, port: PORT, hostname: '127.0.0.1' }, () => console.log(`Job Radar on http://localhost:${PORT}`))
