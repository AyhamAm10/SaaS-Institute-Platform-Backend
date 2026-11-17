import { AuditFieldChange } from './dto/audit-query.dto';

/** Technical columns that say nothing to the reader. */
const HIDDEN_FIELDS = new Set([
  'updatedAt',
  'updatedById',
  'createdAt',
  'createdById',
  'instituteId',
  'id',
]);

/** Most fields shown per entry (the rest would be noise). */
const MAX_FIELDS = 8;
const MAX_VALUE = 80;

/** Fields that help to recognise the record, in order of preference. */
const LABEL_FIELDS = ['fullName', 'name', 'title', 'familyName', 'receiptNumber', 'body', 'reason'];

const show = (value: unknown): string => {
  if (value === null || value === undefined) return '—';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return text.length > MAX_VALUE ? `${text.slice(0, MAX_VALUE)}…` : text;
};

/** A name or title taken from the record before the change. */
export function auditLabel(before: Record<string, unknown> | null): string | null {
  if (!before) return null;
  for (const key of LABEL_FIELDS) {
    const value = before[key];
    if (value !== null && value !== undefined && String(value).trim() !== '') return show(value);
  }
  return null;
}

/**
 * What changed in an UPDATE: the fields written, each with the value before
 * (from the snapshot) and after. Technical columns are skipped.
 */
export function auditChanges(
  before: Record<string, unknown> | null,
  changes: Record<string, unknown> | null,
): AuditFieldChange[] {
  if (!changes) return [];
  return Object.keys(changes)
    .filter((field) => !HIDDEN_FIELDS.has(field))
    .map((field) => ({
      field,
      before: show(before?.[field]),
      after: show(changes[field]),
    }))
    .filter((c) => c.before !== c.after)
    .slice(0, MAX_FIELDS);
}
