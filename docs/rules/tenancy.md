# Multi-tenancy and repository scoping

> Part of the rules contract (sections 3, 4 of the former single `role.md`). Section numbers are kept so existing `role.md §N` references still resolve. Start from `core.md`.

---

## 3. Multi-Tenancy & Operational Scoping Architecture

The platform operates as a relational multi-tenant SaaS with a strict **Two-Tier Boundary Model**:

```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           TIER 1: HARD SECURITY TENANT BOUNDARY                 │
│                                  Institute (Tenant)                             │
└────────────────────────────────────────┬────────────────────────────────────────┘
                                         │
        ┌────────────────────────────────┼────────────────────────────────┐
        ▼                                ▼                                ▼
┌───────────────┐                ┌───────────────┐                ┌───────────────┐
│AcademicBranch │                │ AcademicYear  │                │    Branch     │
│ (Educational) │                │  (Time Cycle) │                │ (Geographic)  │
└───────┬───────┘                └───────┬───────┘                └───────┬───────┘
        │                                │                                │
        └────────────────────────────────┼────────────────────────────────┘
                                         ▼
                                  ┌─────────────┐
                                  │   Section   │
                                  └──────┬──────┘
                                         ▼
                                  ┌─────────────┐
                                  │  Timetable  │
                                  └─────────────┘
```

### 3.1 The Two-Tier Isolation Boundary
1. **Tier 1 — Hard Security Boundary (`Institute`)**:
   - `Institute` is the authoritative, immutable tenant boundary.
   - Cross-institute data exposure is a critical security vulnerability.
   - Deterministically resolved exclusively from verified JWT token payload (`RequestContext.getInstituteId()`). Never derived from client body or route parameters.
2. **Tier 2 — Operational Dimensions (`Branch` and `AcademicYear`)**:
   - `Branch`: The physical / geographical facility or campus of the Institute.
   - `AcademicYear`: The pedagogical annual cycle (e.g., 2026-2027).
   - Resolved primarily via custom HTTP headers (`X-Branch-Id`, `X-Academic-Year-Id`) into `RequestContext` to enable zero-manual-input scoping.

### 3.2 The Comprehensive Entity Scoping Matrix

| Category | Entity | Scoping Keys | Isolation Invariants & Constraints |
| :--- | :--- | :--- | :--- |
| **Institute-Wide** *(Shared across branches & years)* | `Institute` | `id` | Root tenant container. |
| **Institute-Wide** | `Branch` | `instituteId` | Physical branch definition (`@@unique([instituteId, code])`, `@@unique([instituteId, name])`). |
| **Institute-Wide** | `AcademicYear` | `instituteId` | Academic cycle definition (`@@unique([instituteId, name])`). Dates cannot overlap. |
| **Institute-Wide** | `AcademicBranch` | `instituteId` | Educational tracks (علمي، أدبي، تأسيسي). Shared across all branches of the institute. |
| **Institute-Wide** | `Subject` | `instituteId` | Educational subjects/curriculum (`@@unique([instituteId, code])`). |
| **Institute-Wide** | `InstituteScheduleConfig` | `instituteId` | Master schedule configuration (working hours, period duration, break intervals). Single record per institute. |
| **Branch-Scoped** *(Physical & Geographic Isolation)* | `Room` | `instituteId`, `branchId` | Physical classroom or laboratory. MUST belong to a specific branch (`@@unique([instituteId, branchId, name])`). Strictly isolated per branch. |
| **Branch-Scoped** | `Teacher` | `instituteId`, `branch_teachers` | Teacher profile belongs to Institute, but teaching rights are branch-scoped via `BranchTeacher` junction. |
| **Branch & Year Scoped** *(Operational Cohort)* | `Section` | `instituteId`, `branchId`, `academicYearId` | Active student cohort. Compound uniqueness: `@@unique([instituteId, branchId, academicYearId, name])`. |
| **Branch & Year Scoped** | `Timetable` | `instituteId`, `academicYearId`, `section.branchId` | Master weekly schedule for a specific section. Inherits branch from `section.branchId`. |
| **Branch & Year Scoped** | `TimetableEntry` | `instituteId`, `timetableId`, `roomId`, `teacherId` | Timetable slot. Room MUST match section's branch; Teacher MUST be assigned to section's branch. |
| **Branch-Scoped** | `Student` | `instituteId`, `branchId` (required) | `branchId` is mandatory: resolved from DTO → header → enrolled section → default branch. |
| **Year Scoped** | `StudentEnrollment` / `EnrollmentSubject` | `instituteId`, `academicYearId` | One enrollment per student per year. `EnrollmentSubject` lists the subjects a student takes; **no rows = all section subjects**. |
| **Branch & Year Scoped** (via section) | `Exam` / `ExamResult` | `instituteId`, `sectionId`, `subjectId` (header year / branch through `section`, §3.4) | Exam is defined by section + subject (+ optional `ExamType`); `lessonId` is optional. One result per (exam, student). |
| **Branch & Year Scoped** | `Payment` / `ReceiptSequence` | `instituteId`, `branchId`, `academicYearId` | `receiptNumber` is sequential per (institute, branch, year). Payments are never deleted — they are cancelled (`status = CANCELLED`). |
| **Institute-Wide** | `InstituteFeature` | `instituteId`, `key` | Optional modules per institute (SMS, online registration, apps, accounting). No row = disabled. |
| **Institute-Wide** | `AuditLog` | `instituteId` | Written automatically for audited models (see §4.4). |

