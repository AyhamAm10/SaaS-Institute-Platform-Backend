import { Permission } from '../../common/types/permissions';

/**
 * Report catalog (D3): every report is defined ONCE here. The dashboard
 * reads `GET /reports/catalog` (filtered by the caller's permissions) to
 * build the reports center, the parameter forms and the contextual menus.
 */

export type ReportCategory = 'student' | 'finance' | 'attendance' | 'academic' | 'sheets' | 'admin';

/** Parameter kinds the dashboard knows how to render. */
export type ReportParamKind =
  | 'student'
  | 'section'
  | 'exam'
  | 'teacher'
  | 'date'
  | 'from'
  | 'to'
  | 'currency'
  | 'paymentMethod'
  | 'minCount'
  | 'days';

export interface ReportParam {
  kind: ReportParamKind;
  required: boolean;
}

export interface ReportDefinition {
  key: string;
  category: ReportCategory;
  title: string;
  description: string;
  permission: Permission;
  params: ReportParam[];
  /** Carries a document number + QR verification. */
  verifiable?: boolean;
}

const req = (kind: ReportParamKind): ReportParam => ({ kind, required: true });
const opt = (kind: ReportParamKind): ReportParam => ({ kind, required: false });
const PERIOD = [opt('from'), opt('to')];

