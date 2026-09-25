import { loadCriteria } from './config.ts'
import { db } from './db.ts'
import { inHomeArea } from './filter.ts'

type JobRow = {
  id: string
  company: string
  title: string
  location: string | null
  remote: number
  source: string
  tags: string | null
  fit_score: number | null
  status: string
  status_changed_at: string
  first_seen: string
  url: string
}
type EventRow = { job_id: string; from_status: string | null; to_status: string; at: string }

const DAY = 86400000
const INTERESTED = new Set(['interested', 'referral', 'applied', 'interviewing'])
const APPLIED = new Set(['applied', 'interviewing'])
// Words that say nothing about the kind of work: seniority, the job family itself, filler.
const STOP = new Set(
  `a an and the of for to in on at with by or from as via is are be &
   senior sr ii iii iv i mid level product products designer designers design ux ui user experience interaction
   engineer engineering team teams role remote us usa united states new based contract full time`.split(/\s+/),
)
const TEAM_WORDS = /^[a-z][a-z0-9+_-]*$/
// Phrases made of otherwise-ignored words, kept together as one term.
const PHRASES = ['design systems', 'design system', 'design engineer', 'ux engineer', 'forward deployed', 'machine learning', 'developer tools', 'design ops']

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0)
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null)
const median = (xs: number[]) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}
const weekStart = (d: Date) => {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}

function terms(job: JobRow) {
  const companyWords = new Set(job.company.toLowerCase().split(/[^a-z0-9]+/))
  let title = job.title.toLowerCase()
  for (const p of PHRASES) title = title.replaceAll(p, p.replace(/ /g, '_').replace(/_system$/, '_systems'))
  const words = title
    .split(/[^a-z0-9+_]+/)
    .filter((w) => w.length > 1 && TEAM_WORDS.test(w) && !STOP.has(w) && !companyWords.has(w) && !/^\d+$/.test(w))
  const out = new Set(words.map((w) => w.replace(/_/g, ' ')))
  for (let i = 0; i < words.length - 1; i++) out.add(`${words[i]} ${words[i + 1]}`.replace(/_/g, ' '))
  // Tags duplicate the phrases above ("Design Systems"), so they only add terms that aren't already present.
  for (const t of job.tags?.split(',') ?? []) out.add(t.toLowerCase().replace('design eng', 'design engineer'))
  return out
}

