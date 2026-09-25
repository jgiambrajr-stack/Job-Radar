# Job Radar

Daily job scan and a local triage dashboard. Company job feeds are read by script, while LinkedIn and sites without feeds are browsed by Claude. Every role gets a fit score against your profile, and you triage them with the keyboard.

## Setup
Requires Node 24+ and pnpm. Clone the repo, open the folder in Claude Code (or another coding agent), and say **"set up Job Radar"**. The agent follows [SETUP.md](SETUP.md): it interviews you about your background, target roles, location, and companies, writes the config, and runs the first scan. The shipped config is an example for product/UX design roles.

## Daily use
1. The **Job Radar daily** scheduled task runs on weekday mornings in the Claude app. It checks company job feeds, browses companies without feeds, runs the LinkedIn catch-all in Chrome, and scores new roles. Click **Run now** on the task to run it at any time.
2. Open the dashboard by double-clicking `Job Radar.command` or running `pnpm today`.

In the **Inbox**, press `i` for interested, `r` for looking for referral, `a` for applied, `x` to dismiss, and `o` to open the posting. Use `j`/`k` to move between rows. Track everything else on the **Pipeline** board.

## Commands
| | |
|---|---|
| `pnpm today` | Open the dashboard |
| `pnpm scan` | Check all job feeds now |
| Refresh button | Checks the job feeds (seconds), then starts a background Claude run (`claude -p --chrome`) for the LinkedIn search, ingest and scoring (minutes). Keep Chrome open. Log: `data/sweep.log` |
| `pnpm ingest` | Import the routine's results from `data/inbox/` |
| `pnpm dev` | UI dev server with hot reload (port 5173) |

## Adding companies
Use **Companies → Add company** in the dashboard and paste their careers URL. Greenhouse, Ashby, Lever, Workday, and iCIMS boards are detected and read by script. Anything else is browsed by the Claude routine.

## Data
Everything lives in `data/jobs.db`. Back it up by copying the file.
