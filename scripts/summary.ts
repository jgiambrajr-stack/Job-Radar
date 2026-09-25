// One-line summary of jobs first seen in the last N hours (default 20), for the routine's notification.
import { db } from '../server/db.ts'

const hours = Number(process.argv[2] ?? 20)
const since = new Date(Date.now() - hours * 3600_000).toISOString()
const rows = db.prepare("SELECT company, title, fit_score FROM jobs WHERE first_seen >= ? AND status = 'new' ORDER BY ifnull(fit_score, 0) DESC").all(since) as { company: string; title: string; fit_score: number | null }[]
const top = rows[0]
console.log(rows.length ? `${rows.length} new role${rows.length === 1 ? '' : 's'}. Top: ${top.title} at ${top.company}${top.fit_score != null ? ` (${top.fit_score})` : ''}` : 'No new roles today.')
