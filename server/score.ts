// Instant rules-based fit score so every job is ranked the moment it lands.
// Rules live in config/scoring.json (editable in Settings → Scoring).
// Claude replaces the score with a considered one and a note on the next run (score_source = 'claude').
import { areaFor, isRemote } from '../src/lib/location.ts'
import { loadLocations, loadScoring, type Scoring } from './config.ts'

type Scorable = { title: string; location?: string | null; remote?: boolean | number; description_snippet?: string | null }
export type ScorePart = { label: string; points: number }

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
// "design system" also matches "design systems"; single short words like "ai" need word boundaries.
const phrase = (p: string) => new RegExp(`(^|[^a-z])${escape(p.toLowerCase())}`, 'i')

export function scoreBreakdown(j: Scorable, cfg: Scoring = loadScoring()) {
  const t = j.title.toLowerCase()
  const parts: ScorePart[] = []

  const role = cfg.roles.find((r) => r.match.some((m) => phrase(m).test(t)))
  parts.push(role ? { label: role.label, points: role.points } : { label: 'Other role', points: cfg.otherRolePoints })

  if (/\b(senior|sr)\b/.test(t)) parts.push({ label: 'Senior', points: cfg.level.senior })
  else parts.push({ label: 'Mid level', points: cfg.level.mid })

  const text = `${t} ${(j.description_snippet ?? '').toLowerCase()}`
  const hits = cfg.domains.terms.filter((d) => new RegExp(`(^|[^a-z])${escape(d.toLowerCase())}($|[^a-z])`).test(text))
  if (hits.length) parts.push({ label: `Domain: ${hits.join(', ')}`, points: Math.min(cfg.domains.max, hits.length * cfg.domains.pointsEach) })

  const area = areaFor(j.location, loadLocations())
  if (area || isRemote(j.location, j.remote)) parts.push({ label: area?.name ?? 'Remote', points: cfg.locationBonus })

  const score = Math.max(0, Math.min(100, parts.reduce((n, p) => n + p.points, 0)))
  return { score, parts }
}

export const rulesScore = (j: Scorable, cfg?: Scoring) => scoreBreakdown(j, cfg).score
