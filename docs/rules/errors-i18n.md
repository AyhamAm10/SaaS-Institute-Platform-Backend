# Errors and localization

> Part of the rules contract (sections 6, 7 of the former single `role.md`). Section numbers are kept so existing `role.md §N` references still resolve. Start from `core.md`.

---

## 6. Centralized Error Handling

Error handling is standardized around the `Ensure` validation utility, the `ErrorMessages` registry, and the `GlobalExceptionFilter`.

```text
Service Layer (Ensure.exists / Ensure.required / Ensure.unauthorized)
       ↓ Throws NestJS HttpException (NotFoundException, BadRequestException, etc.)
GlobalExceptionFilter (Catches exception)
       ↓ Formats normalized JSON response
Client Response
```

### 6.1 `Ensure` Guard Methods (`src/common/errors/ensure.ts`)

| Method | Behavior | HTTP Status |
| :--- | :--- | :--- |
| `Ensure.exists(val, resource)` | Asserts `val` is not null/undefined; throws with `{resource} not found` | `404 Not Found` |
| `Ensure.required(val, field)` | Asserts `val` is not null/undefined/empty string; throws with `{field} is required` | `400 Bad Request` |
| `Ensure.alreadyExists(val, resource)` | Asserts `val` is null/undefined; throws if resource exists | `409 Conflict` |
| `Ensure.unauthorized(cond, msg?)` | Throws if `cond === true` | `401 Unauthorized` |
| `Ensure.forbidden(cond, msg?)` | Throws if `cond === true` | `403 Forbidden` |
| `Ensure.isNumber(val, field)` | Asserts `typeof val === 'number'` and not `NaN` | `400 Bad Request` |
| `Ensure.isArray(val, field)` | Asserts `Array.isArray(val)` | `400 Bad Request` |
| `Ensure.custom(cond, msg, status)` | Throws `HttpException(msg, status)` if `cond === true` | Configurable (`400` default) |

### 6.2 Standard Error Response Payload
All errors returned by the API conform to `ErrorResponse`:
```json
{
  "statusCode": 404,
  "message": "User not found",
  "error": "NotFoundException",
  "timestamp": "2026-09-01T13:15:30.000Z",
  "path": "/api/users/99"
}
```

### Rules:
* Developers MUST NOT use `throw new Error(...)` for predictable application or domain errors.
* Unhandled non-HTTP exceptions are caught by `GlobalExceptionFilter`, logged with full stack traces, and returned as generic `500 Internal server error` responses.

---

---

## 7. Localization and Internationalization (i18n)

The application supports multi-language error messaging through `ErrorMessages` (`src/common/errors/error-messages.ts`).

### Language Resolution:
1. `RequestContextMiddleware` parses the HTTP `Accept-Language` header from incoming requests.
2. The language code (e.g., `'ar'`, `'en'`) is stored in `RequestContext`.
3. `ErrorMessages.get(key, params)` fetches the message in the resolved language, falling back to `'en'`.

### Rules:
* Error strings MUST NOT be hardcoded inside service logic.
* To add a new error message, register the key across all language dictionaries in `error-messages.ts`.
* Parameter placeholders use `{paramName}` syntax (e.g., `"{resource} not found"` / `"{resource} غير موجود"`).

---
