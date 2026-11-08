# Service reuse and domain ownership

> Part of the rules contract (sections 10 of the former single `role.md`). Section numbers are kept so existing `role.md §N` references still resolve. Start from `core.md`.

---

## 10. Service Reuse and Domain Ownership

To prevent logic duplication and divergent business rules:

1. **Single Domain Authority**: Every domain model has an authoritative owner service (e.g., `UsersService` owns user lifecycle operations).
2. **Cross-Domain Reusability**: When feature A requires logic from feature B, feature A's service MUST inject and call feature B's service rather than duplicating queries or business rules.
3. **No Controller-to-Controller Calls**: Controllers MUST NOT call other controllers.
4. **No Repository Bypassing**: Do not duplicate a repository query in an unrelated service; expose a method on the owning repository or service.

### 10.1 Reference Data (Lookup Tables)

Simple institute-owned lists (cities, schools, buses, know-ways, student statuses, exam types) live in `src/modules/reference-data/` and are built on one generic base in `reference-data/lookup/`:

1. **Repository**: extend `LookupRepository<T>` (tenant-scoped, soft delete that releases `name`). Branch-owned lists (buses) extend `ContextScopedRepository` instead and implement the same `LookupStore<T>` contract.
2. **Service**: extend `LookupService<T, CreateDto, UpdateDto>`; it owns paging, duplicate-name checks (`lookup_name_duplicate`) and **refuses deleting an entry still in use** (`lookup_in_use`, with the usage count from `countUsage`). Override only the hooks `toData`, `validate`, `findDuplicate`.
3. **Controller**: extend `NameLookupController` (or write a thin controller with concrete DTOs when the table has extra fields).
4. **Consumers** (e.g. students) validate and resolve links through the owning services (`StudentReferencesResolver`), never by querying lookup tables directly. A bus MUST belong to the student's branch (`bus_branch_mismatch`).
5. **Student statuses**: exactly one default per institute; it cannot be deleted or un-set without choosing another (`student_status_default_locked`). New institutes get the default statuses via `StudentStatusesService.provisionDefaults`.

### 10.2 Enrollments (Students in Sections)

Enrollment logic is owned by `src/modules/enrollments/` (`EnrollmentsService`); `StudentEnrollmentRepository` (students module, **audited**) and `EnrollmentSubjectRepository` are its repositories. Pure rules live in `enrollment.rules.ts`.

1. **One enrollment per student per academic year** (DB unique). The year is read from the section, never sent by the client.
2. **Section branch = student branch.** Bulk enroll (`POST /sections/:id/enrollments`) never fails as a whole: each student is `enrolled` or `rejected` with a translated reason.
3. **Transfer** (`PATCH /enrollments/:id/transfer`): only an ACTIVE enrollment, same year and same branch. It updates `sectionId` (the audit log records the move) and drops chosen subjects the new section does not teach.
4. **Status** (`PATCH /enrollments/:id/status`): ACTIVE → WITHDRAWN (reason required) or COMPLETED; WITHDRAWN → ACTIVE. `statusReason` / `statusChangedAt` keep the last change.
5. **Subjects** (`PUT /enrollments/:id/subjects`): no rows = every section subject; a choice must come from the section plan, and a choice covering the whole plan is stored as empty.
6. **Effective subjects**: attendance, grades and fees MUST call `EnrollmentsService.getEffectiveSubjects(enrollmentId)`; never re-implement the "empty = all" rule.
7. Unassigned students are listed with `GET /students?unassignedYearId=` (no separate route that could clash with `/students/:id`).

### 10.3 Fees: Contracts, Installments and Payments

Owned by `src/modules/fees/` (`ContractsService`, `PaymentsService`, `FeesReportsService`). Pure rules live in `fees.rules.ts` and `common/money/money.ts`.

