# TaskFlow

A Jira-style task manager built with Next.js (App Router), TypeScript and **MongoDB**. Images and videos are attached as **Google Drive links**.

## Run

```bash
npm install
cp .env.example .env.local     # then edit: at least MONGODB_URI (and SESSION_SECRET for anything non-local)
npm run dev                    # http://localhost:3000
# or: npm run build && npm start
```

Requires Node 20+ and a MongoDB (local, or Atlas — a standalone server is fine; no transactions or replica set are needed). Indexes are created automatically. With an empty database it seeds demo data (`SEED_DEMO_DATA=true`):

| Role   | Email                | Password   |
|--------|----------------------|------------|
| Admin  | admin@taskflow.dev   | admin123   |
| Member | priya@taskflow.dev   | password   |

**In production** set `SEED_DEMO_DATA=false` plus `ADMIN_EMAIL` / `ADMIN_PASSWORD` (and `ADMIN_NAME`): the first start then creates only that admin, with no demo logins. Also set `SESSION_SECRET` and, over HTTPS, `COOKIE_SECURE=true`.

## Migrating an existing SQLite database

If you used the earlier SQLite version, copy its data (ids, ticket keys, comments, history, sprints and mail log are preserved) into an **empty** Mongo database:

```bash
npm run migrate:sqlite                       # reads .data/taskflow.db
npm run migrate:sqlite -- path/to/other.db   # or a specific file
```

The script refuses to run if the target database already has users. Files uploaded in the old version stay in `.data/uploads` and are still served.

## Features

- **Boards per team** – only admins create/rename/delete boards and choose each board's **key** (e.g. `WEB`). Every ticket gets a unique `KEY-number` id (`WEB-1`, `WEB-2`, …), allocated atomically per board.
- **Home dashboard** – totals across all boards, a status breakdown and average progress per board, your assigned tickets, and a live activity feed.
- **Kanban board** – drag cards between To Do / In Progress / In Review / Done; filter by text, assignee, type, priority.
- **Ticket page** – inline-edit summary & description; status, assignee, priority, type, due date; reporter; time logged.
- **Images & videos via Google Drive** – paste a Drive share link (Share → *Anyone with the link*) on a ticket, or while creating one. Drive files get a thumbnail and open in an in-page Drive viewer (plays videos, shows images/PDFs); direct image/video URLs and any other link work too. Nothing heavy is stored in MongoDB or on the server. Optional: `ALLOW_FILE_UPLOADS=true` also enables uploading files to local disk (`.data/uploads`, up to 300 MB, with drag & drop / paste).
- **Progress updates** – post a note with % complete and hours spent; ticket progress and time logged update automatically.
- **Comments, full history** – every field change, attachment and progress change is recorded.
- **Sprints** – every board has its own sprints (planned → active → completed). The board shows the active sprint by default, with chips for other sprints, Backlog and All tickets. The *Sprints & backlog* page creates/starts/completes sprints and moves tickets between them; completing a sprint sends unfinished tickets back to the backlog or into the next planned sprint. One active sprint per board.
- **Assigned to** – shown under the ticket title (with an *Assign to me* shortcut), in the details panel, on cards and in lists.
- **Email notifications** – see below.
- **Light / dark theme** – toggle in the navbar (remembers your choice, defaults to your OS setting).
- **All tickets** – cross-board search & filters. Admin panel for users and roles.

## Email notifications

| Event | Who gets the email |
|-------|--------------------|
| Ticket assigned / reassigned to someone | the new assignee (not if you assign it to yourself) |
| Comment, progress update, field change (status, priority…), description edit or attachment by anyone **other than** the assignee | the assignee, including what was posted |
| The **assignee** posts or changes something | the ticket's reporter (the person who handed the work over), including what was posted |

You never get an email about your own action, and sprint moves don't send mail. Every email is stored under **Admin → Mail outbox**. Without SMTP settings it is *only* recorded there (handy for local development); to deliver real mail copy `.env.example` to `.env.local`, fill in `SMTP_*`, `MAIL_FROM` and `APP_URL` (used for links in the emails), and restart.