### 3.3 Core Multi-Tenancy Invariants:
1. **Never Trust Client Tenant Input**: The client request body, query parameters, or route headers MUST NEVER be trusted to determine the authoritative `instituteId`. The `instituteId` MUST always be derived from the verified JWT access token in `RequestContext`.
2. **Subdivisions are Not Tenants**: `Branch` records are subdivisions of an `Institute`, not independent tenants. All branch-level entities belong to the root `Institute`.
3. **Single Tenant Membership**: Every user record belongs to exactly one `Institute`. A phone number is unique **per institute** (`@@unique([instituteId, phone])`), so the same person may hold separate user records in several institutes. Phone uniqueness checks MUST use the tenant-scoped `UserRepository`, never a system-wide lookup.
4. **Relational Scope**: All major database entities maintain a direct or compound foreign key to `Institute` (`instituteId`) and unique compound keys (`@@unique([instituteId, id])`).
5. **No Cross-Tenant Leakage**: Unintended cross-institute data exposure is a critical security violation.

### 3.4 Operational Context (Branch + Academic Year) — Single Source of Truth

The active branch and academic year come **only** from the request headers `X-Branch-Id` / `X-Academic-Year-Id` (picked in the dashboard header). They are never query parameters of a list.

1. **Validated**: `OperationalContextGuard` (global, after the auth guards, `src/modules/operational-context/`) refuses a branch or year that does not belong to the caller's institute: `400 context_branch_invalid` / `400 context_year_invalid`. Public routes and the super admin are skipped.
2. **Enforced by the repositories**: every model with `academicYearId` or `branchId` is read through a `ContextScopedRepository` (`yearKey` / `branchKey`, nested paths allowed). Scoped today:

   | Repository | yearKey | branchKey |
   | :--- | :--- | :--- |
   | `SectionRepository`, `PaymentRepository` | `academicYearId` | `branchId` |
   | `StudentEnrollmentRepository` | `academicYearId` | — |
   | `TimetableRepository` | `academicYearId` | `section.branchId` |
   | `ExamRepository` | `section.academicYearId` | `section.branchId` |
   | `SubscriptionRepository` | `academicYearId` | `section.branchId` |
   | `InstallmentRepository` | `subscription.academicYearId` | `subscription.section.branchId` |
   | `StudentRepository`, `RoomRepository`, `BusRepository` | — | `branchId` |
   | `TeacherRepository` | — | `branchTeachers.some.branchId` |
   | `DailyAttendanceRepository` | — (local dates) | `branchId` |

3. **Coverage test**: `src/database/context-coverage.spec.ts` reads `schema.prisma`; a model with `academicYearId` / `branchId` and no ContextScoped repository fails the build unless listed in `CONTEXT_EXEMPT` with a reason (today: `ReceiptSequence`, `BranchTeacher`).
4. **Documented exceptions** (`scopeWhereAllYears`: tenant + branch, no year) are record-level reads that legitimately span years: a student's contracts (`SubscriptionRepository.findByStudent`), a contract opened by id / by enrollment / its schedule (`findDetails`, `findByEnrollment`, `findCurrencies`, `InstallmentRepository.findBySubscription`). Lists, totals and reports never use it. A new exception must be justified in its JSDoc.
5. **No overrides**: list DTOs have no `branchId` / `academicYearId` (`forbidNonWhitelisted` rejects them). Services that need an explicit year (dashboard, reports, jobs) pass it inside the repository call, never from the client. Students show the enrollment of the context year only (`?unassigned=true` = not enrolled in the context year).
6. Background jobs run without headers; they pass explicit keys.

