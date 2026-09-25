import type { Company } from './config.ts'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36'

/** Works out which adapter can read a careers URL. Falls back to claude-browse. */
export async function detectAts(name: string, rawUrl: string): Promise<Company> {
  const url = new URL(rawUrl.trim())
  const fromUrl = matchUrl(url)
  if (fromUrl) return { name, enabled: true, ...fromUrl }

  // Many company careers pages embed or link to their ATS.
  try {
    const html = await (await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) })).text()
    const links = html.match(/https?:\/\/[a-z0-9.-]+\.(greenhouse\.io|ashbyhq\.com|lever\.co|myworkdayjobs\.com)\/[^"'\s<>)]*/gi) ?? []
    for (const l of links) {
      const m = matchUrl(new URL(l))
      if (m) return { name, enabled: true, ...m }
    }
    const gh = html.match(/greenhouse\.io\/embed\/job_board(?:\/js)?\?for=([a-z0-9_-]+)/i)
    if (gh) return { name, enabled: true, adapter: 'greenhouse', slug: gh[1] }
  } catch {
    // unreachable page: fall through
  }

  // iCIMS Jibe sites expose /api/jobs on the same origin.
  try {
    const res = await fetch(`${url.origin}/api/jobs?keywords=designer&page=1`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) })
    if (res.ok && Array.isArray((await res.json()).jobs)) return { name, enabled: true, adapter: 'jibe', url: url.origin }
  } catch {
    // not jibe
  }

  return { name, enabled: true, adapter: 'claude-browse', url: rawUrl.trim() }
}

function matchUrl(u: URL): Omit<Company, 'name' | 'enabled'> | null {
  const seg = u.pathname.split('/').filter(Boolean)
  if (/greenhouse\.io$/.test(u.hostname)) {
    const slug = u.searchParams.get('for') ?? (seg[0] === 'embed' ? null : seg[0])
    if (slug && !['v1', 'boards'].includes(slug)) return { adapter: 'greenhouse', slug }
    if (seg[0] === 'v1' && seg[1] === 'boards') return { adapter: 'greenhouse', slug: seg[2] }
  }
  if (u.hostname === 'jobs.ashbyhq.com' && seg[0]) return { adapter: 'ashby', slug: seg[0] }
  if (u.hostname === 'jobs.lever.co' && seg[0]) return { adapter: 'lever', slug: seg[0] }
  if (u.hostname.endsWith('.myworkdayjobs.com')) {
    const site = seg.find((p) => !/^[a-z]{2}-[A-Z]{2}$/.test(p))
    if (site) return { adapter: 'workday', url: `${u.origin}/${site}` }
  }
  if (u.hostname.endsWith('amazon.jobs')) return { adapter: 'amazon' }
  return null
}
