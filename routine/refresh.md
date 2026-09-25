# Refresh (on demand)

Started by the dashboard's Refresh button, right after the company feeds were checked by script. Work in the Job Radar repo root (the current directory).

Read `routine/daily.md` for the hard rules and criteria. They all apply here. Then do only these steps from it:

1. **Step 2 (companies Claude browses):** every enabled `claude-browse` company in `config/companies.json`, plus any feed company whose latest run is rate limited or failed. Find those with `node -e "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('data/jobs.db',{readOnly:true});console.log(db.prepare('SELECT company, error FROM runs WHERE id IN (SELECT max(id) FROM runs WHERE company IS NOT NULL GROUP BY company) AND error IS NOT NULL').all())"`. For Microsoft and Netflix use the search URLs from step 1 of `routine/daily.md`.
2. **Step 3 (LinkedIn catch-all)** using Claude in Chrome. Load the `mcp__claude-in-chrome__*` tools with ToolSearch first. If Chrome isn't connected or LinkedIn shows a login wall or bot check, skip LinkedIn and say so, but still finish the other steps.
3. **Step 4 (Ingest):** write `data/inbox/<YYYY-MM-DD-HHmm>-browse.json` and `data/inbox/<YYYY-MM-DD-HHmm>-linkedin.json`, including the `checked` and `errors` fields. Then run `pnpm ingest`.
4. **Step 5 (Score).**
5. Run `pnpm summary 1`. Make your final line exactly `Refresh: ` followed by that output, then any skipped sources, e.g. `Refresh: 5 new roles. Top: Senior Product Designer at Stripe (88). LinkedIn skipped: Chrome not connected.`

Don't run `pnpm scan`.
