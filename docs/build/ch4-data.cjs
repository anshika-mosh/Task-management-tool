const H = require("./helpers.cjs");
const { h1, h2, h3, p, bullets, table, callout, spacer, figure } = H;

module.exports = () => [
  h1("6. Data model and business rules"),

  h2("6.1 Collections"),
  p("The data lives in MongoDB. Every document has a small numeric `_id` taken from an atomic counter (`counters` collection), which keeps ids short in URLs and lets the ticket key (`WEB-12`) stay stable. Timestamps are ISO-8601 strings and calendar dates are `YYYY-MM-DD` strings."),
  ...figure("dataModel", "Entities and their relationships (main fields shown)", { maxH: 480 }),
  table(
    ["Collection", "Purpose", "Main fields"],
    [
      ["`users`", "Accounts", "`name`, `email` (unique, lowercase), `password_hash`, `role` (member / admin), `color`, `created_at`"],
      ["`boards`", "Teams’ boards", "`key` (unique), `name`, `description`, `color`, `counter` (last ticket number)"],
      ["`tickets`", "Work items", "`board_id`, `number` (unique with `board_id`), `title`, `description` (HTML or legacy text), `type`, `status`, `priority`, `assignee_id`, `reporter_id`, `progress`, `due_date`, `sprint_id`, `created_at`, `updated_at`"],
      ["`sprints`", "Iterations", "`board_id`, `name`, `goal`, `start_date`, `end_date`, `status` (planned / active / completed), `completed_at`"],
      ["`comments`", "Comments and progress updates", "`ticket_id`, `user_id`, `kind` (comment / progress), `body` (HTML), `progress`, `hours`, `created_at`"],
      ["`attachments`", "Files and links", "`ticket_id`, `user_id`, `kind` (link / file), `link_type` (drive / image / video / web), `url`, `drive_id`, `filename`; for local uploads also `stored_name`, `mime`, `size`"],
      ["`activity`", "History entries", "`ticket_id`, `user_id`, `action` (created / changed / added / removed), `field`, `old_value`, `new_value`, `created_at`"],
      ["`emails`", "Mail outbox", "`to_email`, `to_name`, `subject`, `html`, `ticket_key`, `status` (queued / sent / failed / logged), `error`, `created_at`"],
      ["`counters`", "Id allocation", "`_id` = collection name, `seq`"],
      ["`meta`", "First-run seeding marker", "`_id: \"seeded\"`"],
    ],
    [1700, 2300, 5360],
    { size: 17 },
  ),
  spacer(),
  h3("Indexes (enforced by the database)"),
  ...bullets([
    "`users.email` unique · `boards.key` unique · `tickets (board_id, number)` unique",
    "`tickets.assignee_id`, `tickets.sprint_id`, `comments (ticket_id, created_at)`, `attachments.ticket_id`, `activity (ticket_id, _id)`, `sprints.board_id`",
  ]),
  callout("No transactions needed", "All operations are written so that they work on a standalone MongoDB, a replica set and Atlas. Multi-step operations (completing a sprint, deleting a board) are ordered so that an interruption leaves data consistent and the operation can simply be repeated."),

  h2("6.2 Field values"),
  table(
    ["Setting", "Values"],
    [
      ["Status", "`todo` (To Do), `in_progress` (In Progress), `in_review` (In Review), `done` (Done)"],
      ["Priority", "`highest`, `high`, `medium`, `low`, `lowest`. Lists are sorted by priority, then most recently updated"],
      ["Type", "`task`, `story`, `bug`, `epic`"],
      ["Role", "`member`, `admin`"],
      ["Sprint status", "`planned`, `active`, `completed`"],
      ["Email status", "`queued`, `logged` (recorded only), `sent`, `failed`"],
    ],
    [2200, 7160],
  ),
  spacer(),

  h2("6.3 Business rules"),
  table(
    ["Rule", "Detail"],
    [
      ["Board key", "Regular expression `^[A-Z][A-Z0-9]{1,9}$`; entered in lowercase it is uppercased; duplicates (any case) are refused"],
      ["Ticket numbering", "`counter` on the board is incremented atomically; numbers start at 1; gaps are possible but numbers are never reused"],
      ["Ticket title", "Required, trimmed, at most 250 characters"],
      ["Rich text size", "At most 100,000 characters per description, comment or update"],
      ["Passwords", "At least 6 characters; stored as bcrypt hashes"],
      ["Progress", "Integer 0–100 (values outside are clamped); hours are never negative"],
      ["Moving to Done", "Sets progress to 100%"],
      ["Progress update on To Do", "Percentage above 0 moves the ticket to In Progress (and logs it)"],
      ["Sprint assignment", "A ticket can only join a planned or active sprint of its own board; completed or foreign sprints are refused"],
      ["Active sprint", "One per board; starting another is refused with the name of the active one"],
      ["Completing a sprint", "Unfinished tickets move to the chosen planned sprint (or the backlog if the choice is invalid); finished ones stay"],
      ["Deleting", "Board → its tickets, comments, history, attachments, sprints. Ticket → comments, history, attachments (and stored files). User → their comments, history entries and attachments; tickets become unassigned. Sprint → tickets return to the backlog"],
      ["Self-protection", "An admin cannot change their own role or delete themselves"],
      ["Links", "Only `http` / `https` links are accepted for attachments"],
      ["History", "Description edits are logged without storing their text; every other field logs old and new values; assignee and sprint are logged by name"],
    ],
    [2400, 6960],
  ),
  spacer(),
];
