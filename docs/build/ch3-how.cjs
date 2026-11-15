const H = require("./helpers.cjs");
const { h1, h2, h3, p, bullets, numbered, table, callout, spacer, figure } = H;

module.exports = () => [
  h1("5. How the website works"),

  h2("5.1 Architecture"),
  p("TaskFlow is a single Next.js application. Pages are rendered on the server (React Server Components) straight from MongoDB, so the browser receives ready-made HTML. Interactive parts (the Kanban board, forms, the editor, dialogs) are React client components. Changes are sent to **Server Actions**, which are server functions the browser can call directly; files go through a few **route handlers** under `/api`."),
  ...figure("architecture", "System architecture: browser, Next.js server, services and data stores", { maxH: 640 }),
  table(
    ["Part", "Responsibility", "Where"],
    [
      ["Pages and layouts", "Load data, check the session, render HTML", "`app/(app)/…`"],
      ["Client components", "Kanban drag-and-drop, forms, editor, dialogs, theme toggle", "`components/`, `app/**/*Client.tsx`"],
      ["Server Actions", "Every create / update / delete; permission checks; validation; history; email triggers", "`lib/actions.ts`"],
      ["Queries", "Read data (with names, counts and sorting added)", "`lib/queries.ts`"],
      ["Sessions", "Sign the cookie, identify the user, `requireUser` / `requireAdmin`", "`lib/auth.ts`"],
      ["Sanitizer", "Allow-list for rich HTML, plain-text compatibility", "`lib/rich.ts`"],
      ["Notifications", "Decide recipients, build emails, send or record them", "`lib/mail.ts`"],
      ["Link helpers", "Recognise Google Drive / image / video / web links", "`lib/links.ts`"],
      ["Data layer", "MongoDB connection, indexes, first-run seed, numeric id counters", "`lib/db.ts`"],
      ["Route handlers", "File upload, file download (with ranges), ticket-id lookup", "`app/api/**`"],
    ],
    [2200, 4960, 2200],
  ),
  spacer(),

  h2("5.2 Life of a request"),
  p("Every change follows the same path. The example below shows a user posting a comment."),
  ...figure("requestFlow", "Sequence of posting a comment", { maxH: 560 }),
  ...numbered([
    "The browser submits the form. The editor’s HTML travels in a hidden field to the `addComment` Server Action.",
    "The action verifies the signed session cookie and loads the user. Anonymous callers are redirected to the login page.",
    "The HTML is cleaned by the allow-list sanitizer; empty content is rejected with “Write something first.”",
    "The comment is saved, the ticket’s “updated” time is refreshed and, for important changes, a line is added to the history.",
    "An email job is **scheduled to run after the response** so the user is never kept waiting.",
    "The action asks Next.js to revalidate the pages; the browser receives the fresh page and clears the editor.",
  ]),
  p("Reads are plain server-rendered queries. Pages are dynamic (never cached across users), so everyone always sees the latest data."),

  h2("5.3 Sign-in, sessions and permissions"),
  ...figure("auth", "Session check and sign-in flow", { maxH: 600 }),
  ...bullets([
    "Passwords are stored only as **bcrypt** hashes. The session cookie contains `userId.expiry.signature`; the signature is an HMAC-SHA-256 with a server secret, compared in constant time.",
    "Swapping the user id inside a cookie (to impersonate an administrator) invalidates the signature and the request is treated as anonymous.",
    "Administrator-only pages and actions call `requireAdmin`; members are redirected Home. The Admin link is hidden for members, but the server is the real gatekeeper.",
  ]),

  h2("5.4 Navigation map"),
  ...figure("sitemap", "Pages and how they connect", { maxH: 520 }),
  table(
    ["Route", "Page", "Access"],
    [
      ["`/login`", "Sign-in form with theme toggle", "Anyone"],
      ["`/`", "Home dashboard", "Signed in"],
      ["`/boards/{KEY}`", "Kanban board; `?sprint=` is a sprint id, `backlog` or `all`", "Signed in"],
      ["`/boards/{KEY}/sprints`", "Sprints and backlog planning", "Signed in"],
      ["`/browse/{KEY-number}`", "Ticket page", "Signed in"],
      ["`/issues`", "All tickets with search and filters (`q`, `board`, `status`, `type`, `priority`, `assignee`)", "Signed in"],
      ["`/admin`", "Boards and users", "Admin"],
      ["`/admin/mail`", "Mail outbox", "Admin"],
    ],
    [2900, 4960, 1500],
  ),
  spacer(),

  h2("5.5 The typical user journey"),
  ...figure("journey", "From set-up to sprint completion", { maxH: 520 }),
  ...numbered([
    "An administrator signs in, creates a board for each team and picks its key (for example **WEB**, **MOB**, **OPS**), then adds the team members.",
    "Members sign in, open their board and **create tickets**. Each ticket receives the next number for its board (`WEB-1`, `WEB-2`…).",
    "A team member (anyone) creates a **sprint**, moves tickets from the backlog into it and starts it. The board now opens on that sprint.",
    "While working, people drag cards across the columns, post **progress updates** (percentage, hours, rich notes) and discuss in **comments**, attaching screenshots and videos from Google Drive with the paperclip.",
    "Assignees and reporters receive **emails** about the changes that concern them.",
    "At the end of the sprint it is **completed**: finished work stays, unfinished tickets roll into the next sprint or return to the backlog, and the next sprint is started.",
  ]),

  h2("5.6 Ticket lifecycle"),
  ...figure("ticketLifecycle", "Ticket statuses and transitions", { maxH: 600 }),
  p("The four statuses are fixed. Although the diagram shows the usual path, a ticket can be moved from any column to any other (drag and drop or the Status control). Two automatic rules apply: moving to **Done** sets progress to 100%, and a progress update above 0% on a **To Do** ticket moves it to **In Progress**."),

  h2("5.7 Sprint lifecycle"),
  ...figure("sprintLifecycle", "Sprint states", { maxH: 560 }),
  ...bullets([
    "A board can have any number of planned sprints but only **one active** sprint.",
    "Completing a sprint moves its unfinished tickets (anything not Done) to the chosen destination and records the move in each ticket’s history.",
    "Deleting a sprint never deletes tickets; they return to the backlog.",
  ]),

  h2("5.8 Email notification logic"),
  ...figure("mailRules", "Who is emailed for which event", { maxH: 600 }),
  p("The recipient is decided by who performed the action. This avoids notifying people about their own work and keeps the assignee and the reporter in the loop in both directions. Sprint moves are treated as housekeeping and are silent. Recorded emails always contain a link back to the ticket (using the configured `APP_URL`)."),

  h2("5.9 Writing, attaching and displaying rich content"),
  ...figure("richWrite", "From the editor to the server", { maxH: 600 }),
  ...figure("richRead", "From the database to the page", { maxH: 520 }),
  ...bullets([
    "The browser **never** inserts unsanitized HTML: the server cleans content when it is saved and again when it is displayed.",
    "The paperclip uses `parseLink()` to classify a link as Google Drive, image, video or web. Drive files keep their file id so the viewer can embed `drive.google.com/file/d/{id}/preview` and show a thumbnail from `drive.google.com/thumbnail`.",
    "Thumbnails of private Drive files cannot load for people without access; the gallery then shows an icon, and the link still opens in Drive.",
    "Large uploads never touch MongoDB: only links and metadata are stored (MongoDB documents are limited to 16 MB).",
  ]),

  h2("5.10 Other behaviours worth knowing"),
  ...bullets([
    "**Unique ticket keys under concurrency**: the board’s counter is incremented atomically in MongoDB and `(board, number)` is a unique index, so two people creating tickets at the same moment never receive the same number (verified by a test that creates 25 tickets in parallel).",
    "**Optimistic board updates**: when you drop a card it moves on screen immediately while the change is saved in the background.",
    "**Forms** are submitted without React’s automatic reset, so validation errors never erase what you typed.",
    "**Sticky navigation**: the navbar stays visible; scrolling to anchors accounts for its height.",
    "**Menus** close when you choose a link but not when you press a button, so actions such as Log out always complete.",
  ]),
];
