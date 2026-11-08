# Backend rules — moved

The single 940-line contract was split by topic so agents read only what they need.

**Start here: [`docs/rules/core.md`](docs/rules/core.md)** (about 75 lines, always read).

Section numbers are preserved, so `role.md §N` references in code and docs still resolve:

| Section | File |
|---|---|
| §1 Layers, §2 Request context, §14 Module structure, §15 DI | `docs/rules/architecture.md` |
| §3 Multi-tenancy, §4 Repository scoping | `docs/rules/tenancy.md` |
| §5 Prisma, §11 Pagination, §12 Filtering, §13 Transactions, §17 Relational DB | `docs/rules/data.md` |
| §6 Errors, §7 i18n | `docs/rules/errors-i18n.md` |
| §8 Auth, sessions, RBAC | `docs/rules/auth.md` |
| §9 DTOs and validation | `docs/rules/api-dtos.md` |
| §10 Service reuse and domain ownership | `docs/rules/domain-ownership.md` |
| §16 Config, §18 TypeScript, §20 Change safety | `docs/rules/quality.md` |
| §19 Agent rules, §21 Documentation duty | `docs/rules/agent-rules.md` |
