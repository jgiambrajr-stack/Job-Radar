# Job Radar setup (for the coding agent)

Follow this when someone has just cloned the repo. You'll know because `config/scoring.json` has an empty `profile`. Work through the steps in order, and keep the user informed with short updates. The config files ship with a design-roles example (product/UX/design engineering, Seattle or remote US). Replace it with this user's own search.

## 1. Prerequisites
- **Node 24 or newer** (`node -v`). The server uses `node:sqlite` and runs `.ts` files directly. If Node is older, ask the user to upgrade (for example `brew install node` or nvm). Don't change their system setup without asking.
- **pnpm** (`pnpm -v`). If it's missing, run `corepack enable`, or ask the user to install it.
- Run `pnpm install`, then `pnpm build`.

## 2. Interview
Ask everything in one message, and offer to read a resume file or pasted LinkedIn text in place of typed answers:
1. **Background**: a resume, LinkedIn "About" section, or a few lines on experience, years, and strengths.
2. **Target roles**: job titles they want, and titles that look similar but aren't a fit.
3. **Level**: for example mid/senior IC only, or including lead/manager.
4. **Location**: their home metro area (for on-site or hybrid roles), whether remote counts, and whether remote roles must be open in the US.
5. **Domains** they care about (for example fintech, AI, developer tools).
6. **Companies**: a list of companies they'd like to track. Careers-page URLs help but are optional.
7. **LinkedIn**: whether they want the LinkedIn catch-all. It needs Claude in Chrome with LinkedIn logged in.

## 3. Write the config
Edit the JSON files in `config/` and keep their existing shape (`server/config.ts` has the types).

- **`criteria.json`**
  - `titleInclude`: lowercase substrings. A title must contain at least one.
  - `titleExclude`: whole words or phrases that rule a title out. Use them for level (staff, principal, intern…) and look-alike fields. Keep the entries short.
  - `tags`: title substring → short badge label.
  - `homeArea`: `{ "label": "Austin area", "terms": ["austin", "round rock", "tx"] }`. Terms are matched as whole words against the posting's location, so a state code like `"tx"` works.
  - `remoteMustBeUS`: set it, and leave `nonUSMarkers` unchanged unless they're outside the US.
- **`scoring.json`**
  - `profile`: 2–4 sentences written from the interview.
  - `roles`: 2–5 role groups with `match` phrases and points. The best fit gets about 50, and weaker fits get 30–45.
  - `level`, `domains.terms`, `locationBonus`: adjust to match the user.
  - `claudeGuidance`: a few lines on how to weigh title, level, domain, and location for this person.
  - `node -e "import('./server/config.ts').then(m=>console.log(m.validateScoring(m.loadScoring())))"` must print `null`.
- **`companies.json`**: remove example companies the user doesn't want. For each new company, find its careers page and add it through the running server so the ATS is detected and tested:
  ```bash
  curl -s -X POST localhost:4321/api/companies -H 'content-type: application/json' -d '{"name":"Stripe","url":"https://stripe.com/jobs/search"}'
  ```
  Start the server first with `node server/index.ts`, and run it in the background. Greenhouse, Ashby, Lever, Workday, and iCIMS are read by script. Anything else becomes `claude-browse`, and the daily routine browses it.
- **`linkedin.json`**: 2–6 `searches`, each `{ "label", "url" }`. Build the URLs from `https://www.linkedin.com/jobs/search/?keywords=...&geoId=...&f_TPR=r86400&sortBy=DD`. Use `geoId=103644278` plus `f_WT=2` for remote US, and the metro's geoId for the home area (look it up with a LinkedIn location search). Add `f_E` for the experience level. Leave `searches` empty if they skipped LinkedIn.

## 4. First run
- Run `pnpm scan`. It prints a table per company. Fix or disable companies that error, except 403/429 rate limits, which pause on their own.
- Run `pnpm today`. It opens the dashboard at http://localhost:4321. Confirm that jobs appear in the Inbox and that the location filter shows their home-area label.
- Explain the keys: `i` interested, `r` looking for referral, `a` applied, `x` dismiss, `o` open, `j`/`k` move.

## 5. Daily routine (optional)
If they use the Claude desktop app, offer to create a weekday-morning scheduled task named "Job Radar daily". Its prompt is the contents of `routine/daily.md`, with the first line changed to name the absolute repo path. LinkedIn and the dashboard's Refresh button need Claude in Chrome connected to a browser where they're logged in to LinkedIn. Refresh runs `claude -p --chrome`, so the `claude` CLI must be on PATH.

## 6. Wrap up
Summarize what you configured, then tell them where to change it later: Settings → Scoring for the profile and points, the Companies view for companies, and `config/criteria.json` for title and location filters. Their data lives only in `data/jobs.db`, which git ignores.
