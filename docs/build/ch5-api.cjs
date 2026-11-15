const H = require("./helpers.cjs");
const { h1, h2, h3, p, bullets, numbered, table, code, callout, spacer } = H;

module.exports = () => [
  h1("7. API reference"),
  p("TaskFlow exposes two kinds of programmatic interfaces: a small set of **HTTP route handlers** under `/api` (files and lookups), and **Server Actions** that the web interface calls for every create, update and delete. Both require a signed-in session and enforce the same permissions."),

  h2("7.1 Conventions"),
  table(
    ["Topic", "Detail"],
    [
      ["Base URL", "The address the application is served on, e.g. `http://localhost:3000` (set `APP_URL` for links in emails)"],
      ["Authentication", "Session cookie `tf_session` (httpOnly, `SameSite=Lax`, 7 days, `Secure` when `COOKIE_SECURE=true`). There are no API tokens: obtain the cookie by signing in through the login page"],
      ["Authorization", "Anonymous → **401** (APIs) or redirect to `/login` (pages). Insufficient role → redirect Home (pages / actions) or **403** (APIs)"],
      ["Content types", "Route handlers use JSON (`application/json`) or `multipart/form-data` for uploads; files are streamed with their own type"],
      ["Error shape (JSON routes)", "`{ \"error\": \"message\" }` with the HTTP status code. Plain-text routes return the message as text"],
      ["Identifiers", "Numeric ids (`id`) and ticket keys such as `WEB-12`"],
      ["Rate limiting", "None built in (deploy behind a gateway if needed)"],
    ],
    [2300, 7060],
  ),
  spacer(),

  h2("7.2 Route handlers"),
  table(
    ["Method and path", "Purpose", "Access"],
    [
      ["`GET /api/ticket-id?key={KEY-n}`", "Resolve a ticket key to its numeric id", "Signed in"],
      ["`GET /api/files/{id}`", "Stream an uploaded file (inline or as a download) with HTTP range support", "Signed in"],
      ["`POST /api/tickets/{id}/attachments`", "Upload one or more files to a ticket (only when `ALLOW_FILE_UPLOADS=true`)", "Signed in"],
    ],
    [3700, 4360, 1300],
  ),
  spacer(),

  h3("GET /api/ticket-id"),
  p("Looks up a ticket by its key. The key is case-insensitive (`web-1` equals `WEB-1`)."),
  table(
    ["Item", "Detail"],
    [
      ["Query", "`key` — ticket key such as `WEB-12`"],
      ["200", "`{ \"id\": 12 }`"],
      ["401", "`{ \"error\": \"Unauthorized\" }`"],
      ["404", "`{ \"error\": \"Not found\" }` — malformed key, unknown board or number"],
    ],
    [1700, 7660],
  ),
  ...code(["curl -b \"tf_session=<cookie>\" \"http://localhost:3000/api/ticket-id?key=WEB-1\"", "", "{ \"id\": 1 }"]),

  h3("GET /api/files/{id}"),
  p("Streams a file that was uploaded to the server (attachments of kind `file`). Link attachments (Google Drive and other URLs) have no file here and return 404. The response is safe by design: scripts cannot run from it."),
  table(
    ["Item", "Detail"],
    [
      ["Path", "`id` — attachment id"],
      ["Query", "`download=1` — force a download instead of showing the file inline"],
      ["Request header", "`Range: bytes=a-b`, `bytes=a-` or `bytes=-n` (used by video players to seek)"],
      ["200 / 206", "File body. `206 Partial Content` with `Content-Range: bytes a-b/total` for range requests"],
      ["401 / 404 / 416", "`Unauthorized` · `Not found` (unknown id, link attachment) or `File missing` (not on disk) · `Content-Range: bytes */total` when the range is outside the file"],
      ["Content-Type", "The stored type for images (png, jpeg, gif, webp, avif, bmp), video, audio, PDF and plain text; `application/octet-stream` for everything else (HTML, SVG, executables…)"],
      ["Content-Disposition", "`inline; filename*=UTF-8''name` for the types above, otherwise (or with `download=1`) `attachment; …`"],
      ["Security headers", "`X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox`, `Cache-Control: private, max-age=3600`, `Accept-Ranges: bytes`"],
      ["Path safety", "Only the base name of the stored file is used, so the lookup can never leave the upload folder"],
    ],
    [2000, 7360],
  ),
  ...code(["curl -b \"tf_session=<cookie>\" -H \"Range: bytes=0-1023\" -o part.bin http://localhost:3000/api/files/7", "", "HTTP/1.1 206 Partial Content", "Content-Range: bytes 0-1023/52428800", "Content-Type: video/mp4"]),

  h3("POST /api/tickets/{id}/attachments"),
  p("Stores uploaded files on the server’s disk and records them as attachments. **Disabled by default**: images and videos are normally attached as Drive links with the paperclip icon. Enable with `ALLOW_FILE_UPLOADS=true`."),
  table(
    ["Item", "Detail"],
    [
      ["Path", "`id` — ticket id"],
      ["Body", "`multipart/form-data` with one or more parts named `files`"],
      ["Limit", "300 MB per file (`MAX_UPLOAD_MB`)"],
      ["200", "`{ \"saved\": [ { \"id\": 12, \"filename\": \"notes.txt\" } ] }`. Also writes a history entry per file, updates the ticket and sends one notification"],
      ["400", "`{ \"error\": \"No files\" }`"],
      ["401", "`{ \"error\": \"Not signed in\" }`"],
      ["403", "`{ \"error\": \"File uploads are disabled. Attach a Google Drive link instead.\" }`"],
      ["404", "`{ \"error\": \"Ticket not found\" }`"],
      ["413", "`{ \"error\": \"<name> exceeds 300 MB\" }`"],
      ["Stored name", "A random UUID plus the sanitized extension; the client’s file name is never used on disk"],
    ],
    [1700, 7660],
  ),
  ...code(["curl -b \"tf_session=<cookie>\" -F \"files=@notes.txt\" -F \"files=@shot.png\" \\", "     http://localhost:3000/api/tickets/5/attachments", "", "{ \"saved\": [ { \"id\": 12, \"filename\": \"notes.txt\" }, { \"id\": 13, \"filename\": \"shot.png\" } ] }"]),

  h2("7.3 Server Actions"),
  p("Server Actions live in `lib/actions.ts`. The web interface calls them directly (Next.js sends a POST request with a `Next-Action` header and serialized arguments); they are **not** a public REST interface and their wire format may change between Next.js versions. They are documented here because they are the complete set of operations the system supports. Where an action takes form data (`fd`) the field names are listed."),
  p("Actions that return a state object use `{ ok?: string; error?: string }`. Failed permission checks redirect (administrator checks to `/`, anonymous callers to `/login`) instead of returning."),

  h3("Authentication"),
  table(
    ["Action", "Inputs", "Who", "Result and rules"],
    [
      ["`login(prev, fd)`", "`email`, `password`", "Anyone", "Success → sets the session cookie and redirects to `/`. Failure → `{ error: \"Invalid email or password.\" }`"],
      ["`logout()`", "—", "Signed in", "Deletes the cookie and redirects to `/login`"],
    ],
    [1900, 1900, 1100, 4460],
  ),
  spacer(),

  h3("Boards and users (administrators)"),
  table(
    ["Action", "Inputs", "Result and rules"],
    [
      ["`createBoard(prev, fd)`", "`name`, `key`, `description`, `color`", "`{ ok: \"Board WEB created.\" }`. Errors: name required; key must match `^[A-Z][A-Z0-9]{1,9}$`; “The key WEB is already used by another board.” Invalid colours fall back to the default"],
      ["`updateBoard(id, prev, fd)`", "`name`, `description`, `color`", "`{ ok: \"Saved.\" }`. The key is never changed. Name required"],
      ["`deleteBoard(id)`", "board id", "Deletes the board with its tickets, comments, history, attachments (and stored files) and sprints"],
      ["`createUser(prev, fd)`", "`name`, `email`, `password`, `role`", "`{ ok: \"<name> added.\" }`. Errors: name and valid email required; password at least 6 characters; “That email is already registered.” Unknown roles become `member`"],
      ["`setUserRole(id, role)`", "user id, `member` or `admin`", "No effect on yourself or for other values"],
      ["`deleteUser(id)`", "user id", "Removes the user, their comments, history entries and attachments; unassigns their tickets. Not allowed on yourself"],
    ],
    [2200, 2300, 4860],
  ),
  spacer(),

  h3("Tickets (any signed-in user; delete is restricted)"),
  table(
    ["Action", "Inputs", "Result and rules"],
    [
      ["`createTicket(input)`", "`{ boardId, title, description?, type?, priority?, assigneeId?, dueDate?, sprintId?, links?[{url,name?}] }`", "`{ key: \"WEB-7\" }` or `{ error }` (“Summary is required.”, “Choose a board.”). Description is sanitized; invalid type / priority fall back to `task` / `medium`; the sprint must be an open sprint of the board; valid links become attachments; assigning someone else sends an email"],
      ["`updateTicket(id, field, value)`", "`field`: `title`, `description`, `type`, `status`, `priority`, `assignee_id`, `due_date`, `sprint_id`", "Validates the value (invalid or unchanged values are ignored), saves, writes a history entry and sends the appropriate email. `status = done` sets progress 100. `sprint_id` must be an open sprint of the ticket’s board"],
      ["`deleteTicket(id)`", "ticket id", "Reporter or admin only (others are ignored). Deletes comments, attachments (and files) and history; redirects to the board"],
    ],
    [2200, 2700, 4460],
  ),
  spacer(),

  h3("Comments, progress updates and attachments"),
  table(
    ["Action", "Inputs", "Result and rules"],
    [
      ["`addComment(ticketId, prev, fd)`", "`body` (rich HTML)", "`{ ok: \"Comment added.\" }` or `{ error: \"Write something first.\" }` / “Ticket not found.” Sanitized; refreshes the ticket; notifies"],
      ["`addProgress(ticketId, prev, fd)`", "`body`, `progress` (0–100, optional), `hours` (optional)", "`{ ok: \"Progress update posted.\" }`. Errors: “Describe what you did.”, “Progress and hours must be numbers.” Updates ticket progress, logs the change, moves To Do → In Progress when progress > 0, notifies"],
      ["`deleteComment(id)`", "comment id", "Author or admin only"],
      ["`addLinkAttachment(ticketId, prev, fd)`", "`url`, `name` (optional)", "`{ ok: \"Link attached.\" }` or `{ error: \"Paste a full link starting with https://\" }`. Classifies the link (Drive / image / video / web); logs; notifies. Called by the editor’s paperclip"],
      ["`deleteAttachment(id)`", "attachment id", "Uploader or admin only; removes a stored file for local uploads; logs the removal"],
    ],
    [2500, 2300, 4560],
  ),
  spacer(),

  h3("Sprints (any signed-in user)"),
  table(
    ["Action", "Inputs", "Result and rules"],
    [
      ["`createSprint(boardId, prev, fd)`", "`name`, `goal`, `start`, `end`", "`{ ok }`. Errors: “Sprint name is required.”, “End date must be after the start date.”, “Board not found.”"],
      ["`startSprint(id)`", "sprint id", "`{}` or `{ error }`: only planned sprints start; “\"<name>\" is already active. Complete it before starting another.”"],
      ["`completeSprint(id, moveTo)`", "sprint id, target planned sprint id or `null`", "Moves unfinished tickets to the target (or backlog), logs each move, marks the sprint completed. Only an active sprint can be completed"],
      ["`deleteSprint(id)`", "sprint id", "Tickets return to the backlog. “Complete the active sprint before deleting it.” for active sprints"],
    ],
    [2500, 2300, 4560],
  ),
  spacer(),

  h2("7.4 Rich-text content contract"),
  p("Fields that accept rich text (`description` of `createTicket` / `updateTicket`, `body` of `addComment` / `addProgress`) accept either **plain text** or **HTML**. HTML is reduced to the allow-list in section 10.3 before it is stored; text without tags is stored as written and displayed as paragraphs. Empty content (for example `<p></p>`) clears a description and is rejected for comments and updates."),
  ...code([
    "<h2>Plan</h2>",
    "<ul><li><p>one</p></li></ul>",
    "<pre><code>npm run verify</code></pre>",
    "<p><a href=\"https://drive.google.com/file/d/ID/view\" class=\"media-link\"",
    "   data-media=\"drive\" data-drive-id=\"ID\">Mockup.png</a></p>",
  ], "Example of accepted rich content"),
  callout("Calling actions from other programs", "Because Server Actions are an internal protocol, integrations should either use the three route handlers above or add new, explicit route handlers (for example `app/api/tickets/route.ts`) that call the same functions in `lib/`. Doing so keeps validation, permissions, history and notifications identical to the web interface."),
];
