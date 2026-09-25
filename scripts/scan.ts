import { scanAll } from '../server/scan.ts'

const results = await scanAll()
console.table(results)
const errors = results.filter((r) => r.error)
console.log(`\n${results.reduce((n, r) => n + r.new, 0)} new matching jobs across ${results.length} companies.${errors.length ? ` ${errors.length} failed.` : ''}`)