export const REPORT_CATALOG: readonly ReportDefinition[] = [
  // ── Student ────────────────────────────────────────────────────────────
  {
    key: 'student-statement',
    category: 'student',
    title: 'كشف حساب الطالب',
    description: 'العقود والأقساط والدفعات والرصيد لكل عملة',
    permission: 'fees.view',
    params: [req('student')],
    verifiable: true,
  },
  {
    key: 'student-transcript',
    category: 'student',
    title: 'كشف علامات الطالب',
    description: 'علامات المذاكرات ومعدل كل مادة خلال فترة',
    permission: 'exams.view',
    params: [req('student'), ...PERIOD],
    verifiable: true,
  },
  {
    key: 'student-attendance',
    category: 'student',
    title: 'سجل حضور الطالب',
    description: 'الحضور والتأخر والغياب يوماً بيوم مع النسبة',
    permission: 'attendance.view',
    params: [req('student'), ...PERIOD],
  },
  {
    key: 'student-card',
    category: 'student',
    title: 'بطاقة الطالب الشاملة',
    description: 'البيانات الشخصية والعائلة والتسجيلات في صفحة واحدة',
    permission: 'students.view',
    params: [req('student')],
  },
  // ── Finance ────────────────────────────────────────────────────────────
  {
    key: 'daily-cashbox',
    category: 'finance',
    title: 'الصندوق اليومي',
    description: 'دفعات اليوم حسب العملة وطريقة الدفع والموظف',
    permission: 'fees.view',
    params: [opt('date')],
  },
  {
    key: 'payments-register',
    category: 'finance',
    title: 'سجل الدفعات',
    description: 'كل الإيصالات خلال فترة مع المجاميع',
    permission: 'fees.view',
    params: [...PERIOD, opt('currency'), opt('paymentMethod')],
  },
  {
    key: 'overdue-aging',
    category: 'finance',
    title: 'الأقساط المتأخرة حسب المدة',
    description: 'المتأخرات موزّعة على 30 / 60 / 90 يوم مع هاتف ولي الأمر',
    permission: 'fees.view',
    params: [opt('section')],
  },
  {
    key: 'upcoming-dues',
    category: 'finance',
    title: 'المستحقات القادمة',
    description: 'الأقساط المستحقة خلال فترة قادمة لكل عملة',
    permission: 'fees.view',
    params: [...PERIOD],
  },
  {
    key: 'monthly-collection',
    category: 'finance',
    title: 'التحصيل الشهري',
    description: 'المستحق والمحصّل لكل شهر من السنة الدراسية',
    permission: 'fees.view',
    params: [],
  },
  {
    key: 'section-finance',
    category: 'finance',
    title: 'الوضع المالي للشعبة',
    description: 'رصيد كل طالب في الشعبة: الإجمالي والمدفوع والمتبقي والمتأخر',
    permission: 'fees.view',
    params: [req('section')],
  },
  {
    key: 'discounts',
    category: 'finance',
    title: 'الحسومات',
    description: 'العقود التي عليها حسم مع السبب ونسبة الحسم',
    permission: 'fees.view',
    params: [opt('section')],
  },
  {
    key: 'cancelled-payments',
    category: 'finance',
    title: 'الدفعات الملغاة',
    description: 'الإيصالات الملغاة خلال فترة مع السبب (تقرير رقابي)',
    permission: 'fees.view',
    params: [...PERIOD],
  },
  {
    key: 'students-without-contract',
    category: 'finance',
    title: 'طلاب بدون عقد مالي',
    description: 'تسجيلات فعالة في السنة لم يُنشأ لها عقد',
    permission: 'fees.view',
    params: [opt('section')],
  },
  // ── Attendance ─────────────────────────────────────────────────────────
  {
    key: 'daily-attendance',
    category: 'attendance',
    title: 'الحضور اليومي',
    description: 'الحضور لكل شعبة في يوم، مع قائمة الغائبين',
    permission: 'attendance.view',
    params: [opt('date')],
  },
  {
    key: 'section-attendance',
    category: 'attendance',
    title: 'حضور الشعبة',
    description: 'عدد أيام الحضور والتأخر والغياب ونسبة كل طالب',
    permission: 'attendance.view',
    params: [req('section'), ...PERIOD],
  },
  {
    key: 'frequent-absences',
    category: 'attendance',
    title: 'الغياب والتأخر المتكرر',
    description: 'الطلاب الذين تجاوز غيابهم أو تأخرهم حداً معيناً',
    permission: 'attendance.view',
    params: [...PERIOD, opt('minCount'), opt('section')],
  },
  // ── Academic ───────────────────────────────────────────────────────────
  {
    key: 'exam-results',
    category: 'academic',
    title: 'كشف علامات مذاكرة',
    description: 'العلامات مع الترتيب والإحصائيات وتوزيع النتائج',
    permission: 'exams.view',
    params: [req('exam')],
    verifiable: true,
  },
  {
    key: 'section-results',
    category: 'academic',
    title: 'نتائج الشعبة',
    description: 'معدل كل طالب في كل مادة مع المعدل العام والترتيب',
    permission: 'exams.view',
    params: [req('section'), ...PERIOD],
  },
  {
    key: 'subject-performance',
    category: 'academic',
    title: 'أداء المواد',
    description: 'متوسط ونسبة نجاح كل مادة في كل شعبة',
    permission: 'exams.view',
    params: [opt('section'), ...PERIOD],
  },
  {
    key: 'timetable',
    category: 'academic',
    title: 'برنامج الدوام',
    description: 'البرنامج الأسبوعي لشعبة أو لمدرّس',
    permission: 'academic.view',
    params: [opt('section'), opt('teacher')],
  },
  {
    key: 'teacher-load',
    category: 'academic',
    title: 'نصاب المدرّسين',
    description: 'عدد الحصص الأسبوعية لكل مدرّس مع الشعب والمواد',
    permission: 'academic.view',
    params: [],
  },
  // ── Sheets to print ────────────────────────────────────────────────────
  {
    key: 'section-roster',
    category: 'sheets',
    title: 'قائمة طلاب الشعبة',
    description: 'أسماء الطلاب مع أسماء وأرقام أولياء الأمور',
    permission: 'students.view',
    params: [req('section')],
  },
  {
    key: 'attendance-sheet',
    category: 'sheets',
    title: 'ورقة حضور للتوقيع',
    description: 'جدول فارغ لأيام الدوام لتعبئته داخل الصف',
    permission: 'attendance.view',
    params: [req('section'), opt('from'), opt('days')],
  },
  {
    key: 'mark-entry-sheet',
    category: 'sheets',
    title: 'ورقة رصد علامات',
    description: 'ورقة فارغة لرصد علامات مذاكرة يدوياً',
    permission: 'exams.view',
    params: [req('exam')],
  },
  // ── Administration ─────────────────────────────────────────────────────
  {
    key: 'enrollment-stats',
    category: 'admin',
    title: 'إحصائيات الطلاب',
    description: 'التوزيع حسب الشعبة والجنس والحالة والتسجيل الشهري',
    permission: 'students.view',
    params: [],
  },
  {
    key: 'staff-activity',
    category: 'admin',
    title: 'نشاط الموظفين',
    description: 'التعديلات والحذف حسب الموظف ونوع السجل',
    permission: 'staff.view',
    params: [...PERIOD],
  },
];

export function findReport(key: string): ReportDefinition | undefined {
  return REPORT_CATALOG.find((r) => r.key === key);
}
