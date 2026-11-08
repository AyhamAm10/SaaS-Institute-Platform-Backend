# Backend core rules (read this first, always)

> Short entry to the rules contract. The full text is split by topic in this folder; read the topic file only when your task touches it. Section numbers (`§N`) match the old single `role.md`, so references in code comments still resolve.

**Stack**: NestJS 12, TypeScript 6 (strict), Prisma 7 (`@prisma/adapter-pg`), PostgreSQL, Redis (`ioredis`, BullMQ), JWT, Swagger (`@nestjs/swagger`).

## Commands

| Task | Command |
|---|---|
| Build / lint / format | `npm run build` / `npm run lint` (oxlint) / `npm run format` |
| Unit tests / e2e | `npm test` / `npm run test:e2e` |
| Migration (dev) | `npm run prisma:migrate` (`prisma:migrate:create` to only create the file) |
| Seed / reset DB | `npm run prisma:seed` / `npm run db:reset` |

## The shape of every feature (§1, §14)

`src/modules/<feature>/` = `<feature>.controller.ts` → `<feature>.service.ts` → `<feature>.repository.ts` + `<feature>.module.ts` + `dto/`.

| Layer | Does | Never does |
|---|---|---|
| Controller | Routing, DTO binding, guards/decorators (`@RequireResource`, `@Roles`), swagger | Business logic, Prisma, `PrismaService` injection |
| Service | Business rules, `Ensure` checks, orchestration, calls OTHER modules only through their services (§10) | Raw queries, HTTP concerns |
| Repository | Prisma access only, extends a base tier (below) | Business decisions |

## Repository tiers (§4) — pick the right base

- `TenantAwareRepository<T>`: auto-scopes `instituteId` (default for tenant data).
- `ContextScopedRepository<T>`: tenant + `branchKey` / `yearKey` from the request context (data that belongs to a branch or academic year). Point lookups MUST use `this.scopeWhere({ id })`.
- `SystemRepository<T>`: no tenant scope (auth/system only, explicit and rare).
- Flags: `softDelete`, `audited` on the repository class.

## Operational context (§2, §3.4, §9.3)

The dashboard sends `X-Branch-Id` and `X-Academic-Year-Id`. DTO fields `branchId` / `academicYearId` are `@IsOptional()`; the context supplies them. Mutating another branch's entity → `400` (`*_branch_mismatch`). Always check cross-entity compatibility (room ↔ section branch, teacher ↔ branch).

## Errors and messages (§6, §7)

Use `Ensure.*` and `ErrorMessages.get('key')` (Arabic + English entries). Never throw ad-hoc exceptions or hardcode user-facing strings.

## DTOs (§9)

`class-validator` on everything; the global `ValidationPipe` uses `whitelist` + `forbidNonWhitelisted`, so an unknown property is a 400. New endpoints without a validated DTO are not allowed.

## Permissions (§8)

`@RequireResource(Resource.X)` where `Resource` ∈ dashboard, students, attendance, fees, exams, academic, settings, staff; the role → permission map is in `src/common/types/permissions.ts`. Roles: SUPER_ADMIN, INSTITUTE_ADMIN, REGISTRAR, ACCOUNTANT, TEACHER, FAMILY, STUDENT.

## Non-negotiables (full list in `agent-rules.md`, §19)

1. Never bypass tenant scoping; never inject Prisma into controllers.
2. One domain owner per business rule; reuse its service, never duplicate logic (§10).
3. No new competing patterns (no TypeORM, Passport, raw SQL, ad-hoc exceptions).
4. No `any`, no `@ts-ignore`; explicit return types on public service/repository methods.
5. No silent refactoring and no API contract change unless the task asks for it.
6. Change safety (§20): inspect consumers before touching `src/common`, `src/context`, `src/database`; run unit + e2e tests.
7. **Never `git commit` / `git push`.** The owner publishes.

## Topic map — read only what the task touches

| If the task involves… | Read |
|---|---|
| Layers, request context, module layout, DI (§1, 2, 14, 15) | `architecture.md` |
| Tenant/branch/year isolation, repositories, soft delete, audit (§3, 4) | `tenancy.md` |
| Prisma schema, pagination, filtering, transactions, DB rules (§5, 11, 12, 13, 17) | `data.md` |
| Errors, i18n (§6, 7) | `errors-i18n.md` |
| Auth, JWT, RBAC, feature flags, staff permissions (§8) | `auth.md` |
| DTOs and validation (§9) | `api-dtos.md` |
| Which service owns which rule: reference data, enrollments, fees, attendance, exams, dashboard, reports (§10) | `domain-ownership.md` |
| Config/secrets, TypeScript, change safety (§16, 18, 20) | `quality.md` |
| Agent rules and documentation duty (§19, 21) | `agent-rules.md` |

## Where to learn what already exists

Do not scan the source to discover features. Start at the workspace `docs/INDEX.md`, then the feature doc under `docs/features/` for the area you touch.
