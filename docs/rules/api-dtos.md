# DTOs and API validation

> Part of the rules contract (sections 9 of the former single `role.md`). Section numbers are kept so existing `role.md §N` references still resolve. Start from `core.md`.

---

## 9. DTOs and API Validation

Validation is enforced at the HTTP boundary via NestJS `ValidationPipe`.

### 9.1 Global Configuration (`src/main.ts`):
```ts
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,            // Strips any property not defined in DTO
    forbidNonWhitelisted: true,  // Throws 400 if extra properties are sent
    transform: true,            // Automatically coerces payloads to DTO class instances
    transformOptions: {
      enableImplicitConversion: false,
    },
  }),
);
```

### 9.2 DTO General Rules:
* All controller inputs (`@Body()`, `@Query()`, `@Param()`) MUST have strongly typed DTO classes decorated with `class-validator` and `class-transformer` decorators.
* DTOs MUST ONLY validate syntax, format, data types, and presence.
* Domain business rules (e.g., verifying user balance, relationship validity) MUST NOT be embedded in DTO custom validators; they belong in Services.
* Tenant identity (`instituteId`) MUST NEVER be included in Create/Update DTOs; it is always derived from authenticated JWT context.

### 9.3 Header-First Operational Scoping (Zero-Manual-Input Pattern)
To ensure smooth frontend and mobile developer experience:
1. **Optional Operational Fields in DTOs**:
   - Fields representing operational context dimensions (`branchId` and `academicYearId`) MUST be decorated with `@IsOptional()` in operational DTOs (`CreateSectionDto`, `CreateRoomDto`, query DTOs, etc.).
   - Frontend and mobile applications automatically inject these dimensions via custom HTTP headers (`X-Branch-Id`, `X-Academic-Year-Id`). Developers/forms are not required to manually send them in every request payload.
2. **Three-Tier Service Fallback Resolution**:
   - Services MUST implement hierarchical fallback resolution when binding operational dimensions:
   ```ts
   // Target Branch Resolution:
   const targetBranchId = dto.branchId ?? RequestContext.getBranchId();
   const branch = targetBranchId
     ? await this.branchRepository.findById(targetBranchId)
     : await this.branchRepository.getOrCreateDefaultBranch();

   // Target Academic Year Resolution:
   const targetYearId = dto.academicYearId ?? RequestContext.getAcademicYearId();
   const academicYear = targetYearId
     ? await this.academicYearRepository.findById(targetYearId)
     : await this.academicYearRepository.getCurrentYear();
   ```
3. **Repository Context Injection**:
   - If an operational field is omitted from a creation DTO, `ContextScopedRepository.create()` automatically injects direct column values from `RequestContext` if present.

---