## Configuration

| Env var          | Purpose                                              |
|------------------|------------------------------------------------------|
| `MONGODB_URI` / `MONGODB_DB` | MongoDB connection string and database name (default `taskflow`) |
| `SEED_DEMO_DATA` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | First-run seeding (see Run) |
| `ALLOW_FILE_UPLOADS` | `true` to allow local-disk uploads (default off; use Drive links) |
| `SESSION_SECRET` | Cookie signing secret (auto-generated in `.data/` if unset — set it explicitly when hosting) |
| `DATA_DIR`       | Where optional local uploads are stored              |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_SECURE` / `MAIL_FROM` / `APP_URL` | Email delivery (see above) |
| `COOKIE_SECURE`  | Set to `true` when serving over HTTPS                |

## Documentation

`docs/TaskFlow-Documentation.docx` is the full product document: scope and roles, every feature, how the website works (12 diagrams), data model and business rules, API reference, configuration, testing and security. Regenerate it after changing features or APIs:

```bash
npm run docs     # renders docs/diagrams/diagrams.mjs to PNG (via Chrome), then builds the .docx
```

## Testing

Every use case has automated tests, and they are meant to be run after **every** change.

```bash
npm run verify        # type-check + unit/integration/component tests  (~40 s)  <- after every change
npm run test:e2e      # real-browser journeys against a real build     (~3 min) <- UI / flow changes
npm run verify:full   # both
```

| Layer | Folder | What it covers |
|---|---|---|
| Unit | `tests/unit` | link parsing (Drive/URL), formatting, constants |
| Integration | `tests/integration` | login/sessions & permissions, boards, users, tickets (numbering, validation, history), comments & progress, attachments, sprints, **email rules + SMTP**, DB seeding/indexes/concurrency, file & upload APIs, SQLite→Mongo migration |
| Component | `tests/components` | theme toggle, login, navbar, create-ticket dialog, ticket page widgets, attachments & Drive viewer, Kanban (filters, drag & drop), sprint pages, admin screens |
| End-to-end | `tests/e2e` | the whole app in Chrome: auth & access control, theme, dashboard, board, ticket lifecycle, sprints, Drive attachments, email notifications, administration |

Tests use a local MongoDB (`mongodb://127.0.0.1:27017`, or set `TEST_MONGODB_URI`) and only throwaway `taskflow_test_*` databases that are dropped afterwards — they refuse to run against a hosted database and never read `.env.local`. The end-to-end run starts its own server on port 3200 (`PW_CHANNEL=msedge` to use Edge instead of Chrome; `E2E_SKIP_BUILD=1` to reuse the last build).

A **pre-commit hook** (`.githooks/`, enabled by `npm install`) runs `npm run verify` before each commit, and **CI** (`.github/workflows/ci.yml`) runs everything on every push and pull request. `CLAUDE.md` records the working agreement for AI-assisted development: run the tests after each change and add tests with each feature or bug fix.

## Layout

- `lib/db.ts` – MongoDB connection, indexes, first-run seed, numeric id counters · `lib/queries.ts` – reads · `lib/actions.ts` – all mutations (server actions) · `lib/mail.ts` – notifications · `lib/links.ts` – Drive/URL link parsing
- `app/(app)/…` – Home, `boards/[key]` (+ `sprints`), `browse/[ticket]`, `issues`, `admin` (+ `mail`)
- `app/api/…` – optional file upload and streaming
- `scripts/migrate-sqlite-to-mongo.mjs` – one-off SQLite → MongoDB copy

Collections: `users`, `boards`, `tickets`, `sprints`, `comments` (comments and progress updates), `attachments` (Drive/URL links, plus optional local files), `activity`, `emails`, `counters`. Documents use small numeric `_id`s so URLs and ticket keys stay stable. Ticket numbers (`WEB-12`) come from an atomic counter on the board document.
