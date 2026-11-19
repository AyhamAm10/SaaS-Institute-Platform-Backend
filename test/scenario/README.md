# Scenario tests (real database)

Business flows tested end to end through the real HTTP API, on a real PostgreSQL
database, with a controlled clock. They check the numbers users see (balances,
rates, marks, counts) and the behaviour of whole flows, not single functions.

Run: `npm run test:scenario` (Jest config `test/jest-scenario.json`, files `*.scenario-spec.ts`).

## Database
- A separate database whose name MUST end with `_test` (the harness refuses any other).
  Default: the `.env` `DATABASE_URL` with the database renamed to `institute_test`;
  override with `SCENARIO_DATABASE_URL`.
- Before the run, `prisma migrate deploy` brings it up to date (creates it the first
  time, never deletes data). `SCENARIO_SKIP_MIGRATE=1` skips this step.
- Data is never wiped between runs: every file creates its own institutes, so files
  are isolated by tenant and can run in parallel. To start from an empty database,
  drop the `_test` database by hand.

## Harness (`support/`)
| File | What it gives |
|---|---|
| `app.ts` | `startApp()`: the Nest app like `main.ts` (prefix, validation, filter), Firebase replaced by `FakePushSender`, the platform account provisioned, `runJob(Processor, name, instituteId, data)` runs a background job's real handler without Redis workers. The app **listens once** on a free local port: supertest would otherwise open a new server port per request, and thousands of requests exhaust the Windows ephemeral ports (sockets, PostgreSQL ones included, get reset) |
| `clock.ts` | `setClock('2026-11-18 08:16')`: institute-local time (Damascus, UTC+3). Only `Date` is faked; timers and I/O stay real. Columns the database fills itself (`createdAt`) use real time |
| `client.ts` | `Api`: one user's HTTP client; every call asserts the status and returns the body; `fails(method, path, status)` for refusals; renews an expired access token once (the clock moves by hours); one shared keep-alive agent reuses connections. Run requests one at a time in setup loops (parallel supertest sockets reset on Windows); `eventually()` waits for background effects (notifications); `uniquePhone()` |
| `builders.ts` | `InstituteFixture.create(s, label)`: institute + admin + default branch + current year, then `section()`, `student()`, `subject()`, `academicBranch()`; `signIn()` does the forced first password change like a real user |
| `world.ts` | `buildWorld(inst, marker)`: one record of every kind named with a marker; `tenantFingerprint(inst)`: md5 of every row the institute owns (all tables with `institute_id`) |
| `money.ts` | `expectPerCurrency` (exact currencies, never mixed), `installmentsInDb`, `expectAllocationsMatchPaid` |
| `reconcile.ts` | `reconcile({ inst, today, yearStart, students, sections, yearName? })`: the monthly reconciliation of the full-year files. Money from the summary = parents app = statement = section finance row; students summed = dashboard; this month's register = dashboard = chart; attendance rate app = report = family report; marks app = transcript; database soundness (paid within amount, allocations = paid, receipts 1..N per branch and year, no duplicate notification). Returns the list of mismatches |
| `fake-push-sender.ts` | records every push; tokens starting with `dead-` behave like uninstalled apps |

## Rules for writing scenarios
1. Each test id matches the plan (`[FEE-41] ...`, `docs/private/test-plan/`).
2. Expected numbers are written literally, never recomputed with the code's own logic.
3. Every test sets the clock explicitly.
4. Money operations check the response AND the database rows.
5. A refusal checks the status, the error key and that the database did not change.
6. Tests inside a file are an ordered story; files never depend on each other.
7. The global rate limit (300/min/IP) and the login limit are raised in `setup-env.ts` (all workers share one IP); `01-tenancy-auth/rate-limit.scenario-spec.ts` restores the real login limit to test it.
8. The suite runs in CI twice, with `TZ=UTC` and `TZ=Asia/Damascus`: results must match.