1. **Money**: compute in integer minor units (`toMinor` / `minorToDecimal`). SYP has no fractions, USD two decimals (`money_invalid_precision`). Never mix currencies in a sum; reports return one row per currency. Exchange rates are always **SYP per 1 USD**.
2. **Contract** (`StudentSubscription`): one per enrollment (`enrollmentId` unique, survives transfers). Amount and currency default to the section fee (`Section.feeCurrency`). `total = gross − discount`, discount ≤ gross.
3. **Schedule**: optional first payment = installment #1 due on `startDate`; the rest is split monthly (clamped to month length) with the **rounding remainder on the last installment**. `POST /enrollments/:id/contract/preview` returns it without saving.
4. **Editing** a contract: only the discount and installments with nothing paid. Paid / partly paid installments are kept; the rest is regenerated and numbered after them.
5. **Payment**: inside one transaction — row-lock the contract (`SubscriptionRepository.lockForUpdate`), convert to the contract currency (`appliedAmount`), allocate **FIFO by due date** (`PaymentAllocation`), refuse more than the remaining balance, take the receipt number from `ReceiptSequence` (per branch + year), update installment and contract statuses.
6. **Cancellation**: payments are never deleted. `PATCH /payments/:id/cancel` requires a reason, reverses the allocations and keeps the receipt number. Everything is audited.
7. **Overdue**: computed from the institute's today (`InstituteClock`), so reports are right even before the job runs. The `fees` queue job `mark-overdue-installments` persists `OVERDUE` (idempotent); it is fanned out per institute by the hourly `dispatch` job (`src/modules/jobs/`).
8. **Workers** are declared with `autorun: false` and started on bootstrap unless `JOBS_ENABLED=false` (tests, API-only instances), so a missing Redis never blocks the API or the test runner.
9. **Overdue Aging Summary** (`GET /fees/overdue/summary` / `GET /installments/overdue/summary`): returns overdue installments aggregated into aging buckets (`1-30`, `31-60`, `61-90`, `90+`) per currency using `FeesReportsService.getOverdueAging` and pure rules in `fees.rules.ts`.

### 10.4 Daily Attendance

Owned by `src/modules/attendance/` (`AttendanceService`, `DailyAttendanceRepository`, audited). Pure rules in `attendance.rules.ts`.

1. **One record per student per local day** (`DailyAttendance`, unique `[instituteId, studentId, date]`). `date` is always the institute-local date from `InstituteClock` / `getLocalParts`; `checkInAt` / `checkOutAt` are UTC instants.
2. **Check-in**: only for a student with an ACTIVE enrollment, only on `workingDays`, once per day, never in the future. `LATE` when after `dayStartTime + lateAfterMinutes` (schedule config, default 15), else `PRESENT`. A late arrival replaces an ABSENT / EXCUSED mark of the same day.
3. **Check-out**: only after the check-in of the same day, once.
4. **Bulk** (`POST /attendance/bulk`) never fails as a whole: `done` + `skipped` with the translated reason.
5. **Corrections** (`PATCH /attendance/:id`) are audited; changing only the check-in time recomputes PRESENT / LATE.
6. **Absence job**: the hourly dispatcher enqueues `mark-absences` per institute; after `attendanceCloseTime` (default `dayEndTime`) of a working day it inserts ABSENT for students without a record (`createMany` + `skipDuplicates`): existing records are never touched.
7. `LessonAttendance` stays in the schema for later; there is no module for it.

### 10.5 Exams and Marks

Owned by `src/modules/exams/` (`ExamsService`, `ExamRepository` / `ExamResultRepository`, both audited). Pure rules in `exams.rules.ts`.

1. **Exam**: section + one of its **plan subjects** (`exam_subject_not_in_section`), date inside the section's academic year, `0 < passMark ≤ maxMark`. Section and subject cannot change after creation.
2. **Students of an exam** = ACTIVE enrollments of the section that study the subject, from `EnrollmentsService.findStudentsTakingSubject` (same "no choice = all subjects" rule as `getEffectiveSubjects`). A student who already has a mark stays on the sheet (flagged `eligible: false`).
3. **Marks** (`PUT /exams/:id/results`): bulk upsert; the status is always computed server-side: ABSENT when flagged, PENDING without a mark, else PASSED / FAILED against `passMark`. Marks outside `[0, maxMark]` or with more than two decimals are refused.
4. Changing `passMark` / `maxMark` re-computes existing statuses; a `maxMark` below an entered mark is refused.
5. **Delete**: an exam with marks needs `?force=true` (409 `exam_has_results` otherwise); marks and exam are deleted in one transaction and audited.
6. `GET /students/:id/results` returns every mark plus the average percentage per subject.