---

---

## 4. Repository Scoping & Tenant Enforcement

Tenant isolation and operational dimension scoping are enforced uniformly at the repository base layer, eliminating manual query filtering by developers.

### 4.1 Hierarchy: The Four Repository Tiers

```text
             ┌────────────────────────────────────┐
             │       BaseRepository<T>            │
             │   - CRUD via Prisma Delegate       │
             │   - TransactionContext awareness   │
             │   - findManyPaginated              │
             └─────────────────┬──────────────────┘
                               │
            ┌──────────────────┴──────────────────┐
            ▼                                     ▼
┌───────────────────────────────┐   ┌───────────────────────────────┐
│   TenantAwareRepository<T>    │   │     SystemRepository<T>       │
│  - Injects instituteId        │   │  - NO tenant scoping          │
│  - Scopes findById/findMany   │   │  - Auth & system maintenance  │
│  - Protects update/delete     │   │  - Explicit & auditable       │
└───────────────┬───────────────┘   └───────────────────────────────┘
                │
                ▼
┌───────────────────────────────┐
│  ContextScopedRepository<T>   │
│  - Auto-scopes branchKey      │
│  - Auto-scopes yearKey        │
│  - Supports dot-notated paths │
│  - Direct create() injection  │
└───────────────────────────────┘
```

### 4.2 Implementation Rules:
* **`TenantAwareRepository<T>`**:
  - `getInstituteId()`: Fetches the tenant ID via `RequestContext.getInstituteId()`.
  - `scopeWhere(where)`: Injects `{ ...where, instituteId: this.getInstituteId() }`.
  - `findById(id)`: Uses `findFirst({ where: { id, instituteId: this.getInstituteId() } })`.
  - `create(data)`: Automatically sets `data.instituteId = this.getInstituteId()`.
  - `update(id, data)` / `delete(id)`: Verifies tenant ownership via `findById(id)` before modifying the record. Throws `NotFoundException` if the record does not belong to the current institute.
  - `findMany`, `count`, `exists`, and `findManyPaginated`: Automatically scoped with `scopeWhere()`.
* **`ContextScopedRepository<T>`**:
  - Extends `TenantAwareRepository<T>`.
  - Configured by declaring protected members in the child repository:
    - `protected readonly branchKey?: string` (e.g. `'branchId'`, `'section.branchId'`, `'branchTeachers.some.branchId'`).
    - `protected readonly yearKey?: string` (e.g. `'academicYearId'`, `'section.academicYearId'`).
  - Supports direct column names AND nested dot notation for relational paths.
  - Automatically enriches `scopeWhere(where)` with `branchId` (from `RequestContext.getBranchId()`) and `academicYearId` (from `RequestContext.getAcademicYearId()`) if not explicitly specified in the query.
  - Automatically injects direct non-nested `branchId` and `academicYearId` into `create(data)` if present in context and omitted in payload.
* **`SystemRepository<T>`**:
  - Used ONLY for legitimate cross-tenant requirements:
    1. User login (`findLoginCandidates(phone, instituteCode?)` — all users with that phone, optionally restricted to one institute code, prior to authentication).
    2. Token refresh and account validity verification.
    3. Super-admin platform operations.
  - MUST NOT be used in feature domain modules where `TenantAwareRepository` or `ContextScopedRepository` applies.

---

### 4.3 The Cross-Branch Zero-Leakage Policy (قواعد منع تسريب البيانات الصارمة)

Under multi-branch operations, branch isolation is a critical boundary. Cross-branch data leakage (e.g., viewing, scheduling, or editing Branch A resources while Branch B is selected) is strictly forbidden.

