// Helper for the Claude routine.
//   node scripts/score.ts list            -> { profile, guidance, preferences, remaining, jobs }: next batch of jobs that only have the instant rules score
//   node scripts/score.ts apply file.json -> applies [{ id, fit_score, fit_notes }]
import { readFileSync } from 'node:fs'
import { db, now } from '../server/db.ts'
import { loadScoring } from '../server/config.ts'
import { preferences } from '../server/insights.ts'

const [cmd, file] = process.argv.slice(2)
const BATCH = 20
if (cmd === 'list') {
  // Batches keep the output small enough to read in full; run list/apply until `remaining` is 0.
  const where = "ifnull(score_source, 'rules') != 'claude' AND status != 'dismissed'"
  const total = (db.prepare(`SELECT count(*) AS n FROM jobs WHERE ${where}`).get() as { n: number }).n
  const rows = db.prepare(`SELECT id, company, title, location, tags, salary, substr(description_snippet, 1, 200) AS snippet FROM jobs WHERE ${where} ORDER BY first_seen DESC LIMIT ${BATCH}`).all()
  const { profile, claudeGuidance } = loadScoring()
  console.log(JSON.stringify({ profile, guidance: claudeGuidance, preferences: preferences(), remaining: total, batch: rows.length, jobs: rows }))
} else if (cmd === 'apply' && file) {
  const scores = JSON.parse(readFileSync(file, 'utf8')) as { id: string; fit_score: number; fit_notes: string }[]
  const stmt = db.prepare("UPDATE jobs SET fit_score = ?, fit_notes = ?, score_source = 'claude', updated_at = ? WHERE id = ?")
  for (const s of scores) stmt.run(Math.round(s.fit_score), s.fit_notes, now(), s.id)
  console.log(`Scored ${scores.length} jobs.`)
} else {
  console.log('usage: node scripts/score.ts list | apply <file.json>')
}
