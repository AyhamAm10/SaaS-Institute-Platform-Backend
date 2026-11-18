/** Central registry of BullMQ queue names (role.md §14.2). */
export const QueueNames = {
  /** System dispatcher: fans scheduled work out to one job per institute. */
  dispatch: 'dispatch',
  /** Per-institute fee jobs (mark overdue installments). */
  fees: 'fees',
  /** Per-institute attendance jobs (mark absences after the close time). */
  attendance: 'attendance',
  /** Per-institute notification jobs (push sending, hourly reminders). */
  notifications: 'notifications',
} as const;

export const JobNames = {
  dispatchScheduled: 'dispatch-scheduled',
  markOverdueInstallments: 'mark-overdue-installments',
  markAbsences: 'mark-absences',
  sendPush: 'send-push',
  sendReminders: 'send-reminders',
} as const;

/**
 * Background workers and schedules run unless `JOBS_ENABLED=false`
 * (tests, or an API-only instance). Workers are created with
 * `autorun: false` and started on bootstrap only when this is true.
 */
export function jobsEnabled(): boolean {
  return process.env['JOBS_ENABLED'] !== 'false';
}
