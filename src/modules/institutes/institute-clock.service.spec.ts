import { jest } from '@jest/globals';
import { InstituteClockService } from './institute-clock.service';
import { InstituteRepository } from './institute.repository';
import { RequestContext } from '../../context/request-context';

describe('InstituteClockService', () => {
  const ctx = {
    userId: 1,
    instituteId: 7,
    role: 'INSTITUTE_ADMIN',
    language: 'en',
  };

  function createClock(timezone: string | null) {
    const repo = {
      findById: jest.fn(async () => (timezone ? { id: 7, timezone } : null)),
    } as unknown as InstituteRepository;
    return { clock: new InstituteClockService(repo), repo };
  }

  it('computes local parts in the institute time zone', async () => {
    const { clock, repo } = createClock('Asia/Damascus');

    const parts = await RequestContext.run(ctx, () =>
      clock.localParts(new Date('2026-11-02T22:30:00Z')),
    );

    expect(parts.date).toBe('2026-11-03');
    expect(repo.findById).toHaveBeenCalledWith(7);
  });

  it('falls back to the default time zone', async () => {
    const { clock } = createClock(null);

    const timezone = await RequestContext.run(ctx, () => clock.getTimezone());

    expect(timezone).toBe('Asia/Damascus');
  });
});
