# Data: Prisma, pagination, filtering, transactions, relational rules

> Part of the rules contract (sections 5, 11, 12, 13, 17 of the former single `role.md`). Section numbers are kept so existing `role.md §N` references still resolve. Start from `core.md`.

---

## 5. Prisma ORM Conventions

The project uses Prisma 7 with the `@prisma/adapter-pg` driver adapter.

### Prisma Rules:
1. **Access via Repositories Only**: `PrismaService` MUST NOT be injected into Controllers. It SHOULD be accessed exclusively via Repositories and `TransactionHelper`.
2. **Preserve Generated Types**: Use Prisma's generated types (e.g., `User`, `Institute`, `Prisma.UserWhereInput`) for entity references and query structures. Do not substitute them with `any` or loose custom interfaces.
3. **Lifecycle Management**: `PrismaService` extends `PrismaClient` and implements `OnModuleInit` (`$connect()`) and `OnModuleDestroy` (`$disconnect()`).
4. **Connection Pool**: Database connection configuration is supplied via `DATABASE_URL` through `ConfigService` in `PrismaService`.
5. **Schema as Single Source of Truth**: The Prisma schema (`prisma/schema.prisma`) defines the authoritative data model, foreign keys, cascade rules, and indexes.
6. **Migrations Only — never `db push`**: Every schema change ships as a migration in `prisma/migrations/`. Workflow:
   1. Edit `schema.prisma`.
   2. Generate SQL: `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script -o prisma/migrations/<timestamp>_<name>/migration.sql` (or `npm run prisma:migrate:create` in an interactive terminal).
   3. Review the SQL. Replace Prisma's `DROP COLUMN` + `ADD COLUMN` for type changes with `ALTER COLUMN ... TYPE ... USING (...)` and add backfills so existing data is preserved.
   4. Apply with `npm run prisma:deploy`, then `npm run prisma:generate`.
7. **Enums for fixed value sets**: Statuses, types and methods (`Gender`, `EnrollmentStatus`, `PaymentMethod`, `AttendanceStatus`, `Currency`, …) are Prisma enums; DTOs validate them with `@IsEnum(...)`. Free `String` columns are not used for closed sets.
8. **Money**: monetary amounts use `Decimal(18, 2)`; exchange rates `Decimal(18, 4)`. Supported currencies: `SYP`, `USD`.
9. **Week start**: day-of-week values follow JS (0 = Sunday … 6 = Saturday); the institute week starts on **Saturday** (default working days `[6, 0, 1, 2, 3, 4]`).
10. **Institute time zone**: instants (`DateTime`) are stored in UTC; calendar dates (attendance day, due dates, exam dates) are `@db.Date` in the **institute's** local calendar (`Institute.timezone`, default `Asia/Damascus`). Domain code MUST get "today" / "now" from `InstituteClockService` (`today()`, `localParts()`), never from `new Date()` date math. Pure helpers live in `src/common/time/timezone.ts`.

---

---

## 11. Pagination Standards

All paginated endpoints MUST conform to standard query and response structures.

### 11.1 Query Parameters (`PaginationQueryDto`)
* `page`: 1-based page index (`@IsPositive()`, `@IsInt()`, default = `1`).
* `limit`: Items per page (`@IsPositive()`, `@IsInt()`, `@Max(100)`, default = `20`).
* `skip`: Computed property `(page - 1) * limit` for Prisma offset.

### 11.2 Response Shape (`PaginatedResult<T>`)
```ts
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
```

### 11.3 Implementation:
Repositories extending `BaseRepository` provide `findManyPaginated(pagination, options)` which executes data fetching and total count concurrently via `Promise.all([findMany, count])` and returns `createPaginatedResult(data, total, page, limit)`.

---

---

## 12. Filtering and Searching

Dynamic query filtering MUST use Prisma-compatible structures and avoid SQL injection or untyped query builders.

### 12.1 `FilterBuilder` Utility (`src/common/filters/filter-builder.ts`)
The `FilterBuilder<TWhere>` provides a fluent API for building typed Prisma `where` objects:
```ts
const where = new FilterBuilder<Prisma.UserWhereInput>()
  .contains('fullName', query.search)
  .equals('role', query.role)
  .boolean('isActive', query.isActive)
  .range('createdAt', query.fromDate, query.toDate)
  .build();
```

### Rules:
* Methods in `FilterBuilder` (`equals`, `contains`, `in`, `notIn`, `range`, `startsWith`, `endsWith`, `boolean`, `relation`, `custom`) are safe no-ops when the passed value is `undefined` or `null`.
* `contains` defaults to case-insensitive matching (`mode: 'insensitive'`).
* For complex nested queries or raw Prisma expressions, define typed Prisma where objects directly. Do NOT build ad-hoc string-based query builders.

---

---

## 13. Transactions and Atomicity

Multi-step database modifications that require ACID guarantees MUST use Prisma interactive transactions.

### 13.1 `TransactionHelper` & `TransactionContext` (`src/database/`)

The application integrates Prisma interactive transactions with `AsyncLocalStorage`:

```ts
await this.transactionHelper.executeInTransaction(async () => {
  // All repository operations invoked inside this scope automatically
  // execute against the active Prisma transaction client.
  const user = await this.userRepository.create({ ... });
  await this.profileRepository.create({ userId: user.id, ... });
});
```

### Rules:
* Repositories MUST access Prisma via `this.client`, which resolves `TransactionContext.get() ?? this.prisma`.
* Developers MUST NOT pass transaction client objects (`tx`) manually through service and repository method signatures.
* Never simulate transactions manually. If an unhandled error occurs within `executeInTransaction`, the entire transaction is rolled back automatically by Prisma.

---

---

## 17. Relational Database Rules

The Prisma schema (`prisma/schema.prisma`) represents the educational institute domain model.

### Key Relational Constraints:
* **Tenant Root**: `Institute` is the root.
* **Branches**: `Branch` belongs to `Institute` (`@@unique([instituteId, code])`, `@@unique([instituteId, id])`).
* **Academic Hierarchy**: `AcademicYear` -> `Section` -> `StudentEnrollment` / `Timetable` / `StudentSubscription`.
* **Pedagogical Links**: `Subject`, `Teacher`, `SectionTeacher`, `SectionSubject`, `Lesson`, `Exam`, `ExamResult`, `LessonAttendance`.
* **Financial Model** (management system only — no accounting ledger yet): `StudentSubscription` (enrollment contract: currency, exchange rate, gross/discount/total, first payment) -> `Installment` (amount, paidAmount, status) -> `Payment` (receipt number, currency, method, ACTIVE/CANCELLED).
* **Compound Keys**: Tenant-aware tables MUST maintain compound uniqueness where applicable (e.g., `@@unique([instituteId, id])`) to reinforce multi-tenant data integrity.

---
