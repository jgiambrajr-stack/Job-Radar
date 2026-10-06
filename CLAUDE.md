# Job Radar

**Fresh clone?** If `config/scoring.json` has an empty `profile`, follow `SETUP.md` before anything else.

Local job-search tool: a daily Claude routine finds roles that match the user's criteria (configurable areas and/or remote) and a local shadcn dashboard is used to triage them. No cloud services: everything lives in `data/jobs.db` (Node 24 built-in `node:sqlite`).

- `server/`: Hono API plus the shared data layer. `db.ts` (schema and upsert; never resurrects dismissed jobs), `adapters.ts` (one function per ATS), `filter.ts`, `detect.ts` (careers URL → adapter), `scan.ts`.
- `scripts/`: `scan` (feeds), `ingest` (reads `data/inbox/*.json` written by the routine), `score` (the routine writes fit scores), `summary`, `today` (build if stale, serve, open; the server auto-exits about 2 minutes after the tab closes).
- `src/`: Vite + React + shadcn UI. Views: Inbox (keyboard triage), Pipeline (dnd-kit board or table), Dismissed (archive), Companies.
- `config/`: `companies.json`, `criteria.json` (title filters, and `locations`: areas / remote rules, edited in Settings → Locations; matcher in `src/lib/location.ts`, shared by server and UI), `scoring.json` (profile, Claude guidance, quick-score rules; edited in Settings → Scoring), `linkedin.json`.
- `routine/daily.md`: the prompt the daily Claude scheduled task runs. `routine/refresh.md` is the Claude half of the Refresh button (browse sites without feeds, LinkedIn, ingest, score), started via `server/sweep.ts` (headless `claude -p --chrome`, state in `data/sweep.json`).
- Scores: every job gets an instant rules score (`server/score.ts`, rules in `config/scoring.json`, `score_source = 'rules'`); Claude overwrites it with a considered score and note (`score_source = 'claude'`). Feeds that return 429 pause for 1h and 403 for 6h (`server/scan.ts`); Claude browses them meanwhile. Eightfold (Microsoft) pages 10 at a time and rate-limits bursts, so its adapter paces requests and retries a 429.

Server and scripts are plain `.ts` run by Node's type stripping: use `.ts` import extensions, and don't use enums or parameter properties. Statuses: new, interested, applying, applied, interviewing, declined, dismissed. "Looking for referral" is a flag on a job, not a status; the people found for it (each with found / messaged / replied / referred / no response) are in the `referral_contacts` table. Inbox read state is `read_at` (NULL = unread, shown as New; opening a job marks it read, `u` toggles). Card order within a board column is `board_order` (set by dragging, `PUT /api/jobs/order`). No emoji in the UI.
