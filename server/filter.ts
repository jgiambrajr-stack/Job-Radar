import { checkLocation } from '../src/lib/location.ts'
import type { Criteria } from './config.ts'

const has = (text: string, term: string) =>
  new RegExp(`(^|[^a-z])${term.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}($|[^a-z])`, 'i').test(text)

export function matchTitle(title: string, c: Criteria) {
  const t = title.toLowerCase()
  if (!c.titleInclude.some((k) => t.includes(k))) return false
  return !c.titleExclude.some((k) => has(t, k))
}

export function matchLocation(location: string | null | undefined, remote: boolean | undefined, c: Criteria) {
  return checkLocation(location, remote, c.locations).ok
}

export function tagsFor(title: string, c: Criteria) {
  const t = title.toLowerCase()
  return [...new Set(Object.entries(c.tags).filter(([k]) => t.includes(k)).map(([, v]) => v))]
}
