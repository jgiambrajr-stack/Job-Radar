import type { Criteria } from './config.ts'

const has = (text: string, term: string) =>
  new RegExp(`(^|[^a-z])${term.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}($|[^a-z])`, 'i').test(text)

export function matchTitle(title: string, c: Criteria) {
  const t = title.toLowerCase()
  if (!c.titleInclude.some((k) => t.includes(k))) return false
  return !c.titleExclude.some((k) => has(t, k))
}

export const inHomeArea = (location: string | null | undefined, c: Criteria) => c.homeArea.terms.some((t) => has(location ?? '', t))

export function matchLocation(location: string | null | undefined, remote: boolean | undefined, c: Criteria) {
  const l = (location ?? '').toLowerCase()
  const isRemote = remote || l.includes('remote')
  if (inHomeArea(l, c) || c.locationInclude.some((k) => k !== 'remote' && l.includes(k))) return true
  if (!isRemote) return false
  if (!c.remoteMustBeUS) return true
  // Remote roles tied only to non-US regions are out; "Remote", "Remote, US", "USA - Remote" and multi-location lists that include the US are in.
  const mentionsUS = /\b(us|usa|united states|u\.s\.|america|north america)\b/.test(l)
  const nonUS = c.nonUSMarkers.some((m) => has(l, m))
  return mentionsUS || !nonUS
}

export function tagsFor(title: string, c: Criteria) {
  const t = title.toLowerCase()
  return [...new Set(Object.entries(c.tags).filter(([k]) => t.includes(k)).map(([, v]) => v))]
}
