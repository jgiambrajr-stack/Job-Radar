# Job Radar

**Fresh clone?** If `config/scoring.json` has an empty `profile`, follow `SETUP.md` before anything else.

Local job-search tool: a daily Claude routine finds roles that match the user's criteria (a configurable home area or remote) and a local shadcn dashboard is used to triage them. No cloud services: everything lives in `data/jobs.db` (Node 24 built-in `node:sqlite`).

- `server/`: Hono API plus the shared data layer. `db.ts` (schema and upsert; never resurrects dismissed jobs), `adapters.ts` (one function per ATS), `filter.ts`, `detect.ts` (careers URL → adapter), `scan.ts`.
- `scripts/`: `scan` (feeds), `ingest` (reads `data/inbox/*.json` written by the routine), `score` (the routine writes fit scores), `summary`, `today` (build if stale, serve, open; the server auto-exits about 2 minutes after the tab closes).
- `src/`: Vite + React + shadcn UI. Views: Inbox (keyboard triage), Pipeline (dnd-kit board or table), Dismissed (archive), Companies.
- `config/`: `companies.json`, `criteria.json` (title filters, `homeArea`), `scoring.json` (profile, Claude guidance, quick-score rules; edited in Settings → Scoring), `linkedin.json`.
- `routine/daily.md`: the prompt the daily Claude scheduled task runs. `routine/refresh.md` is the Claude half of the Refresh button (browse sites without feeds, LinkedIn, ingest, score), started via `server/sweep.ts` (headless `claude -p --chrome`, state in `data/sweep.json`).
- Scores: every job gets an instant rules score (`server/score.ts`, rules in `config/scoring.json`, `score_source = 'rules'`); Claude overwrites it with a considered score and note (`score_source = 'claude'`). Feeds that return 403/429 pause for 6h (`server/scan.ts`) and Claude browses them meanwhile.

Server and scripts are plain `.ts` run by Node's type stripping: use `.ts` import extensions, and don't use enums or parameter properties. Statuses: new, interested, applied, interviewing, declined, dismissed. "Looking for referral" is a flag on a job, not a status. No emoji in the UI.
