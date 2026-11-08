# Mandatory AI agent rules and doc maintenance

> Part of the rules contract (sections 19, 21 of the former single `role.md`). Section numbers are kept so existing `role.md §N` references still resolve. Start from `core.md`.

---

## 19. Mandatory AI Agent Rules

Any AI coding assistant or automated agent working on this backend MUST obey the following instructions:

1. **Read the rules first**: Read `docs/rules/core.md` (and the topic files it points to for your task) before designing or implementing any code changes. `role.md` is now only a pointer to this folder.
2. **Preserve Tenant Isolation**: NEVER bypass `TenantAwareRepository` or omit `instituteId` scoping for tenant-owned models.
3. **Enforce Operational Scoping via `ContextScopedRepository`**: For entities scoped to branches or academic years, extend `ContextScopedRepository<T>` and declare `branchKey` and/or `yearKey`.
4. **Prevent Point-Lookup Data Leakage**: Repository single-entity fetch methods (`findByIdWithDetails`) MUST use `where: this.scopeWhere({ id })` to prevent cross-branch entity leakage.
5. **Assert Branch Ownership on Mutation**: Domain services handling updates, deletions, or status toggles MUST assert that `contextBranchId && entity.branchId !== contextBranchId` throws `400 Bad Request` (`section_branch_mismatch`, `room_branch_mismatch`).
6. **Validate Cross-Entity Resource Compatibility**: When linking resources (assigning rooms to timetable slots, assigning teachers to sections), ALWAYS verify that physical rooms belong to the section's branch and teachers are assigned to that branch via `branch_teachers`.
7. **Keep Operational DTO Fields Optional**: Operational fields (`branchId`, `academicYearId`) in Create/Update/Query DTOs MUST be decorated with `@IsOptional()` to allow HTTP headers (`x-branch-id`, `x-academic-year-id`) to drive operational context cleanly.
8. **No Direct Prisma in Controllers**: Controllers MUST NOT inject or execute `PrismaService`.
9. **No Competing Patterns**: NEVER introduce a secondary pattern (e.g., TypeORM, Passport strategies, manual SQL queries, ad-hoc exceptions) when a project pattern already exists (`FilterBuilder`, `Ensure`, `JwtTokenService`, `RequestContext`).
10. **Single Domain Ownership**: NEVER duplicate business logic across modules.
11. **No Silent Refactoring**: DO NOT refactor existing working modules or change established API contracts unless specifically instructed in the task.
12. **Maintain Error Standards**: Use `Ensure` and `ErrorMessages` for domain validations and HTTP errors.
13. **Keep DTOs and Contracts Strict**: All new endpoints MUST have validated DTOs with `class-validator`.
14. **Preserve Prisma Type Safety**: Do not cast database entities to `any`.
15. **Consistency Over Preference**: Always prioritize consistency with the established codebase over external conventions or personal style.

---

---

## 21. Documentation and Contract Maintenance

* `docs/rules/` (this folder) is the single persistent architectural contract for the backend; `role.md` only points here.
* When a new permanent architectural pattern, infrastructure service, or global convention is introduced and approved, the relevant file in `docs/rules/` MUST be updated in the same change (keep section numbers stable).
* Architectural rules MUST NOT remain isolated in ephemeral discussions or conversation histories.
* **Feature documentation duty**: every feature you add or change MUST update its file under the workspace `docs/features/` (template in `docs/features/_TEMPLATE.md`) and its line in `docs/INDEX.md` in the same change. A task is not done until the docs match the code.
