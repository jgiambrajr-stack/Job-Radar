export const STATUSES = ['new', 'interested', 'applied', 'interviewing', 'declined', 'dismissed'] as const
export type Status = (typeof STATUSES)[number]
export const PIPELINE: Status[] = ['interested', 'applied', 'interviewing', 'declined']
export const STATUS_LABEL: Record<Status, string> = {
  new: 'New',
  interested: 'Interested',
  applied: 'Applied',
  interviewing: 'Interviewing',
  declined: 'Declined',
  dismissed: 'Dismissed',
}

export type Job = {
  id: string
  company: string
  title: string
  location: string | null
  remote: boolean
  url: string
  source: string
  posted_at: string | null
  first_seen: string
  last_seen: string
  description_snippet: string | null
  salary: string | null
  tags: string[]
  fit_score: number | null
  fit_notes: string | null
  score_source: 'rules' | 'claude' | null
  status: Status
  status_changed_at: string
  looking_for_referral: boolean
  referral_contact: string | null
  notes: string | null
}

export type JobPatch = Partial<Pick<Job, 'status' | 'notes' | 'looking_for_referral' | 'referral_contact'>>

export type Company = {
  name: string
  adapter: string
  slug?: string
  url?: string
  enabled: boolean
  note?: string
  builtin?: boolean
  last_checked: string | null
  last_error: string | null
  jobs: number
}

export type Meta = { lastRun: string | null; errors: { company: string; error: string }[]; homeArea: { label: string; terms: string[] } }
export type ScanResult = { company: string; fetched: number; matched: number; new: number; error?: string }

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? res.statusText)
  return data as T
}

export const api = {
  jobs: () => req<Job[]>('/jobs'),
  updateJob: (id: string, patch: JobPatch) => req('/jobs/' + id, { method: 'PATCH', body: JSON.stringify(patch) }),
  meta: () => req<Meta>('/meta'),
  companies: () => req<Company[]>('/companies'),
  addCompany: (name: string, url: string) =>
    req<{ company: Company; test: ScanResult | null }>('/companies', { method: 'POST', body: JSON.stringify({ name, url }) }),
  toggleCompany: (name: string, enabled: boolean) =>
    req('/companies/' + encodeURIComponent(name), { method: 'PATCH', body: JSON.stringify({ enabled }) }),
  removeCompany: (name: string) => req('/companies/' + encodeURIComponent(name), { method: 'DELETE' }),
  insights: () => req<Insights>('/insights'),
  sweepStatus: () => req<SweepState>('/linkedin-sweep'),
  startSweep: () => req<SweepState>('/linkedin-sweep', { method: 'POST' }),
  scoring: () => req<Scoring>('/scoring'),
  saveScoring: (s: Scoring) => req('/scoring', { method: 'PUT', body: JSON.stringify(s) }),
  previewScore: (title: string, config: Scoring) => req<ScoreParts>('/scoring/preview', { method: 'POST', body: JSON.stringify({ title, config }) }),
  rescore: (scope: 'quick' | 'all') => req<{ updated: number }>('/scoring/rescore', { method: 'POST', body: JSON.stringify({ scope }) }),
  jobScore: (id: string) => req<JobScore>(`/jobs/${id}/score`),
  refresh: () => req<ScanResult[]>('/refresh', { method: 'POST' }),
  ping: () => fetch('/api/ping', { method: 'POST' }).catch(() => {}),
}

export const linkedInPeopleSearch = (company: string) =>
  `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${company} design`)}`

export function timeAgo(iso: string | null) {
  if (!iso) return ''
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}

export const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)

export type TermStat = { term: string; count: number; positiveRate: number; dismissRate: number }
export type Insights = {
  triagedCount: number
  stats: { appliedThisWeek: number; totalApplied: number; interviewRate: number; inboxWaiting: number }
  funnel: { step: string; count: number; rate: number | null }[]
  declined: number
  weeks: { start: string; label: string; found: number; applied: number; dismissed: number }[]
  medianHoursToTriage: number | null
  companies: { company: string; found: number; interested: number; applied: number; interviewing: number; dismissed: number; applyRate: number }[]
  sources: { source: string; found: number; triaged: number; actedOn: number; actedRate: number }[]
  leanToward: TermStat[]
  passOn: TermStat[]
  locations: { location: string; found: number; interested: number; dismissed: number }[]
  fit: { pickedAvg: number | null; dismissedAvg: number | null; pickedCount: number; dismissedCount: number; histogram: { bucket: string; picked: number; dismissed: number }[] }
  followUps: { id: string; company: string; title: string; url: string; status: Status; days: number }[]
}

export type SweepState = { state: 'idle' | 'running' | 'done' | 'failed'; startedAt?: string; finishedAt?: string; summary?: string }

export type Scoring = {
  profile: string
  roles: { label: string; match: string[]; points: number }[]
  otherRolePoints: number
  level: { senior: number; mid: number }
  domains: { terms: string[]; pointsEach: number; max: number }
  locationBonus: number
  claudeGuidance: string
}
export type ScoreParts = { score: number | null; parts: { label: string; points: number }[] }
export type JobScore = { source: 'rules' | 'claude'; score: number | null; notes: string | null; rules: ScoreParts }
