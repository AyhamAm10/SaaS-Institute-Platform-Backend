import { jest } from '@jest/globals';
import { Job } from 'bullmq';
import { fiveMinuteSlot, ScheduledDispatcherProcessor } from './scheduled-dispatcher.processor';
import { JobNames } from '../../infrastructure/queue/queue-names';

describe('ScheduledDispatcherProcessor', () => {
  const build = () => {
    const queue = () => ({ addBulk: jest.fn<any>() });
    const fees = queue();
    const attendance = queue();
    const notifications = queue();
    const processor = new ScheduledDispatcherProcessor(
      { findAllIds: async () => [2, 5] } as never,
      fees as never,
      attendance as never,
      notifications as never,
    );
    return { processor, fees, attendance, notifications };
  };

  it('floors the time to a 5-minute slot without any colon', () => {
    expect(fiveMinuteSlot(new Date('2026-11-18T11:17:42Z'))).toBe('2026-11-18T11-15');
    expect(fiveMinuteSlot(new Date('2026-11-18T09:04:59Z'))).toBe('2026-11-18T09-00');
  });

  it('every 5 minutes: queues only lesson reminders, with ids BullMQ accepts (exactly two colons)', async () => {
    const { processor, fees, notifications } = build();
    await processor.process({ name: JobNames.dispatchFrequent } as Job);
    expect(fees.addBulk).not.toHaveBeenCalled();
    const jobs = notifications.addBulk.mock.calls[0][0] as { name: string; opts: { jobId: string } }[];
    expect(jobs.map((j) => j.name)).toEqual([JobNames.sendLessonReminders, JobNames.sendLessonReminders]);
    for (const j of jobs) expect(j.opts.jobId.split(':')).toHaveLength(3);
  });

  it('every hour: queues the per-institute daily work and reminders', async () => {
    const { processor, fees, attendance, notifications } = build();
    await processor.process({ name: JobNames.dispatchScheduled } as Job);
    expect(fees.addBulk).toHaveBeenCalledTimes(1);
    expect(attendance.addBulk).toHaveBeenCalledTimes(1);
    const jobs = notifications.addBulk.mock.calls[0][0] as { name: string; opts: { jobId: string } }[];
    expect(jobs[0].name).toBe(JobNames.sendReminders);
    for (const j of jobs) expect(j.opts.jobId.split(':')).toHaveLength(3);
  });
});
