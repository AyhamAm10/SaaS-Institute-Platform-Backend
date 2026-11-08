# Config, code quality, change safety

> Part of the rules contract (sections 16, 18, 20 of the former single `role.md`). Section numbers are kept so existing `role.md §N` references still resolve. Start from `core.md`.

---

## 16. Configuration and Secrets Management

1. **Environment Variables**: All environment-dependent values MUST be retrieved using `@nestjs/config` (`ConfigService`) or typed config abstractions.
2. **Never Hardcode Secrets**:
   - Database credentials (`DATABASE_URL`)
   - JWT secrets (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`)
   - Redis connection (`REDIS_URL`, may include the password)
   - API keys and tokens
3. **Strict Validation**: Critical configurations MUST use `configService.getOrThrow<string>('KEY')` on startup to fail fast if variables are missing.

---

---

## 18. TypeScript and Code Quality Standards

* **Strict TypeScript**: Strict mode is enabled (`strict: true`, `noImplicitAny: true`).
* **No `any`**: Avoid `any`. Use generics, `unknown` with type guards, or explicit Prisma generated types.
* **Explicit Return Types**: Public service and repository methods SHOULD have explicit return types.
* **Linting & Formatting**: Code MUST pass `npm run lint` (`oxlint`) and `npm run format` (`prettier`).
* **No Compiler Suppression**: Do not use `@ts-ignore` or `@ts-nocheck` to bypass compilation or type-checking errors.

---

---

## 20. Change Safety Invariant

> **Primary Engineering Mandate**:  
> A modification in one feature MUST NOT unexpectedly alter or break the behavior of unrelated features.

### Guidelines for Change Safety:
* Before modifying shared infrastructure (`src/common/`, `src/context/`, `src/database/`), inspect all consumer modules.
* Run existing automated unit and e2e test suites (`npm run test`, `npm run test:e2e`) to verify that modifications do not regress system functionality.
* Avoid global mutable state or side effects outside the request's `AsyncLocalStorage` scope.

---
