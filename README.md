# TaskFlow

A Jira-style task manager built with Next.js (App Router), TypeScript and SQLite (Node's built-in `node:sqlite`, so there are no native modules to compile).

## Run

```bash
npm install
npm run dev        # http://localhost:3000
# or: npm run build && npm start
```

Requires **Node 22.13+** (developed on Node 24). Data lives in `.data/` (SQLite DB + uploaded files); delete that folder to reset. On first run it is seeded with demo data.

| Role   | Email                | Password   |
|--------|----------------------|------------|
| Admin  | admin@taskflow.dev   | admin123   |
| Member | priya@taskflow.dev   | password   |

## Features

- **Boards per team** – only admins create/rename/delete boards and choose each board's **key** (e.g. `WEB`). Every ticket gets a unique `KEY-number` id (`WEB-1`, `WEB-2`, …), allocated atomically per board.
- **Home dashboard** – totals across all boards, a status breakdown and average progress per board, your assigned tickets, and a live activity feed.
- **Kanban board** – drag cards between To Do / In Progress / In Review / Done; filter by text, assignee, type, priority.
- **Ticket page** – inline-edit summary & description; status, assignee, priority, type, due date; reporter; time logged.
- **Attachments** – images, videos, any file. Drag & drop, browse, or paste screenshots. Image/video lightbox, video seeking (HTTP Range), progress bar, up to 300 MB each (`MAX_UPLOAD_MB` in `lib/constants.ts`).
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
| `SESSION_SECRET` | Cookie signing secret (auto-generated in `.data/` if unset) |
| `DATA_DIR`       | Where the DB and uploads are stored                  |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_SECURE` / `MAIL_FROM` / `APP_URL` | Email delivery (see above) |
| `COOKIE_SECURE`  | Set to `true` when serving over HTTPS                |

## Layout

- `lib/db.ts` – schema, seed, query helpers · `lib/actions.ts` – all mutations (server actions) · `lib/queries.ts` – reads
- `app/(app)/…` – Home, `boards/[key]`, `browse/[ticket]`, `issues`, `admin`
- `app/api/…` – attachment upload and file streaming
