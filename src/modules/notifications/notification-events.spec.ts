import { jest } from '@jest/globals';
import { RequestContext } from '../../context/request-context';
import { NotificationEventsService } from './notification-events.service';
import { StudyNotificationEventsService } from './study-notification-events.service';
import { NotificationType as T } from './notification.types';
import { messages, moneyText } from './notification.messages';

const yazan = { studentId: 1, fullName: 'يزن الخطيب', female: false, familyUserIds: [10], studentUserId: 20 };
const salma = { studentId: 2, fullName: 'سلمى الخطيب', female: true, familyUserIds: [10], studentUserId: null };

describe('notification events', () => {
  let notify: jest.Mock<any>;
  let audience: Record<string, jest.Mock<any>>;
  let events: NotificationEventsService;
  let study: StudyNotificationEventsService;

  beforeEach(() => {
    notify = jest.fn<any>().mockResolvedValue([]);
    audience = {
      students: jest.fn<any>().mockImplementation(async (ids: number[]) =>
        [yazan, salma].filter((s) => ids.includes(s.studentId)),
      ),
      sectionStudentIds: jest.fn<any>().mockResolvedValue([1, 2]),
      teacherUsers: jest.fn<any>().mockResolvedValue(new Map([[4, 40]])),
      studentsIn: jest.fn<any>().mockResolvedValue([1]),
      teacherIdsIn: jest.fn<any>().mockResolvedValue([4]),
    };
    events = new NotificationEventsService({ notify } as never, audience as never);
    study = new StudyNotificationEventsService({ notify } as never, audience as never);
  });

  const call = (i = 0) => notify.mock.calls[i][0] as Record<string, unknown>;

  it('tells only the family about an on-time arrival', async () => {
    await events.attendanceCheckIn({ studentId: 1, late: false, time: '08:05', date: '2026-11-17' });
    expect(call()).toMatchObject({ type: T.ATTENDANCE_ARRIVAL, userIds: [10], dedupeKey: 'att-in:1:2026-11-17' });
  });

  it('tells the family and the student about a late arrival', async () => {
    await events.attendanceCheckIn({ studentId: 1, late: true, time: '08:40', date: '2026-11-17' });
    expect(call()).toMatchObject({ type: T.ATTENDANCE_LATE, userIds: [10, 20] });
  });

  it('never throws when the audience lookup fails', async () => {
    audience.students.mockRejectedValue(new Error('db'));
    await expect(events.studentNote({ noteId: 3, studentId: 1, body: 'x' })).resolves.toBeUndefined();
  });

  it('announces a payment to the family once per payment', async () => {
    await events.paymentReceived({ paymentId: 9, studentId: 2, receiptNumber: 15, amount: 250000, currency: 'SYP' });
    expect(call()).toMatchObject({ type: T.PAYMENT_RECEIVED, userIds: [10], dedupeKey: 'payment:9', extra: { paymentId: 9 } });
    expect(call().body).toContain('250,000 ل.س');
  });

  it('sends each sibling their own exam notice and tells the teacher', async () => {
    await RequestContext.run({ userId: 1, instituteId: 3 } as never, () =>
      study.examCreated({
        examId: 5, sectionId: 2, subjectId: 3, sectionName: 'التاسع - شعبة أ',
        subjectName: 'رياضيات', title: 'مذاكرة أولى', examDate: '2026-11-20', teacherId: 4,
      }),
    );
    expect(notify.mock.calls.map((c) => (c[0] as { dedupeKey: string }).dedupeKey)).toEqual([
      'exam:5:1', 'exam:5:2', 'teacher-exam:5',
    ]);
    expect(call(2)).toMatchObject({ type: T.TEACHER_EXAM_CREATED, userIds: [40] });
  });

  it('does not tell a teacher about the exam they created themselves', async () => {
    await RequestContext.run({ userId: 40, instituteId: 3 } as never, () =>
      study.examCreated({
        examId: 5, sectionId: 2, subjectId: 3, sectionName: 'س', subjectName: 'م',
        title: 't', examDate: '2026-11-20', teacherId: 4,
      }),
    );
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it('sends one closure notice to families, students and teachers', async () => {
    await study.closureCreated({ closureId: 8, reason: 'عيد', fromDate: '2026-12-01', toDate: '2026-12-01', branchId: 1, sectionIds: [] });
    expect(audience.studentsIn).toHaveBeenCalledWith({ branchId: 1 });
    expect(call()).toMatchObject({ type: T.CLOSURE, userIds: [10, 20, 40], dedupeKey: 'closure:8' });
  });
});

describe('notification messages', () => {
  it('follows the student gender', () => {
    expect(messages.arrival({ name: 'يزن', female: false }, '08:00').title).toBe('وصل يزن إلى المعهد');
    expect(messages.arrival({ name: 'سلمى', female: true }, '08:00').title).toBe('وصلت سلمى إلى المعهد');
    expect(messages.absent({ name: 'سلمى', female: true }, '2026-11-17').title).toBe('سلمى غائبة اليوم');
  });

  it('formats money and marks', () => {
    expect(moneyText(1500.5, 'USD')).toBe('1,500.5 $');
    expect(messages.examResult('يزن', 'فيزياء', 'مذاكرة', null, 20).body).toContain('غائب');
    expect(messages.examResult('يزن', 'فيزياء', 'مذاكرة', 18, 20).body).toBe('يزن: 18 من 20 في مذاكرة');
  });
});
