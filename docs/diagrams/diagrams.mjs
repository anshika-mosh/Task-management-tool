// Mermaid sources for the documentation (rendered to PNG by docs/render-diagrams.mjs).
// Each is laid out to fit a portrait page (about 800 x 900 CSS px) so text stays readable in the .docx.
export const diagrams = {
  architecture: `flowchart TB
  subgraph B["Browser"]
    direction LR
    UI["React UI"]
    ED["Word-style<br/>editor"]
    VW["Media viewer"]
  end
  subgraph S["Next.js server"]
    direction LR
    PG["Pages"]
    SA["Server<br/>Actions"]
    RT["API route<br/>handlers"]
  end
  subgraph SV["Server services"]
    direction LR
    AU["Sessions and<br/>permissions"]
    SN["HTML<br/>sanitizer"]
    ML["Email<br/>notifications"]
  end
  subgraph X["Data and services"]
    direction LR
    DB[("MongoDB")]
    DK[("Local disk<br/>(optional)")]
    SM["SMTP"]
    GD["Google Drive"]
  end
  UI --> PG
  UI --> SA
  ED --> SA
  UI --> RT
  SA --> AU
  SA --> SN
  SA --> ML
  RT --> AU
  PG --> DB
  SA --> DB
  RT --> DB
  RT --> DK
  ML --> SM
  ML --> DB
  VW -.-> GD
`,

  requestFlow: `sequenceDiagram
  autonumber
  actor U as User
  participant C as Browser
  participant A as Server Action
  participant D as MongoDB
  participant M as Mail job
  U->>C: Write comment, click Comment
  C->>A: addComment(ticket, HTML)
  A->>A: Verify session, clean HTML
  A->>D: Save comment, touch ticket
  A-->>M: Schedule email
  A-->>C: Result and revalidate
  C-->>U: Page refreshes, editor clears
  M->>D: Load ticket and people
  M->>D: Store in outbox (send if SMTP)
`,

  auth: `flowchart TB
  R["Request for a<br/>private page"] --> V{"Valid session?"}
  V -- "no" --> L["Redirect to /login"]
  V -- "yes" --> AD{"Admin page?"}
  AD -- "no" --> OK["Render page"]
  AD -- "yes" --> RL{"User is admin?"}
  RL -- "yes" --> OK
  RL -- "no" --> H["Redirect Home"]
  L --> F["Sign-in form"]
  F --> PW{"Password<br/>correct?"}
  PW -- "no" --> ER["Error shown,<br/>email kept"]
  PW -- "yes" --> CK["Signed cookie set,<br/>go Home"]
`,

  sitemap: `flowchart TB
  LG["Login"] --> HM["Home dashboard"]
  HM --> BD["Board (Kanban)<br/>/boards/KEY"]
  HM --> AT["All tickets<br/>/issues"]
  HM --> AD["Admin (admins only)<br/>/admin"]
  BD --> SP["Sprints and backlog<br/>/boards/KEY/sprints"]
  AD --> ML["Mail outbox<br/>/admin/mail"]
  BD --> TK["Ticket page<br/>/browse/KEY-123"]
  AT --> TK
  SP --> TK
  NB["Navbar (every page)"] -.-> CR["Create ticket dialog"]
  NB -.-> SR["Search box"]
  NB -.-> TH["Light / dark toggle"]
  CR --> TK
  SR --> AT
`,

  journey: `flowchart TB
  subgraph R1["1. Set up (admin)"]
    direction LR
    A1["Sign in"] --> A2["Create boards<br/>and keys"] --> A3["Add team<br/>members"]
  end
  subgraph R2["2. Plan and work (team)"]
    direction LR
    B2["Create ticket<br/>KEY-number"] --> B3["Plan sprint:<br/>add and start"] --> B4["Drag cards,<br/>post progress"]
  end
  subgraph R3["3. Collaborate and close"]
    direction LR
    B5["Rich comments,<br/>Drive media"] --> B6["Email to assignee<br/>or reporter"] --> B7["Complete sprint,<br/>roll over"]
  end
  R1 --> R2
  R2 --> R3
  R3 -.->|"next sprint"| R2
`,

  ticketLifecycle: `stateDiagram-v2
  [*] --> ToDo: Ticket created
  ToDo --> InProgress: Dragged, or progress above 0%
  InProgress --> InReview: Ready for review
  InReview --> Done: Accepted (progress 100%)
  InReview --> InProgress: Changes requested
  Done --> InProgress: Reopened
  ToDo --> Done: Any column is reachable
  Done --> [*]: Deleted (reporter or admin)
  note right of InProgress
    Every change goes to the
    History tab and may send email.
  end note
`,

  sprintLifecycle: `stateDiagram-v2
  [*] --> Planned: Create sprint
  Planned --> Active: Start (one per board)
  Active --> Completed: Complete sprint
  Planned --> [*]: Delete
  Completed --> [*]: Delete
  note right of Completed
    Unfinished tickets go to the
    backlog or the next sprint.
    Finished tickets stay.
  end note
`,

  mailRules: `flowchart TB
  E["Event on a ticket"] --> T{"What happened?"}
  T -- "Sprint planning move" --> N0["No email"]
  T -- "Assigned or reassigned" --> A1{"New assignee is<br/>not the actor?"}
  A1 -- "yes" --> M1["Email the<br/>new assignee"]
  A1 -- "no" --> N1["No email"]
  T -- "Comment, progress,<br/>field change, attachment" --> B1{"Assignee exists<br/>and is not the actor?"}
  B1 -- "yes" --> M2["Email the assignee<br/>with what was posted"]
  B1 -- "no" --> B2{"Reporter exists<br/>and is not the actor?"}
  B2 -- "yes" --> M3["Email the reporter<br/>with what was posted"]
  B2 -- "no" --> N2["No email"]
`,

  richWrite: `flowchart TB
  T["Toolbar, shortcuts,<br/>markdown typing"] --> H["HTML in the editor"]
  P["Paperclip icon"] --> DL["Dialog: link + name"]
  DL --> PL{"What kind of link?"}
  PL -- "Drive file" --> I1["Chip with Drive id"]
  PL -- "image URL" --> I2["Embedded image"]
  PL -- "video / web URL" --> I3["Link chip"]
  I1 --> H
  I2 --> H
  I3 --> H
  DL -->|"description editor only"| REG["Also saved as a<br/>ticket attachment"]
  H --> SV["Server Action"]
`,

  richRead: `flowchart TB
  SV["Server Action"] --> SAN["Sanitizer<br/>(allow-list, strips scripts)"]
  SAN --> ST[("MongoDB")]
  ST --> SAN2["Sanitize again<br/>when rendering"]
  SAN2 --> RC["Formatted content<br/>on the page"]
  RC -->|"click a media link"| LB["Viewer: Drive player,<br/>image or video"]
  ST --> GAL["Attachments gallery<br/>(thumbnails)"]
  GAL -->|"click thumbnail"| LB
`,

  dataModel: `erDiagram
  direction LR
  USERS ||--o{ TICKETS : "reports / assigned"
  BOARDS ||--o{ TICKETS : "contains"
  BOARDS ||--o{ SPRINTS : "plans"
  SPRINTS |o--o{ TICKETS : "groups"
  TICKETS ||--o{ COMMENTS : "has"
  TICKETS ||--o{ ATTACHMENTS : "has"
  TICKETS ||--o{ ACTIVITY : "records"
  USERS ||--o{ COMMENTS : "writes"
  USERS {
    int _id
    string email
    string role
  }
  BOARDS {
    int _id
    string key
    int counter
  }
  TICKETS {
    int _id
    int number
    string status
    string priority
    int assignee_id
    int sprint_id
  }
  SPRINTS {
    int _id
    string name
    string status
  }
  COMMENTS {
    int _id
    string kind
    string body_html
  }
  ATTACHMENTS {
    int _id
    string link_type
    string drive_id
  }
  ACTIVITY {
    int _id
    string field
  }
`,

  quality: `flowchart TB
  C["Code change"] --> V["npm run verify<br/>type-check + 515 tests"]
  V --> E["npm run test:e2e<br/>87 browser journeys"]
  V --> G["git commit"]
  G --> H{"Pre-commit hook<br/>runs verify"}
  H -- "fails" --> X["Commit blocked"]
  H -- "passes" --> PR["Push / pull request"]
  PR --> CI["CI: type-check, tests,<br/>end-to-end with MongoDB"]
  CI --> M["Merge"]
`,
};
