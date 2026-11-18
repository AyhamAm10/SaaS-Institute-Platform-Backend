/**
 * Arabic wording of every notification (pure, no I/O). Dates are local
 * `YYYY-MM-DD` strings, times local `HH:mm`, amounts in major units.
 */

const CURRENCY: Record<string, string> = { SYP: 'ل.س', USD: '$' };

export function moneyText(amount: number, currency: string): string {
  const formatted = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(amount);
  return currency === 'USD' ? `${formatted} $` : `${formatted} ${CURRENCY[currency] ?? currency}`;
}

/** Minutes with the right Arabic noun form: دقيقة واحدة، دقيقتين، 5 دقائق، 15 دقيقة. */
export function minutesText(n: number): string {
  if (n === 1) return 'دقيقة واحدة';
  if (n === 2) return 'دقيقتين';
  return n >= 3 && n <= 10 ? `${n} دقائق` : `${n} دقيقة`;
}

/** `2026-11-17` -> `2026/11/17`. */
export const dateText = (date: string): string => date.slice(0, 10).replaceAll('-', '/');

const clip = (text: string, max = 140): string =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

/** The student as named in a message; `female` picks the verb / adjective form. */
export interface Person {
  name: string;
  female: boolean;
}
const g = (p: Person, male: string, female: string) => (p.female ? female : male);

export interface Message {
  title: string;
  body: string;
}

export const messages = {
  arrival: (p: Person, time: string): Message => ({
    title: `${g(p, 'وصل', 'وصلت')} ${p.name} إلى المعهد`,
    body: `سُجّل الحضور الساعة ${time}`,
  }),
  late: (p: Person, time: string): Message => ({
    title: `${p.name} ${g(p, 'متأخر', 'متأخرة')} اليوم`,
    body: `${g(p, 'وصل', 'وصلت')} إلى المعهد الساعة ${time}`,
  }),
  absent: (p: Person, date: string): Message => ({
    title: `${p.name} ${g(p, 'غائب', 'غائبة')} اليوم`,
    body: `لم يُسجَّل ${g(p, 'حضوره', 'حضورها')} يوم ${dateText(date)}. إن كان الغياب بعذر يرجى إبلاغ المعهد.`,
  }),
  earlyExit: (p: Person, time: string, reason: string | null): Message => ({
    title: `خروج مبكر: ${p.name}`,
    body: `${g(p, 'غادر', 'غادرت')} المعهد الساعة ${time}${reason ? ` - ${clip(reason, 100)}` : ''}`,
  }),
  excused: (p: Person, date: string, note: string | null): Message => ({
    title: `غياب بعذر: ${p.name}`,
    body: `سُجّل غياب بعذر يوم ${dateText(date)}${note ? ` - ${clip(note, 100)}` : ''}`,
  }),
  paymentReceived: (name: string, receipt: number, amount: string): Message => ({
    title: 'تم استلام دفعة',
    body: `إيصال رقم ${receipt}: ${amount} عن ${name}`,
  }),
  installmentDue: (name: string, amount: string, due: string): Message => ({
    title: 'قسط يستحق قريباً',
    body: `قسط ${name} بقيمة ${amount} يستحق في ${dateText(due)}`,
  }),
  installmentOverdue: (name: string, amount: string, due: string): Message => ({
    title: 'قسط متأخر',
    body: `قسط ${name} بقيمة ${amount} كان مستحقاً في ${dateText(due)}`,
  }),
  examScheduled: (name: string, subject: string, title: string, date: string): Message => ({
    title: `مذاكرة جديدة: ${subject}`,
    body: `${title} يوم ${dateText(date)} - ${name}`,
  }),
  examResult: (name: string, subject: string, title: string, mark: number | null, max: number): Message => ({
    title: `صدرت علامة ${subject}`,
    body: mark === null ? `${name}: غائب عن ${title}` : `${name}: ${mark} من ${max} في ${title}`,
  }),
  timetableChanged: (section: string): Message => ({
    title: 'تعديل في البرنامج الأسبوعي',
    body: `تم تعديل برنامج ${section}، اطّلع على البرنامج الجديد`,
  }),
  studentNote: (name: string, body: string): Message => ({
    title: 'ملاحظة من الإدارة',
    body: `${name}: ${clip(body)}`,
  }),
  closure: (reason: string, from: string, to: string): Message => ({
    title: `عطلة: ${clip(reason, 60)}`,
    body: from === to ? `يوم ${dateText(from)}` : `من ${dateText(from)} إلى ${dateText(to)}`,
  }),
  teacherAssigned: (subject: string, section: string): Message => ({
    title: 'إسناد جديد',
    body: `أُسندت إليك مادة ${subject} في ${section}`,
  }),
  teacherExamCreated: (title: string, section: string, date: string): Message => ({
    title: 'مذاكرة جديدة في مادتك',
    body: `${title} - ${section} يوم ${dateText(date)}`,
  }),
  teacherTimetableChanged: (): Message => ({
    title: 'تعديل في برنامجك',
    body: 'تغيّرت حصص في برنامجك الأسبوعي، اطّلع عليه',
  }),
  lessonSoon: (minutes: number, subject: string, section: string, room: string | null, start: string): Message => ({
    title: `حصتك القادمة بعد ${minutesText(minutes)}`,
    body: `${subject} - ${section}${room ? ` - ${room}` : ''}، الساعة ${start}`,
  }),
  marksReminder: (title: string, section: string, date: string): Message => ({
    title: 'علامات بانتظار الإدخال',
    body: `${title} - ${section} (${dateText(date)})`,
  }),
};
