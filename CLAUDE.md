# TaskFlow – working agreement

A Jira-style task manager: Next.js (App Router) + TypeScript + MongoDB. Read `README.md` for features and setup.

## The rule: every change is tested

**After ANY code change, run `npm run verify` (type-check + unit/integration/component tests) before saying the work is done.**
For anything that touches UI or a user flow, also run `npm run test:e2e` (real browser against a real build).
Report the actual results. Never claim "it works" without a green run.

- **New feature or behaviour →** add tests for it in the same change (see "Where tests go").
- **Bug fix →** first add a failing regression test, then fix. Several real bugs were found this way; keep it up.
- **Changing behaviour on purpose →** update the affected tests deliberately. Never delete, skip, or loosen a test just to get green; if a test looks wrong, say why.
- If a run fails, fix the cause (or the test if the test is wrong) and rerun until green. Don't hand back red work.

| Command | What it runs | When |
|---|---|---|
| `npm run verify` | `tsc` (app + tests) and `vitest` | after every change (also runs in the pre-commit hook) |
| `npm run verify:full` | verify + Playwright e2e | before a feature is "done" / before a PR |
| `npm test` / `npm run test:watch` | vitest only | while developing |
| `npm run test:e2e` | Playwright (builds `.next-e2e`, port 3200). `E2E_SKIP_BUILD=1` reuses the last build | UI / flow changes |

`git commit` runs the pre-commit hook (`.githooks/`, enabled by `npm install`); CI (`.github/workflows/ci.yml`) runs everything on push/PR.

## Safety: tests never touch real data
- Tests use a local MongoDB (`mongodb://127.0.0.1:27017`, override with `TEST_MONGODB_URI`) and only throwaway databases named `taskflow_test_*`, dropped afterwards. They refuse to run against Atlas/`mongodb+srv`.
- Tests and the e2e server set their env explicitly and must never read `.env.local`.
- **Never commit secrets.** Real credentials live only in git-ignored `.env.local` (or `.env.*.local`). `.env.example` holds placeholders only.

## Where tests go
- `tests/unit/` – pure functions (`lib/links.ts`, `lib/format.ts`, `lib/constants.ts`).
- `tests/integration/` – server actions, queries, mail rules, DB seeding/indexes, API route handlers, the SQLite→Mongo migration. They call the real code against a real MongoDB. Next.js APIs (`cookies`, `redirect`, `revalidatePath`, `after`) are mocked in `tests/setup.ts`; helpers/factories are in `tests/helpers.ts` (`makeUser`, `makeBoard`, `makeTicket`, `makeSprint`, `loginAs`, `expectRedirect`, `flushAfter`, …).
- `tests/components/` – React Testing Library (jsdom). Server actions are mocked with `vi.mock("@/lib/actions", …)`.
- `tests/e2e/` – Playwright journeys in your installed Chrome (`PW_CHANNEL=msedge` for Edge). One shared app + DB, run serially; **create your own data and unique titles** instead of relying on counts.

Rules of thumb for the use cases: every use case needs a happy path, validation/error paths, **permission checks** (anonymous, member, admin), and side effects (history entries, emails, counters).

## Lessons already learned (don't regress)
- React 19 auto-resets `<form action>` fields after the action even on validation errors → use `useFormAction` (`lib/use-form-action.ts`) for forms.
- Dropdown menus must not unmount a form on click (broke Log out); they close only on link clicks.
- Filters rendered from URL params need a `key` so Reset/Back remount the form.
- Email rules: assigned→assignee; others' updates→assignee; assignee's updates→reporter; never the actor; sprint moves are silent.
- Images/videos are **Google Drive links** (`lib/links.ts`); local uploads are off unless `ALLOW_FILE_UPLOADS=true`.
- No multi-document transactions (must run on standalone Mongo); ids are small numeric `_id`s from the `counters` collection.
