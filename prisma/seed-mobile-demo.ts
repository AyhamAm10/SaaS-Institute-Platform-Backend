import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

/**
 * DEV-ONLY demo data for the guardian / student apps (`/api/mobile`).
 * Run AFTER the main seed (`npm run prisma:seed`), which creates the ALNOOR
 * institute, its branch and the current academic year:
 *
 *   npm run seed:mobile-demo
 *
 * Idempotent: every row is found by a natural key first, so re-running
 * changes nothing. Never run it against a production database.
 *
 *   Guardian (FAMILY):  phone GUARDIAN_PHONE  - children: Ali and Sara
 *   Student (STUDENT):  phone STUDENT_PHONE   - Ali himself
 *   Password (both):    DEMO_PASSWORD
 *   Institute code:     ALNOOR, or SEED_INSTITUTE_CODE=<code> to use another dev institute
 *                       (needs a branch and a current academic year)
 */
const GUARDIAN_PHONE = '0933000001';
const STUDENT_PHONE = '0933000002';
const DEMO_PASSWORD = 'Demo12345!';
const INSTITUTE_CODE = process.env['SEED_INSTITUTE_CODE'] ?? 'ALNOOR';

if (process.env['NODE_ENV'] === 'production') {
  throw new Error('seed-mobile-demo is for development databases only');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL']! }),
});

