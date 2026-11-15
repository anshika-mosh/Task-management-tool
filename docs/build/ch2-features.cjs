const H = require("./helpers.cjs");
const { h1, h2, h3, p, bullets, table, callout, spacer } = H;

module.exports = () => [
  h1("4. Features and functionality"),
  p("This chapter lists everything the product does, grouped by area. Section 5 explains how these pieces work together."),

  h2("4.1 Accounts and sign-in"),
  ...bullets([
    "**Sign in** with email and password. Email is case-insensitive. A wrong email and a wrong password produce the same message (“Invalid email or password.”) so accounts cannot be probed.",
    "After a failed attempt the form keeps what you typed, so only the password needs correcting.",
    "Sessions last **7 days** and are stored in a signed, httpOnly cookie. Tampered, expired or forged cookies, and cookies of deleted users, are rejected.",
    "**Log out** from the avatar menu ends the session immediately.",
    "Every private page and API redirects anonymous visitors to the login page (APIs answer HTTP 401).",
  ]),

  h2("4.2 Home dashboard"),
  ...bullets([
    "Four summary tiles: number of boards, total tickets, tickets in flight, and percentage completed.",
    "A card per board with its key, description, active sprint and “done / total”, a stacked status bar (To Do, In Progress, In Review, Done), a legend with counts and the average progress.",
    "“Assigned to you”: your open tickets with type, priority and status.",
    "“Recent activity”: the latest changes across all boards, each linking to its ticket.",
  ]),

  h2("4.3 Boards and the Kanban view"),
  ...bullets([
    "Each board has a **name**, an uppercase **key** (2–10 letters or digits, starting with a letter), a description and a colour. Only administrators create, edit or delete boards. The key cannot be changed after creation.",
    "The Kanban view has four columns: **To Do, In Progress, In Review, Done**, each with a ticket count.",
    "**Drag and drop** a card to another column to change its status. The card moves immediately and the change is saved; moving to Done sets progress to 100%.",
    "Cards show the type icon, key, title, priority stripe, assignee avatar, attachment and comment counts and a progress bar for started work.",
    "**Filters**: free-text search (title or key), assignee (anyone, me, unassigned or a named person), type and priority, with a “Clear filters” button.",
    "**Sprint views**: the board opens on the active sprint (with a banner showing dates, goal, days left and progress). Chips switch to other sprints, the Backlog, or All tickets; completed sprints are in a drop-down.",
  ]),

  h2("4.4 Tickets"),
  table(
    ["Field", "Details"],
    [
      ["Key", "`BOARDKEY-number`, e.g. `WEB-12`. Unique, never reused, numbered per board by an atomic counter"],
      ["Summary", "Up to 250 characters; edited in place (Enter saves, Escape reverts)"],
      ["Description", "Rich text (see 4.6); edited in place with Save / Cancel; Save is enabled only after a real change"],
      ["Type", "Task, Story, Bug, Epic"],
      ["Status", "To Do, In Progress, In Review, Done"],
      ["Priority", "Highest, High, Medium, Low, Lowest"],
      ["Assigned to", "Any user or Unassigned. Shown under the title with an avatar and an **Assign to me** shortcut, in the Details panel, on cards and in lists"],
      ["Reporter", "The person who created the ticket"],
      ["Sprint", "A planned or active sprint of the same board, or Backlog"],
      ["Due date", "Optional date"],
      ["Progress", "0–100%, updated through progress updates; 100% when moved to Done"],
      ["Time logged", "Sum of hours entered in progress updates"],
      ["Attachments", "Drive files, images, videos and links (see 4.7)"],
    ],
    [2000, 7360],
  ),
  spacer(),
  ...bullets([
    "**Create ticket** is available from the navbar on every page: board, type, summary, rich description, priority, assignee, sprint (defaults to the active sprint) and due date.",
    "**Details panel**: status, assignee, sprint, priority, type and due date are changed with a single control and are saved immediately.",
    "**History** tab: every change is recorded with who, what, from and to, and when (creation, field changes, progress changes, attachments added or removed, sprint moves).",
    "**Delete**: the reporter or an administrator can delete a ticket (with its comments, history and attachments) after confirming in a dialog.",
    "**Search**: the navbar search box and the **All tickets** page search by words or by ticket key (`WEB-3`, `web-`). All tickets also filters by board, status, type, priority and assignee, and has a Reset button that clears every filter.",
  ]),

  h2("4.5 Comments and progress updates"),
  ...bullets([
    "**Comments** and **progress updates** use the same Word-style editor as the description, so lists, code, tables, quotes and attachments work everywhere.",
    "A **progress update** adds a note plus an optional percentage (slider) and hours spent. The percentage updates the ticket’s progress; hours add up to “Time logged”. A To Do ticket with progress above 0% moves to In Progress automatically.",
    "The Activity area has three tabs: **Updates & comments** (everything, newest first), **Progress** (progress updates only) and **History**.",
    "Authors and administrators can delete their entries after confirming.",
    "Empty submissions (blank paragraphs, spaces) are rejected with a clear message.",
  ]),

  h2("4.6 Word-style rich-text editor"),
  p("The description, every comment and every progress update use the same editor. A toolbar sits above the writing area; common keyboard shortcuts (Ctrl+B, Ctrl+I, Ctrl+U, Ctrl+Z, Ctrl+Y) and markdown-style typing (`- ` for bullets, `1. ` for numbers, `## ` for headings) also work."),
  table(
    ["Group", "Tools"],
    [
      ["History", "Undo, Redo"],
      ["Headings", "Heading 1, 2, 3"],
      ["Text style", "Bold, Italic, Underline, Strikethrough, Highlight, inline Code"],
      ["Lists", "Bullet list, Numbered list, Checklist (task list)"],
      ["Blocks", "Quote, Code block, Divider (horizontal rule)"],
      ["Alignment", "Left, Center, Right"],
      ["Tables", "Insert a 3×3 table with a header row; add column, add row, delete table appear while the cursor is in a table"],
      ["Links", "Link dialog (not a browser prompt) to create or edit a hyperlink; Unlink"],
      ["Attach", "Paperclip icon: Google Drive file, image, video or web link (see 4.7)"],
      ["Clean-up", "Clear formatting"],
    ],
    [1900, 7460],
  ),
  spacer(),
  ...bullets([
    "Content is stored as HTML and **sanitized on the server** with a strict allow-list (see section 10). Pasted or typed markup such as `<script>` is displayed as text and never runs.",
    "Plain-text content written before the editor existed is still displayed correctly.",
    "Formatted content looks the same in the editor, on the ticket page and in notification emails.",
  ]),

  h2("4.7 Attachments: images and videos as Google Drive links"),
  ...bullets([
    "The **paperclip icon** in the editor toolbar is the only place to attach: there is no separate link form. It opens a dialog for the link and an optional name, with instructions for sharing a Drive file (“Anyone with the link”).",
    "**Google Drive files** (including multi-account `/u/1/` links and `open?id=` links) become a chip carrying the Drive id. Clicking it opens Drive’s own player in a viewer on the page, so videos play and images, PDFs and documents display without leaving TaskFlow.",
    "**Direct image URLs** are embedded in the text; **video and other web URLs** become link chips. Only `http` and `https` links are accepted (`javascript:`, `data:` and similar are refused).",
    "In the **description** editor an attached item is also registered as a **ticket attachment**: it appears in the Attachments gallery with a Drive thumbnail, who added it and when, and the ticket shows an attachment count on its card. In comments it appears inline only.",
    "Attachments can be removed by their uploader or an administrator after a confirmation dialog; removal is written to the history.",
    "Optional: when `ALLOW_FILE_UPLOADS=true` the server also accepts files up to 300 MB on local disk, with drag-and-drop, paste and video seeking. This is off by default.",
  ]),

  h2("4.8 Sprints and backlog"),
  ...bullets([
    "Every board has its own sprints with a name, goal, start and end date and a status: **planned**, **active** or **completed**.",
    "The **Sprints & backlog** page lists sprints and the backlog with their tickets; each ticket has a selector to move it between the backlog and any open sprint.",
    "**Start sprint** activates a planned sprint. Only one sprint per board can be active; starting a second one explains which sprint must be completed first.",
    "**Complete sprint** asks where unfinished tickets should go: back to the backlog or into another planned sprint. Finished tickets stay in the completed sprint, which becomes read-only.",
    "A planned or completed sprint can be deleted (its tickets return to the backlog); the active sprint cannot.",
    "Sprint moves are written to each ticket’s history but do not send emails.",
  ]),

  h2("4.9 Email notifications"),
  table(
    ["When", "Who receives the email", "Content"],
    [
      ["A ticket is assigned or reassigned (including when created already assigned)", "The new assignee (not when you assign it to yourself)", "Who assigned it, the ticket card and a description preview"],
      ["Someone other than the assignee comments, posts a progress update, changes a field, edits the description or attaches something", "The assignee", "What happened and the formatted text that was posted"],
      ["The assignee does any of the above", "The reporter (the person who handed over the work)", "What happened and the formatted text that was posted"],
      ["The reporter is also the assignee", "Nobody", "—"],
      ["No assignee and someone other than the reporter acts", "The reporter", "What happened"],
      ["Sprint planning moves", "Nobody", "—"],
    ],
    [3600, 2800, 2960],
  ),
  spacer(),
  ...bullets([
    "You never receive email about your own action.",
    "Every email is stored in the **Mail outbox** (administrators only) with recipient, subject, status and a preview of the message.",
    "With SMTP configured, mail is delivered and marked **sent** (or **failed** with the reason). Without SMTP the message is only recorded and marked **logged**, which is ideal for development.",
    "Sending happens after the response, so a slow or failing mail server never slows down or breaks the user’s action.",
  ]),

  h2("4.10 Administration"),
  ...bullets([
    "**Boards**: create (the key is suggested from the name, e.g. “Design Systems Team” → `DST`), edit name, description and colour, delete with confirmation (removes tickets, comments, history, attachments and sprints).",
    "**Users**: add a member or admin with name, email and password (minimum 6 characters), change a user’s role, remove a user (their comments and history entries are removed and their tickets become unassigned).",
    "**Mail outbox**: browse every notification email and see whether SMTP is configured.",
  ]),

  h2("4.11 User interface"),
  ...bullets([
    "A modern interface with soft surfaces, rounded cards, a blurred sticky navigation bar, smooth hover and focus effects and consistent iconography.",
    "**Light and dark themes**: a toggle in the navbar (and on the login page). The choice is remembered; by default the operating-system setting is followed, with no flash on load.",
    "**In-app dialogs instead of browser alerts**: every confirmation (delete ticket, board, sprint, user, comment or attachment) is a styled modal that can be answered with its buttons, Enter, Escape or a click outside. Link and attachment dialogs are modals too. Escape closes only the top-most dialog.",
    "Forms keep what you typed when the server reports a validation error.",
    "Responsive layout for laptops and narrower screens.",
  ]),
];
