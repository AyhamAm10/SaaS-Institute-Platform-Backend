# institute-platform-backend

NestJS 12 + Prisma 7 + PostgreSQL API for the multi-tenant institute platform (Swagger enabled).

- Workspace entry and protocol: `../CLAUDE.md`
- Rules (binding): `docs/rules/core.md`
- Feature and behavior docs: `../docs/INDEX.md`

## Run locally

```bash
npm install
npm run prisma:generate
npm run prisma:migrate     # create/apply migrations on the dev database
npm run prisma:seed
npm run start:dev
```

Needs PostgreSQL and Redis (see `.env`). Tests: `npm test`, `npm run test:e2e`. Lint/format: `npm run lint`, `npm run format`.