const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
const shift = (iso: string, days: number): string => {
  const d = day(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

async function main(): Promise<void> {
  const institute = await prisma.institute.findUnique({ where: { code: INSTITUTE_CODE } });
  if (!institute) throw new Error('Institute ' + INSTITUTE_CODE + ' not found (run the main seed or set SEED_INSTITUTE_CODE)');
  const instituteId = institute.id;
  const hash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const branch = await prisma.branch.findFirstOrThrow({ where: { instituteId } });
  const year = await prisma.academicYear.findFirstOrThrow({
    where: { instituteId, isCurrent: true },
  });
  const academicBranch =
    (await prisma.academicBranch.findFirst({ where: { instituteId } })) ??
    (await prisma.academicBranch.create({ data: { instituteId, name: 'الصف التاسع' } }));

  // Schedule: Saturday-Thursday, 08:00-14:00
  await prisma.instituteScheduleConfig.upsert({
    where: { instituteId },
    update: {},
    create: {
      instituteId,
      workingDays: [6, 0, 1, 2, 3, 4],
      dayStartTime: '08:00',
      dayEndTime: '14:00',
      periodDurationMinutes: 45,
      breaks: [],
    },
  });

  // Section
  const sectionName = 'التاسع - أ (تجريبي)';
  const section =
    (await prisma.section.findFirst({
      where: { instituteId, branchId: branch.id, academicYearId: year.id, name: sectionName },
    })) ??
    (await prisma.section.create({
      data: {
        instituteId,
        branchId: branch.id,
        academicYearId: year.id,
        academicBranchId: academicBranch.id,
        name: sectionName,
        feeAmount: 1200000,
        feeCurrency: 'SYP',
      },
    }));

  // Teacher + subjects
  const teacherPhone = '0933000009';
  const teacherUser =
    (await prisma.user.findUnique({ where: { instituteId_phone: { instituteId, phone: teacherPhone } } })) ??
    (await prisma.user.create({
      data: { instituteId, fullName: 'المعلم أحمد (تجريبي)', phone: teacherPhone, passwordHash: hash, role: 'TEACHER' },
    }));
  const teacher =
    (await prisma.teacher.findUnique({ where: { userId: teacherUser.id } })) ??
    (await prisma.teacher.create({ data: { instituteId, userId: teacherUser.id } }));

  const subjects = [];
  for (const name of ['الرياضيات', 'اللغة العربية']) {
    const subject =
      (await prisma.subject.findFirst({ where: { instituteId, name } })) ??
      (await prisma.subject.create({ data: { instituteId, name } }));
    await prisma.sectionSubject.upsert({
      where: { instituteId_sectionId_subjectId: { instituteId, sectionId: section.id, subjectId: subject.id } },
      update: {},
      create: { instituteId, sectionId: section.id, subjectId: subject.id, teacherId: teacher.id },
    });
    subjects.push(subject);
  }

  // Timetable: two lessons on every working day
  const timetable = await prisma.timetable.upsert({
    where: { instituteId_academicYearId_sectionId: { instituteId, academicYearId: year.id, sectionId: section.id } },
    update: {},
    create: { instituteId, academicYearId: year.id, sectionId: section.id, name: `جدول ${sectionName}` },
  });
  if ((await prisma.timetableEntry.count({ where: { instituteId, timetableId: timetable.id } })) === 0) {
    for (const dayOfWeek of [6, 0, 1, 2, 3, 4]) {
      await prisma.timetableEntry.createMany({
        data: [
          { instituteId, timetableId: timetable.id, subjectId: subjects[0].id, teacherId: teacher.id, dayOfWeek, periodNumber: 1, startTime: '08:00', endTime: '08:45' },
          { instituteId, timetableId: timetable.id, subjectId: subjects[1].id, teacherId: teacher.id, dayOfWeek, periodNumber: 2, startTime: '08:55', endTime: '09:40' },
        ],
      });
    }
  }

  // Family, guardian account, students
  const familyName = 'عائلة الحداد (تجريبي)';
  const family =
    (await prisma.family.findFirst({ where: { instituteId, familyName } })) ??
    (await prisma.family.create({
      data: { instituteId, familyName, fatherName: 'سامر', motherName: 'ريم', phone: GUARDIAN_PHONE },
    }));
  const guardian =
    (await prisma.user.findUnique({ where: { instituteId_phone: { instituteId, phone: GUARDIAN_PHONE } } })) ??
    (await prisma.user.create({
      data: { instituteId, fullName: 'سامر الحداد', phone: GUARDIAN_PHONE, passwordHash: hash, role: 'FAMILY' },
    }));
  await prisma.familyUser.upsert({
    where: { instituteId_familyId_userId: { instituteId, familyId: family.id, userId: guardian.id } },
    update: {},
    create: { instituteId, familyId: family.id, userId: guardian.id, relationship: 'FATHER' },
  });
  const studentUser =
    (await prisma.user.findUnique({ where: { instituteId_phone: { instituteId, phone: STUDENT_PHONE } } })) ??
    (await prisma.user.create({
      data: { instituteId, fullName: 'علي الحداد', phone: STUDENT_PHONE, passwordHash: hash, role: 'STUDENT' },
    }));

  const kids = [
    { fullName: 'علي الحداد', gender: 'MALE' as const, userId: studentUser.id, currency: 'SYP' as const },
    { fullName: 'سارة الحداد', gender: 'FEMALE' as const, userId: null, currency: 'USD' as const },
  ];
  const today = new Date().toISOString().slice(0, 10);

  for (const kid of kids) {
    const student =
      (await prisma.student.findFirst({ where: { instituteId, familyId: family.id, fullName: kid.fullName } })) ??
      (await prisma.student.create({
        data: {
          instituteId, branchId: branch.id, familyId: family.id, userId: kid.userId,
          fullName: kid.fullName, gender: kid.gender, birthDate: day('2012-03-15'),
        },
      }));
    const enrollment = await prisma.studentEnrollment.upsert({
      where: { instituteId_studentId_academicYearId: { instituteId, studentId: student.id, academicYearId: year.id } },
      update: {},
      create: { instituteId, studentId: student.id, academicYearId: year.id, sectionId: section.id, enrolledAt: new Date() },
    });

    // Attendance: the last 20 working days (a few late / absent / excused)
    const statuses = ['PRESENT', 'PRESENT', 'LATE', 'PRESENT', 'ABSENT', 'PRESENT', 'EXCUSED'] as const;
    for (let i = 0, n = 0; i < 30 && n < 20; i++) {
      const date = shift(today, -i);
      if (![6, 0, 1, 2, 3, 4].includes(day(date).getUTCDay())) continue;
      const status = statuses[n % statuses.length];
      const present = status === 'PRESENT' || status === 'LATE';
      await prisma.dailyAttendance.upsert({
        where: { instituteId_studentId_date: { instituteId, studentId: student.id, date: day(date) } },
        update: {},
        create: {
          instituteId, branchId: branch.id, studentId: student.id, date: day(date), status,
          checkInAt: present ? new Date(`${date}T${status === 'LATE' ? '06:30' : '05:50'}:00Z`) : null,
          checkOutAt: present ? new Date(`${date}T11:00:00Z`) : null,
          note: status === 'EXCUSED' ? 'مراجعة طبيب' : null,
        },
      });
      n++;
    }

    // Exams and marks (two past exams per subject, one upcoming)
    for (const [index, subject] of subjects.entries()) {
      const plan = [
        { title: 'اختبار شهري', date: shift(today, -40), mark: 78 + index * 6 },
        { title: 'اختبار نصفي', date: shift(today, -10), mark: 64 + index * 12 },
        { title: 'اختبار قادم', date: shift(today, 9 + index * 3), mark: null },
      ];
      for (const e of plan) {
        const exam =
          (await prisma.exam.findFirst({ where: { instituteId, sectionId: section.id, subjectId: subject.id, title: e.title } })) ??
          (await prisma.exam.create({
            data: { instituteId, sectionId: section.id, subjectId: subject.id, title: e.title, examDate: day(e.date), maxMark: 100, passMark: 50 },
          }));
        if (e.mark !== null) {
          await prisma.examResult.upsert({
            where: { instituteId_examId_studentId: { instituteId, examId: exam.id, studentId: student.id } },
            update: {},
            create: { instituteId, examId: exam.id, studentId: student.id, mark: e.mark, status: e.mark >= 50 ? 'PASSED' : 'FAILED' },
          });
        }
      }
    }

    // Contract (3 installments), one payment
    if (!(await prisma.studentSubscription.findUnique({ where: { enrollmentId: enrollment.id } }))) {
      const syp = kid.currency === 'SYP';
      const total = syp ? 1200000 : 450;
      const part = total / 3;
      const contract = await prisma.studentSubscription.create({
        data: {
          instituteId, studentId: student.id, enrollmentId: enrollment.id, sectionId: section.id,
          academicYearId: year.id, currency: kid.currency, grossAmount: total, discountAmount: 0,
          totalAmount: total, numberOfInstallments: 3, startDate: day(shift(today, -45)),
        },
      });
      const installments = [];
      for (const [i, due] of [shift(today, -45), shift(today, -15), shift(today, 15)].entries()) {
        installments.push(
          await prisma.installment.create({
            data: {
              instituteId, subscriptionId: contract.id, installmentNumber: i + 1, amount: part,
              paidAmount: i === 0 ? part : 0, dueDate: day(due), status: i === 0 ? 'PAID' : i === 1 ? 'OVERDUE' : 'PENDING',
            },
          }),
        );
      }
      const sequence = await prisma.receiptSequence.upsert({
        where: { instituteId_branchId_academicYearId: { instituteId, branchId: branch.id, academicYearId: year.id } },
        update: { lastNumber: { increment: 1 } },
        create: { instituteId, branchId: branch.id, academicYearId: year.id, lastNumber: 1 },
      });
      const payment = await prisma.payment.create({
        data: {
          instituteId, branchId: branch.id, academicYearId: year.id, subscriptionId: contract.id,
          receiptNumber: sequence.lastNumber, amount: part, currency: kid.currency, appliedAmount: part,
          paidAt: new Date(`${shift(today, -44)}T08:00:00Z`),
        },
      });
      await prisma.paymentAllocation.create({
        data: { instituteId, paymentId: payment.id, installmentId: installments[0].id, amount: part },
      });
    }
  }

  console.log('Mobile demo data is ready (see the header of prisma/seed-mobile-demo.ts for the logins).');
}

main()
  .catch((e) => {
    console.error('seed-mobile-demo failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
