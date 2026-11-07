import { jest } from '@jest/globals';
import { ReportVerificationService } from './report-verification.service';

describe('ReportVerificationService', () => {
  const institute = { id: 3, name: 'معهد الاختبار', logoUrl: 'l.png', primaryColor: '#f60' };
  const repo = { findById: jest.fn(async (id: number) => (id === 3 ? institute : null)) };
  const service = new ReportVerificationService(repo as never);
  const issue = () =>
    service.issue({
      instituteId: 3,
      kind: 'student-statement',
      subject: 'سارة',
      lines: ['المتبقي 100 ل.س'],
      issuedAt: new Date('2026-11-07T10:00:00Z'),
    });

  it('issues a numbered token that decodes back', () => {
    const { number, token } = issue();
    expect(number).toMatch(/^ST-20261107-[0-9A-F]{6}$/);
    expect(service.decode(token)).toMatchObject({ i: 3, k: 'student-statement', n: number, s: 'سارة' });
  });

  it('rejects a tampered or malformed token', () => {
    const { token } = issue();
    const [body, sig] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), l: ['المتبقي 0 ل.س'] }),
    ).toString('base64url');
    expect(service.decode(`${forged}.${sig}`)).toBeNull();
    expect(service.decode('nope')).toBeNull();
    expect(service.decode(`${body}.x`)).toBeNull();
  });

  it('verify returns the institute and the signed lines', async () => {
    const { token, number } = issue();
    await expect(service.verify(token)).resolves.toMatchObject({
      valid: true,
      institute: { name: 'معهد الاختبار' },
      number,
      lines: ['المتبقي 100 ل.س'],
    });
    await expect(service.verify('bad.token')).resolves.toEqual({ valid: false });
  });

  it('a token of an unknown institute is not valid', async () => {
    const other = service.issue({ instituteId: 99, kind: 'receipt', subject: 'x', lines: [], issuedAt: new Date() });
    expect(other.number.startsWith('RC-')).toBe(true);
    await expect(service.verify(other.token)).resolves.toEqual({ valid: false });
  });
});
