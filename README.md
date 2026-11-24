# ReportReady

A web app that turns a class's marks into draft report comments in the teacher's own voice. The teacher reviews, edits and exports them. The full spec is in `teacher-application-firstdraft.txt`.

**Status:** Weeks 1 and 2 are built, plus import and export work aimed at real teachers:
- Excel/CSV upload or paste-from-Excel, with column matching that the app remembers
- export to Excel, Word, PDF and CSV
- a first-time guide, help bubbles, and dark mode by default

Next: test with a real teacher and fill in the school's own report template.

## Stack

- **server/**: Node 24, Express 5, PostgreSQL 15+ (`pg`), JWT auth with bcrypt
- **client/**: React 19 + Vite

## Setup

1. Get PostgreSQL **15 or newer**, either a local install or a free hosted database (Neon, Render). The schema uses `UNIQUE NULLS NOT DISTINCT`, which needs version 15.
2. Configure and start the API:

   ```sh
   cd server
   cp .env.example .env      # then set DATABASE_URL and JWT_SECRET
   npm install
   npm run migrate           # creates the tables (safe to re-run)
   npm run seed              # fake class 5B with 30 learners
   ```

3. Install the front end, then start everything from the project root:

   ```sh
   cd client && npm install && cd ..
   npm install               # once, in the project root
   npm run dev               # starts the API and the website: http://localhost:5173
   ```

4. Log in as `demo@example.com` / `demo-password` (Ms Mokoena). Class 5B has term 2 comments in every state; class 6A has none yet. `npm run seed` resets only this account.
5. For AI drafting, install [Ollama](https://ollama.com) and download a model. It's free and runs on your own computer.
   - **Recommended:** `ollama pull gemma3:12b`, then set `OLLAMA_MODEL=gemma3:12b` in `server/.env`. It needs about 8 GB of disk and a graphics card with about 12 GB of memory, and it sticks to the marks better.
   - **Lighter:** `ollama pull llama3.2:3b` (the default). It fits on more computers but invents details more often.

   To use Claude instead (paid), set `AI_PROVIDER=claude` and `ANTHROPIC_API_KEY` in `server/.env`, then restart the API.

## Starting, sharing and backups (Windows)

- **`Start ReportReady.bat`:** double-click to start Ollama (if installed), the app and a browser tab. Close its window to stop the app.
- **`Share ReportReady.bat`:** double-click to get a temporary `https://….trycloudflare.com` link for testing on another device, using a free [Cloudflare quick tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/).
  - Needs `cloudflared`: install it with `winget install Cloudflare.cloudflared`.
  - Everything, including the AI, still runs on this computer. Nothing is stored online.
  - The link works only while that window is open, and it changes each time.
  - Anyone with the link can reach the login page, so close the window when testing is done.
- **`npm run backup`:** saves the whole database to `backups/report-ready-<date>-<time>.sql`. The folder is git-ignored, because backups contain learner data. To restore, run `psql "<DATABASE_URL>" -f backups/<file>.sql`.

## How it works for a teacher

1. **My style:** paste 3–5 old report comments, with `{name}` where the learner's name goes.
2. **Class page:** import marks and check the summary. Each learner is flagged *struggling* (below 40%), *slipping* (down 5+ points), *improving* (up 5+ points) or *steady*.
3. **Write term comments:** one click drafts a general comment for every learner who doesn't have one yet. The learner's marks are shown next to each draft, so it's easy to check the AI didn't invent anything.
4. Edit, then **Approve**. Ctrl+Enter approves and jumps to the next comment, and the counter shows "18 of 32 approved". Use **Redraft** for a fresh attempt and **Copy** to paste into SA-SAMS. Nothing is final until it's approved.
5. **Export approved** as Excel, Word, PDF (a print page; choose "Save as PDF") or CSV.

New accounts get a short welcome guide and a getting-started checklist. A **?** beside some items opens a one-line explanation. The app starts in dark mode; the sun/moon button switches it.

Drafting is set by `AI_PROVIDER`:
- **`ollama` (default):** a free local model, `OLLAMA_MODEL`, default `llama3.2:3b`. Marks never leave the computer.
- **`claude`:** Claude Opus 5.5 (`claude-opus-5-5`) at low effort. If the model declines a request, the API retries it on a fallback model (`fallbacks: "default"`).

Both draft 5 learners at a time and must reply as JSON (`{"comment": …}`). A draft that fails its checks (missing `{name}`, or too long) is retried once. If it still fails, the learner gets an empty comment for the teacher to write. Generating again only fills empty comments; it never overwrites text the teacher has written.

## Importing marks

Teachers use the mark sheet they already have: upload an `.xlsx`/`.csv` or paste cells from Excel. Then they match columns:

- **Guessed for them:**
  - the header row, skipping title rows
  - the name and learner-code columns
  - how names are written ("MOKOENA Thandi", "Thandi Mokoena", "Mokoena, Thandi")
  - each mark column's "out of", from headers like `Test (50)` or an "Out of" row
  - the subject, from the sheet name
- **Left out automatically:** totals and % columns.
- **Blank cells:** skipped, not counted as zero.
- **Surnames:** removed in the browser, so they never reach the server.
- **Memory:** the matching is remembered per class, so the next import is one click.

Try [`server/db/sample-teacher-marks.xlsx`](server/db/sample-teacher-marks.xlsx): two subject sheets, a title row, surname-first names, an "Out of" row and formula totals.

The app's own long format (`learner_code,first_name,subject,assessment,term,max_mark,mark`) is still accepted as-is. `server/db/sample-import.csv` has two deliberate errors, so you can see how problems are reported. Nothing is saved until the teacher confirms, and the server checks the rows again before saving them in a single transaction.

## Tests

```sh
cd server && npm test
```

These cover:
- CAPS levels and trend flags
- import validation, and reading `.xlsx` files with title rows, formulas and several sheets
- CSV, Excel and Word export, including CSV protection against formula injection
- what the AI is sent, including that no names or learner codes are sent
- draft checks, retries and concurrency, using a stand-in model

## Privacy

Learner marks are personal information under POPIA, and these learners are children.

- **Stored:** only first names and a learner code chosen by the teacher. Never surnames, ID numbers or contact details.
- **Shared first names:** when two learners share a first name, only the first letter of each surname is kept ("Thandi M." and "Thandi D."), and only for those learners. Comments still just say "Thandi". If the app can't tell them apart (no learner code, no surname, or the same initial), the import is blocked with a clear explanation rather than merging the two learners.
- **Sent to the AI:** grade, term, and each subject's average, CAPS level and change from last term, plus the teacher's style examples. Never a name or learner code. The model writes `{name}`, and the server swaps in the first name after the reply arrives. All prompt text is built in [`server/src/lib/prompt.js`](server/src/lib/prompt.js), so there's one place to audit.
- **Style examples:** names of the teacher's own learners are replaced with `{name}` automatically. An example that still has no `{name}` is rejected, so other real names aren't sent by accident.
- **Logs:** failed drafts are logged by learner id only.
- **Ownership:** every class, comment and style-example route checks that the data belongs to the logged-in teacher, and returns 404 otherwise.
