// `pnpm today`: rebuild the UI if the source changed, start the server, open the browser.
import { execSync, spawn } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const PORT = 4321
const newest = (dir: string): number =>
  readdirSync(dir, { withFileTypes: true }).reduce((m, e) => {
    const p = path.join(dir, e.name)
    return Math.max(m, e.isDirectory() ? newest(p) : statSync(p).mtimeMs)
  }, 0)

const built = path.join(ROOT, 'dist', 'index.html')
if (!existsSync(built) || newest(path.join(ROOT, 'src')) > statSync(built).mtimeMs) {
  console.log('Building dashboard...')
  execSync('pnpm build', { cwd: ROOT, stdio: 'inherit' })
}

const up = await fetch(`http://localhost:${PORT}/api/meta`).then((r) => r.ok, () => false)
if (!up) {
  spawn(process.execPath, [path.join(ROOT, 'server', 'index.ts')], {
    cwd: ROOT,
    env: { ...process.env, AUTO_EXIT: '1', PORT: String(PORT) },
    stdio: 'ignore',
    detached: true,
  }).unref()
  for (let i = 0; i < 40; i++) {
    if (await fetch(`http://localhost:${PORT}/api/meta`).then((r) => r.ok, () => false)) break
    await new Promise((r) => setTimeout(r, 150))
  }
}
execSync(`open http://localhost:${PORT}`)
console.log(`Job Radar is open at http://localhost:${PORT}. The server stops on its own about 2 minutes after you close the tab.`)
