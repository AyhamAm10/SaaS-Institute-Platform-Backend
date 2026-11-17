import { jest } from '@jest/globals';
import { AuditViewService } from './audit-view.service';
import { auditChanges, auditLabel } from './audit-view.rules';

describe('audit view rules', () => {
  it('lists the fields that really changed, with the value before and after', () => {
    const changes = auditChanges(
      { fullName: 'أحمد', phone: '0911', updatedAt: 'x' },
      { fullName: 'أحمد علي', phone: '0911', updatedAt: 'y', updatedById: 3 },
    );
    expect(changes).toEqual([{ field: 'fullName', before: 'أحمد', after: 'أحمد علي' }]);
  });

  it('shows a dash for a missing value and cuts long ones', () => {
    const [c] = auditChanges({}, { note: 'x'.repeat(200) });
    expect(c.before).toBe('—');
    expect(c.after).toHaveLength(81);
    expect(c.after.endsWith('…')).toBe(true);
  });

  it('keeps at most 8 fields and nothing without changes', () => {
    const many = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`f${i}`, i + 1]));
    expect(auditChanges({}, many)).toHaveLength(8);
    expect(auditChanges({ a: 1 }, null)).toEqual([]);
  });

  it('recognises a record by its name or title', () => {
    expect(auditLabel({ id: 4, fullName: 'سامي' })).toBe('سامي');
    expect(auditLabel({ title: 'مذاكرة 1' })).toBe('مذاكرة 1');
    expect(auditLabel({ id: 4 })).toBeNull();
    expect(auditLabel(null)).toBeNull();
  });
});

describe('AuditViewService', () => {
  const rows = [
    { id: 2, userId: 5, entity: 'student', entityId: 9, action: 'UPDATE', createdAt: new Date('2026-11-10T08:00:00Z'), before: { fullName: 'سامي', phone: '1' }, changes: { phone: '2' } },
    { id: 1, userId: null, entity: 'payment', entityId: 3, action: 'DELETE', createdAt: new Date('2026-11-09T08:00:00Z'), before: { receiptNumber: 12 }, changes: null },
  ];
  let logs: { search: jest.Mock<any> };
  let service: AuditViewService;

  beforeEach(() => {
    logs = { search: jest.fn<any>().mockResolvedValue({ rows, total: 45 }) };
    service = new AuditViewService(
      logs as never,
      { findNames: jest.fn<any>().mockResolvedValue(new Map([[5, 'المدير']])) } as never,
      { getTimezone: jest.fn<any>().mockResolvedValue('Asia/Damascus') } as never,
    );
  });

  it('maps rows with the user name, label and changed fields, and pages the total', async () => {
    const result = await service.search({ page: 2, limit: 20, skip: 20 } as never);
    expect(result.totalPages).toBe(3);
    expect(result.data[0]).toMatchObject({
      userName: 'المدير',
      label: 'سامي',
      changes: [{ field: 'phone', before: '1', after: '2' }],
    });
    expect(result.data[1]).toMatchObject({ userName: null, label: '12', action: 'DELETE', changes: [] });
    expect(logs.search).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 20 }));
  });

  it('turns local dates into the institute-zone day bounds (inclusive end)', async () => {
    await service.search({ from: '2026-11-10', to: '2026-11-10', page: 1, limit: 20, skip: 0 } as never);
    const filter = logs.search.mock.calls[0][0] as { gte: Date; lt: Date };
    // Damascus is UTC+3: the 10th starts at 21:00Z on the 9th
    expect(filter.gte.toISOString()).toBe('2026-11-09T21:00:00.000Z');
    expect(filter.lt.toISOString()).toBe('2026-11-10T21:00:00.000Z');
  });
});
