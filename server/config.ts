import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ROOT } from './paths.ts'

export type Adapter = 'greenhouse' | 'ashby' | 'lever' | 'workday' | 'amazon' | 'eightfold' | 'jibe' | 'claude-browse'
export type Company = { name: string; adapter: Adapter; slug?: string; url?: string; api?: 'pcsx' | 'v2'; enabled: boolean; note?: string }

export type Criteria = {
  titleInclude: string[]
  titleExclude: string[]
  tags: Record<string, string>
  locationInclude: string[]
  remoteMustBeUS: boolean
  nonUSMarkers: string[]
  // Where you'd work on-site: jobs whose location mentions any term count as local (Remote or {label}).
  homeArea: { label: string; terms: string[] }
}

const file = (name: string) => path.join(ROOT, 'config', name)
const readJson = <T>(name: string): T => JSON.parse(readFileSync(file(name), 'utf8'))

export const loadCompanies = () => readJson<Company[]>('companies.json')
export const saveCompanies = (c: Company[]) => writeFileSync(file('companies.json'), JSON.stringify(c, null, 2) + '\n')
export const loadCriteria = () => readJson<Criteria>('criteria.json')

export type Scoring = {
  profile: string
  roles: { label: string; match: string[]; points: number }[]
  otherRolePoints: number
  level: { senior: number; mid: number }
  domains: { terms: string[]; pointsEach: number; max: number }
  locationBonus: number
  claudeGuidance: string
}

export const loadScoring = () => readJson<Scoring>('scoring.json')
export const saveScoring = (s: Scoring) => writeFileSync(file('scoring.json'), JSON.stringify(s, null, 2) + '\n')

const num = (v: unknown, lo = -100, hi = 100) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi
const strs = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === 'string')

/** Returns an error message, or null when the object is a valid Scoring config. */
export function validateScoring(s: any): string | null {
  if (!s || typeof s.profile !== 'string' || typeof s.claudeGuidance !== 'string') return 'Profile and guidance must be text'
  if (!Array.isArray(s.roles) || !s.roles.every((r: any) => typeof r.label === 'string' && r.label.trim() && strs(r.match) && num(r.points)))
    return 'Each role type needs a name, match phrases and points between -100 and 100'
  if (!num(s.otherRolePoints) || !num(s.level?.senior) || !num(s.level?.mid) || !num(s.locationBonus)) return 'Points must be numbers between -100 and 100'
  if (!strs(s.domains?.terms) || !num(s.domains?.pointsEach) || !num(s.domains?.max, 0, 100)) return 'Domain terms need points and a cap'
  return null
}
