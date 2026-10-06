// Location rules shared by the server (scan filter, quick score, insights) and the dashboard (filter menu).
// Plain TS with no imports, so Node can load it directly from server code.

export type Area = { name: string; match: string[]; exclude?: string[] }
export type LocationRules = { areas: Area[]; includeRemote: boolean; remoteUSOnly: boolean; nonUSMarkers: string[] }

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
const hasTerm = (text: string, term: string) => new RegExp(`(^|[^a-z])${esc(term.toLowerCase())}($|[^a-z])`, 'i').test(text)

export function isRemote(location: string | null | undefined, remote?: boolean | number) {
  return !!remote || /remote|anywhere|virtual/i.test(location ?? '')
}

/** The first configured area this location falls in, or null. */
export function areaFor(location: string | null | undefined, rules: LocationRules): Area | null {
  const l = (location ?? '').toLowerCase()
  if (!l) return null
  return rules.areas.find((a) => a.match.some((m) => hasTerm(l, m)) && !(a.exclude ?? []).some((x) => l.includes(x.toLowerCase()))) ?? null
}

function isUSWide(location: string | null | undefined, rules: LocationRules) {
  const l = (location ?? '').toLowerCase().trim()
  if (/^(us|usa|united states( of america)?)$/.test(l)) return true
  return l.includes('multiple locations') && /\b(us|usa|united states)\b/.test(l) && !rules.nonUSMarkers.some((m) => hasTerm(l, m))
}

export type LocationVerdict = { ok: boolean; reason: string; area: string | null; remote: boolean }

export function checkLocation(location: string | null | undefined, remote: boolean | number | undefined, rules: LocationRules): LocationVerdict {
  const area = areaFor(location, rules)
  const rem = isRemote(location, remote)
  if (area) return { ok: true, reason: `In ${area.name}`, area: area.name, remote: rem }
  // "US" or "United States, Multiple Locations" with no city usually means any US office or remote, so it passes when remote does.
  if (!rem && rules.includeRemote && isUSWide(location, rules)) return { ok: true, reason: 'US, multiple locations', area: null, remote: false }
  if (!rem) return { ok: false, reason: 'Not in any of your areas and not remote', area: null, remote: false }
  if (!rules.includeRemote) return { ok: false, reason: 'Remote roles are turned off', area: null, remote: true }
  if (!rules.remoteUSOnly) return { ok: true, reason: 'Remote', area: null, remote: true }
  const l = (location ?? '').toLowerCase()
  // "Remote", "Remote, US", "USA - Remote" and multi-location lists that include the US pass; remote tied only to other countries doesn't.
  const mentionsUS = /\b(us|usa|united states|u\.s\.|america|north america)\b/.test(l)
  const foreign = rules.nonUSMarkers.find((m) => hasTerm(l, m))
  if (mentionsUS || !foreign) return { ok: true, reason: 'Remote (US)', area: null, remote: true }
  return { ok: false, reason: `Remote outside the US (${foreign})`, area: null, remote: true }
}