export function insights() {
  const jobs = db.prepare('SELECT id, company, title, location, remote, source, tags, fit_score, status, status_changed_at, first_seen, url FROM jobs').all() as JobRow[]
  const events = db.prepare('SELECT job_id, from_status, to_status, at FROM events ORDER BY at').all() as EventRow[]
  const now = Date.now()

  const reached = new Map<string, Set<string>>()
  for (const j of jobs) reached.set(j.id, new Set([j.status]))
  for (const e of events) reached.get(e.job_id)?.add(e.to_status)
  const byId = new Map(jobs.map((j) => [j.id, j]))
  const r = (j: JobRow) => reached.get(j.id)!
  const isInterested = (j: JobRow) => [...r(j)].some((s) => INTERESTED.has(s))
  const isApplied = (j: JobRow) => [...r(j)].some((s) => APPLIED.has(s))
  const isInterviewing = (j: JobRow) => r(j).has('interviewing')
  const isDismissed = (j: JobRow) => j.status === 'dismissed'

  const triaged = jobs.filter((j) => j.status !== 'new')
  const positives = jobs.filter(isInterested)
  const dismissed = jobs.filter(isDismissed)

  const funnelCounts = {
    found: jobs.length,
    interested: positives.length,
    applied: jobs.filter(isApplied).length,
    interviewing: jobs.filter(isInterviewing).length,
  }
  const funnel = [
    { step: 'Found', count: funnelCounts.found, rate: null },
    { step: 'Interested', count: funnelCounts.interested, rate: pct(funnelCounts.interested, funnelCounts.found) },
    { step: 'Applied', count: funnelCounts.applied, rate: pct(funnelCounts.applied, funnelCounts.interested) },
    { step: 'Interviewing', count: funnelCounts.interviewing, rate: pct(funnelCounts.interviewing, funnelCounts.applied) },
  ]

  // Weekly activity, last 12 weeks, Monday-based.
  const thisWeek = weekStart(new Date())
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const start = new Date(thisWeek.getTime() - (11 - i) * 7 * DAY)
    return { start: start.toISOString(), label: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), found: 0, applied: 0, dismissed: 0 }
  })
  const bucket = (iso: string) => {
    const idx = Math.floor((weekStart(new Date(iso)).getTime() - new Date(weeks[0].start).getTime()) / (7 * DAY))
    return weeks[idx]
  }
  for (const j of jobs) {
    const w = bucket(j.first_seen)
    if (w) w.found++
  }
  const firstTriage = new Map<string, string>()
  for (const e of events) {
    const w = bucket(e.at)
    if (w && e.to_status === 'applied') w.applied++
    if (w && e.to_status === 'dismissed') w.dismissed++
    if (!firstTriage.has(e.job_id)) firstTriage.set(e.job_id, e.at)
  }
  const triageHours = [...firstTriage].flatMap(([id, at]) => {
    const j = byId.get(id)
    return j ? [(new Date(at).getTime() - new Date(j.first_seen).getTime()) / 3600000] : []
  })

  const group = <K extends string>(key: (j: JobRow) => K) => {
    const m = new Map<K, JobRow[]>()
    for (const j of jobs) m.set(key(j), [...(m.get(key(j)) ?? []), j])
    return m
  }

  const companies = [...group((j) => j.company)]
    .map(([company, js]) => {
      const applied = js.filter(isApplied).length
      return {
        company,
        found: js.length,
        interested: js.filter(isInterested).length,
        applied,
        interviewing: js.filter(isInterviewing).length,
        dismissed: js.filter(isDismissed).length,
        applyRate: pct(applied, js.filter((j) => j.status !== 'new').length),
      }
    })
    .sort((a, b) => b.applied - a.applied || b.interested - a.interested || b.found - a.found)

  const sourceLabel = (s: string) => (s === 'linkedin' ? 'LinkedIn' : s === 'claude-browse' || s === 'claude' ? 'Claude browse' : 'Company feeds')
  const sources = [...group((j) => sourceLabel(j.source))]
    .map(([source, js]) => {
      const t = js.filter((j) => j.status !== 'new').length
      const acted = js.filter(isInterested).length
      return { source, found: js.length, triaged: t, actedOn: acted, actedRate: pct(acted, t) }
    })
    .sort((a, b) => b.found - a.found)

  // Title patterns among triaged jobs.
  const stats = new Map<string, { n: number; pos: number; neg: number }>()
  for (const j of triaged) {
    for (const t of terms(j)) {
      const s = stats.get(t) ?? { n: 0, pos: 0, neg: 0 }
      s.n++
      if (isInterested(j)) s.pos++
      if (isDismissed(j)) s.neg++
      stats.set(t, s)
    }
  }
  const eligible = [...stats].filter(([, s]) => s.n >= 3)
  // Drop a single word when a two-word phrase containing it covers the same jobs ("design systems" over "systems").
  const kept = eligible.filter(([t, s]) => t.includes(' ') || !eligible.some(([b, bs]) => b.includes(' ') && b.split(' ').includes(t) && bs.n === s.n))
  const toTerm = ([term, s]: [string, { n: number; pos: number; neg: number }]) => ({ term, count: s.n, positiveRate: pct(s.pos, s.n), dismissRate: pct(s.neg, s.n) })
  const leanToward = kept.map(toTerm).filter((t) => t.positiveRate >= 50).sort((a, b) => b.positiveRate - a.positiveRate || b.count - a.count).slice(0, 10)
  const passOn = kept.map(toTerm).filter((t) => t.dismissRate >= 60).sort((a, b) => b.dismissRate - a.dismissRate || b.count - a.count).slice(0, 10)

  const crit = loadCriteria()
  const locKind = (j: JobRow) => (inHomeArea(j.location, crit) ? crit.homeArea.label : j.remote || /remote/i.test(j.location ?? '') ? 'Remote' : 'Other')
  const locations = [...group(locKind)].map(([location, js]) => ({
    location,
    found: js.length,
    interested: js.filter(isInterested).length,
    dismissed: js.filter(isDismissed).length,
  }))

  const posFit = positives.flatMap((j) => (j.fit_score == null ? [] : [j.fit_score]))
  const negFit = dismissed.flatMap((j) => (j.fit_score == null ? [] : [j.fit_score]))
  const histogram = Array.from({ length: 10 }, (_, i) => ({
    bucket: i === 9 ? '90+' : `${i * 10}–${i * 10 + 9}`,
    picked: posFit.filter((f) => Math.min(9, Math.floor(f / 10)) === i).length,
    dismissed: negFit.filter((f) => Math.min(9, Math.floor(f / 10)) === i).length,
  }))

  const daysIn = (j: JobRow) => Math.floor((now - new Date(j.status_changed_at).getTime()) / DAY)
  const followUps = jobs
    .filter((j) => (j.status === 'applied' && daysIn(j) >= 14) || (j.status === 'interviewing' && daysIn(j) >= 10))
    .map((j) => ({ id: j.id, company: j.company, title: j.title, url: j.url, status: j.status, days: daysIn(j) }))
    .sort((a, b) => b.days - a.days)

  const appliedThisWeek = events.filter((e) => e.to_status === 'applied' && now - new Date(e.at).getTime() < 7 * DAY).length

  return {
    triagedCount: triaged.length,
    stats: {
      appliedThisWeek,
      totalApplied: funnelCounts.applied,
      interviewRate: pct(funnelCounts.interviewing, funnelCounts.applied),
      inboxWaiting: jobs.filter((j) => j.status === 'new').length,
    },
    funnel,
    declined: jobs.filter((j) => j.status === 'declined').length,
    weeks,
    medianHoursToTriage: median(triageHours),
    companies,
    sources,
    leanToward,
    passOn,
    locations,
    fit: { pickedAvg: avg(posFit), dismissedAvg: avg(negFit), pickedCount: posFit.length, dismissedCount: negFit.length, histogram },
    followUps,
  }
}

/** Compact summary the daily routine reads when scoring. Informs ranking only; never used to filter. */
export function preferences() {
  const i = insights()
  return {
    note: 'Ranking signal only. Adjust fit_score by at most +/-10 and never below 30 because of this. Never skip or filter a job.',
    triaged: i.triagedCount,
    leanToward: i.leanToward.map((t) => `${t.term} (${t.positiveRate}% kept of ${t.count})`),
    usuallyPassOn: i.passOn.map((t) => `${t.term} (${t.dismissRate}% dismissed of ${t.count})`),
    companiesAppliedTo: i.companies.filter((c) => c.applied > 0).map((c) => `${c.company} (${c.applied})`),
  }
}
