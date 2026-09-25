import { spawn } from 'node:child_process'
import { existsSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ROOT, now } from './db.ts'

// The Claude half of Refresh (LinkedIn in the user's Chrome, browsing sites without feeds, scoring) runs as a headless `claude -p` session.
// State lives in files so a sweep keeps going (and is reported correctly) even if the dashboard server restarts.
const STATE = path.join(ROOT, 'data', 'sweep.json')
const LOG = path.join(ROOT, 'data', 'sweep.log')

export type SweepState = { state: 'idle' | 'running' | 'done' | 'failed'; pid?: number; startedAt?: string; finishedAt?: string; summary?: string }

const ALLOWED = [
  'Read',
  'Write',
  'ToolSearch',
  'mcp__claude-in-chrome',
  'Bash(pnpm ingest)',
  'Bash(pnpm summary:*)',
  'Bash(node scripts/score.ts:*)',
  'Bash(node -e:*)',
  'WebFetch',
]

const alive = (pid?: number) => {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const read = (): SweepState => (existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : { state: 'idle' })
const write = (s: SweepState) => writeFileSync(STATE, JSON.stringify(s, null, 2))

export function sweepStatus(): SweepState {
  const s = read()
  if (s.state === 'running' && !alive(s.pid)) {
    const lines = existsSync(LOG) ? readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean) : []
    const summary = [...lines].reverse().find((l) => /^\W*(Refresh|LinkedIn sweep):/i.test(l)) ?? lines.at(-1) ?? 'Finished with no output.'
    const done: SweepState = { ...s, state: /^\W*(Refresh|LinkedIn sweep):/i.test(summary) ? 'done' : 'failed', finishedAt: now(), summary: summary.replace(/^[*_`\s]+|[*_`\s]+$/g, '') }
    write(done)
    return done
  }
  return s
}

export function startSweep(): SweepState {
  const current = sweepStatus()
  if (current.state === 'running') return current
  const prompt = `Follow the instructions in ${path.join(ROOT, 'routine', 'refresh.md')}.`
  const out = openSync(LOG, 'w')
  const child = spawn('claude', ['-p', prompt, '--chrome', '--allowedTools', ...ALLOWED], {
    cwd: ROOT,
    detached: true,
    stdio: ['ignore', out, out],
    env: { ...process.env, PATH: `${process.env.HOME}/.local/bin:${process.env.PATH}` },
  })
  child.unref()
  const s: SweepState = { state: 'running', pid: child.pid, startedAt: now() }
  write(s)
  return s
}