### 10.6 Dashboard Overview (Read-Only Composition)

`src/modules/dashboard/` serves `GET /dashboard/overview`: every number of the home page in one call, for the header branch and the header (or current) academic year, with local dates from `InstituteClock`.

1. **Each domain computes its own numbers** through an overview method on its owning service: `StudentsService.getOverview`, `EnrollmentsService.getActiveStudentSections`, `AttendanceService.getOverview`, `FeesReportsService.getOverview`, `ExamsService.getOverview`. `DashboardService` only composes them (plus the sections list and the teachers count).
2. **No manual SQL** (§18.9): aggregates use Prisma `groupBy` / `count` / `findMany` with `select`; the repositories own those queries (`countByDayAndStatus`, `sumOpenBySubscription`, `averageByExam`, ...).
3. **Pure joins and maths** live in rules files with tests: `attendanceRate`, `lastWorkingDays`, `attendanceSeries` (attendance), `lastMonthKeys`, `collectionsByMonth` (fees), `weightedAveragePercent` (exams), `todayAttendance`, `sectionRows` (dashboard).
4. **Money is never mixed**: finance numbers are one row per currency. Collections are in the payment currency; balance and overdue are in the contract currency.
5. Without an academic year the endpoint returns zeros and `academicYear: null` (it never creates a year).
6. Calendar shifts use `shiftLocalDate` from `common/time/timezone.ts`; do not add private date helpers.

### 10.7 Reports and Printing (Read-Only Composition, D3)

`src/modules/reports/` serves every report of the platform. It owns no table.

1. **One catalog**: `report-catalog.ts` defines each report ONCE (key, category, title, permission, parameters, `verifiable`). `GET /reports/catalog` returns the entries the caller's role may open; the dashboard builds its reports center, parameter forms and contextual menus from it. A new report = a catalog entry + a builder (the `ReportsService` spec fails if a key has no builder).
2. **One document shape**: builders return a `ReportDocument` (`document/report-document.ts`): title, meta, orientation and typed blocks (`stats`, `fields`, `table`, `grid`, `bars`, `note`, `signatures`). Table cells are typed by their column `kind`; money cells carry their currency and totals are one row per currency (never mixed). The dashboard renders it (screen + print) and `ReportExcelService` writes the same document to `.xlsx` (RTL sheet, money / date / percent formats): `GET /reports/:key` and `GET /reports/:key/excel`.
3. **Composition only**: builders (`builders/*.reports.ts`, one class per category) call the owning domain services; the queries live in the domain repositories (`FeesReportDataService`, `AttendanceService.getRecordsBetween`, `ExamsService.getExamsWithResults`, `EnrollmentsService.getYearEnrollments`, `TimetablesService.getEntriesForReport`, `StaffActivityService`). Pure maths (periods, aging buckets, ranking, distributions, working days) lives in `reports.rules.ts` with tests.
4. **Security**: `ReportsService` checks the report permission (403), required parameters (400 `report_param_required`) and the teacher scope of a `sectionId`; domain calls keep their own scope checks (exam sheets, student history). Reports follow the header branch / year (else the current year) and the institute-local dates. Synchronous reports are capped at `REPORT_ROW_LIMIT` (5000) rows; bigger exports wait for background jobs.
5. **Verification**: verifiable documents (student statement, transcript, exam sheet) and receipts get a document number and an HMAC-signed token (`ReportVerificationService`, secret `REPORT_SIGNING_SECRET`, falls back to `JWT_ACCESS_SECRET`). The QR opens the public `/verify/:token` page, which shows the institute, the number and the signed summary lines; any change to the token makes it invalid. Tokens hold no sensitive data (a name and short lines only).
6. **Direct Document Excel Rendering** (`POST /reports/render/excel`): accepts a full `ReportDocument` via `RenderReportExcelDto` and renders an RTL `.xlsx` binary stream directly via `ReportExcelService.renderExcelBuffer`. Protected by limits: title ≤ 200 chars, ≤ 20 blocks, table rows ≤ `REPORT_ROW_LIMIT` (5000), payload ≤ 2MB. Used by the dashboard selection bar and printable modules to export custom tabular selections without creating ad-hoc exporters.

---