#### Rule 1: Point-Lookup Isolation (`findByIdWithDetails`)
All single-entity fetch methods by ID in context-scoped repositories MUST use scoped filters rather than raw ID lookups:
```ts
// CORRECT (Strict Branch & Tenant Scoping):
async findByIdWithDetails(id: number) {
  return this.client.section.findFirst({
    where: this.scopeWhere({ id }), // Enforces instituteId AND active branchId
    include: { ... },
  });
}

// FORBIDDEN (Allows leaking entities from other branches):
async findByIdWithDetails(id: number) {
  return this.client.section.findFirst({
    where: { id, instituteId: this.getInstituteId() }, // Missing branch scope!
    include: { ... },
  });
}
```
*Result*: When an ID belonging to Branch A is requested with Branch B active in the header, `this.scopeWhere({ id })` yields no match (`null`), and the service correctly throws a `404 Not Found`.

#### Rule 2: Cross-Branch Mutation Protection (Update / Delete / Toggle)
Services performing updates, deletions, or status toggles MUST assert that the target entity belongs to the active branch context before proceeding:
```ts
const contextBranchId = RequestContext.getBranchId();
Ensure.custom(
  Boolean(contextBranchId && existing.branchId !== contextBranchId),
  ErrorMessages.get('section_branch_mismatch'), // or 'room_branch_mismatch'
  400,
);
```
*Result*: A user or API client authenticated in Branch B cannot mutate, deactivate, or delete records belonging to Branch A.

#### Rule 3: Timetable & Resource Branch Matching Invariants
Physical resources and personnel cannot be scheduled across branch boundaries:
1. **Room Branch Compatibility**:
   - When generating or manually adding timetable entries, the physical `Room` (`roomId`) MUST belong to the exact same branch as the section:
   ```ts
   Ensure.custom(
     room.branchId !== section.branchId,
     ErrorMessages.get('room_branch_mismatch'),
     400,
   );
   ```
   - Automated schedule solvers MUST filter available rooms strictly by `where: { branchId: section.branchId }`.
2. **Teacher Branch Assignment Compatibility**:
   - A teacher assigned to a section subject or scheduled in a timetable slot MUST be officially assigned to that branch in the `branch_teachers` table:
   ```ts
   const branchTeacherCount = await client.branchTeacher.count({
     where: {
       instituteId: this.getInstituteId(),
       teacherId: dto.teacherId,
       branchId: section.branchId,
     },
   });
   Ensure.custom(
     branchTeacherCount === 0,
     ErrorMessages.get('teacher_not_assigned_to_branch'),
     400,
   );
   ```

#### Rule 4: Prisma Transaction Client Consistency
Inside transactional workflows, repositories MUST access the transactional client via `this.client` or repository methods (`this.findOne`, `this.findMany`) and NEVER invoke `this.prisma` directly. Bypassing `this.client` breaks atomic ACID rollbacks.

### 4.4 Soft Delete & Audit (repository flags)

Configured by the child repository, in the same style as `branchKey` / `yearKey`:

```ts
export class SubjectRepository extends TenantAwareRepository<Subject> {
  protected override readonly softDelete = true;                  // model has deletedAt
  protected override readonly softDeleteReleaseFields = ['name']; // unique columns to free
  protected override readonly audited = true;                     // model has createdById/updatedById
  // protected override readonly actorColumns = false;            // audited model WITHOUT those columns (users)
}
```

* **`softDelete`**: `delete()` sets `deletedAt` instead of removing the row; `scopeWhere()`, `findById()` and every base read skip deleted rows. Custom queries that bypass `scopeWhere()` (e.g. `findRawById`) MUST wrap their `where` with `this.notDeleted(...)`. Relation includes of soft-deletable children SHOULD filter `deletedAt: null`.
* **`softDeleteReleaseFields`**: string columns covered by a unique constraint are suffixed with `__deleted_<id>` on soft delete so the value can be reused by a new record.
* **`audited`**: `create()` stamps `createdById`/`updatedById` from `RequestContext`; `update()` / `delete()` write an `AuditLog` row (`before` snapshot + `changes`) in the same transaction. Keys matching `/password/i` are never written to the log. A model that must be audited but has no actor columns (`User`, via `StaffRepository`) sets `actorColumns = false`: AuditLog rows are written, column stamping is skipped.
* Soft-delete models today: `Student`, `Family`, `Teacher`, `Section`, `Subject`, `Room`, `User` (`phone` released). Audited: the same minus `User`. Financial and academic records (`StudentSubscription`, `Installment`, `Payment`, `ExamResult`, `LessonAttendance`, `Exam`, `StudentEnrollment`, `EnrollmentSubject`) already have the actor columns and MUST set `audited = true` when their repository is created.
* Repositories without the flags keep the original hard-delete behaviour.

---
