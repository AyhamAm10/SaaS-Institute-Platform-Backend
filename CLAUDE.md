# institute-platform-backend

NestJS 12 + Prisma 7 + PostgreSQL API for the multi-tenant institute platform. Workspace context: `../CLAUDE.md`.

## Before any change

1. Read `docs/rules/core.md` (always), then only the topic files it points to for your task.
2. Read `../docs/INDEX.md` and the feature doc for the area you touch (`../docs/features/`).
3. After the change, update that feature doc and the INDEX line.

## Essentials

- Feature = `src/modules/<feature>/` with controller → service → repository (+ `dto/`, module). Repositories extend `TenantAwareRepository` or `ContextScopedRepository`.
- Branch and academic-year context comes from the `X-Branch-Id` / `X-Academic-Year-Id` headers.
- Errors: `Ensure` + `ErrorMessages` (Arabic/English). DTOs: `class-validator`, unknown properties are rejected.
- Verify with `npm run build`, `npm run lint`, `npm test`, and `npm run test:e2e`.
- Never `git commit` / `git push`.
