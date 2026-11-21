/**
 * [2026-11-21] Official student data: settings lists, identity fields, parents' details, the yearly
 * enrollment data (situation, exam candidacy) and the lists built on them.
 * Section A: يزن (male, مسلم, الإنكليزية), سلمى (female, مسيحي, الفرنسية), عمر (male, مسلم, الفرنسية),
 *            ليلى (female, no religion, الإنكليزية). يزن and سلمى and ليلى are exam candidates.
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { startApp, type ScenarioApp } from '../support/app';
import { InstituteFixture } from '../support/builders';
import { realClock, setClock } from '../support/clock';

type Named = { id: number; name: string };
type Doc = { blocks: { type: string; title?: string; rows?: Record<string, unknown>[]; items?: { label: string; value: unknown; caption?: string }[] }[] };

describe('[2026-11-21] official student data', () => {
  let s: ScenarioApp;
  let inst: InstituteFixture;
  let section: number;
  const list: Record<string, Record<string, number>> = {};
  const st: Record<string, number> = {};
  const enr: Record<string, number> = {};

  const lookup = async (path: string) => Object.fromEntries(((await inst.admin.get(`/${path}?limit=100`)).data as Named[]).map((x) => [x.name, x.id]));
  const titles = (d: Doc) => d.blocks.filter((b) => b.type === 'table').map((b) => b.title);

  beforeAll(async () => {
    setClock('2026-09-01 09:00');
    s = await startApp();
    inst = await InstituteFixture.create(s, 'البيانات الرسمية');
    section = await inst.section({ name: 'التاسع - أ', academicBranchId: await inst.anyAcademicBranch() });
    for (const p of ['nationalities', 'religions', 'languages', 'enrollment-situations']) list[p] = await lookup(p);
  });

  afterAll(async () => {
    realClock();
    await s?.close();
  });

  it('[OFF-01] a new institute starts with the default lists (editable in Settings)', () => {
    expect(Object.keys(list.nationalities)).toEqual(['عربي سوري']);
    expect(Object.keys(list.religions).sort()).toEqual(['مسلم', 'مسيحي'].sort());
    expect(Object.keys(list.languages).sort()).toEqual(['الإنكليزية', 'الفرنسية'].sort());
    expect(Object.keys(list['enrollment-situations']).sort()).toEqual(['راسب', 'طالب مركز', 'مستجد', 'مفصول', 'ناجح ويعيد'].sort());
  });

  it('[OFF-02] identity fields are saved, trimmed, shown with their names, and cleared by an empty text', async () => {
    const syrian = list.nationalities['عربي سوري'];
    const row = await inst.admin.post('/students', {
      fullName: 'يزن الخطيب', birthDate: '2011-03-14', gender: 'MALE', branchId: inst.branchId, sectionId: section,
      nationalityId: syrian, religionId: list.religions['مسلم'], languageId: list.languages['الإنكليزية'],
      nationalId: ' 01020304050 ', birthPlace: 'دمشق', civilRegistry: 'المزة 123', foreignName: 'Yazan Al-Khatib', grandfatherName: 'أحمد', address: 'دمشق - المزة',
      newFamily: { familyName: 'الخطيب', fatherName: 'محمد', motherName: 'هدى', fatherJob: ' مهندس ', motherJob: 'مدرّسة', fatherPhone: '0933111222', motherPhone: '0944333444' },
    });
    st.yazan = row.id;
    const detail = await inst.admin.get(`/students/${st.yazan}`);
    expect([detail.nationality.name, detail.religion.name, detail.language.name, detail.nationalId, detail.civilRegistry, detail.foreignName])
      .toEqual(['عربي سوري', 'مسلم', 'الإنكليزية', '01020304050', 'المزة 123', 'Yazan Al-Khatib']);
    expect([detail.family.fatherJob, detail.family.motherJob, detail.family.fatherPhone, detail.family.motherPhone]).toEqual(['مهندس', 'مدرّسة', '0933111222', '0944333444']);
    await inst.admin.patch(`/students/${st.yazan}`, { birthPlace: '  ', foreignName: null });
    const after = await s.prisma.student.findUniqueOrThrow({ where: { id: st.yazan } });
    expect([after.birthPlace, after.foreignName, after.nationalId]).toEqual([null, null, '01020304050']);
    await inst.admin.patch(`/families/${detail.family.id}`, { fatherJob: '' });
    expect((await s.prisma.family.findUniqueOrThrow({ where: { id: detail.family.id } })).fatherJob).toBeNull();
  });

  it('[OFF-03] a list entry of another institute is refused (404) and nothing is saved', async () => {
    const other = await InstituteFixture.create(s, 'بيانات أخرى');
    const foreignLanguage = ((await other.admin.get('/languages?limit=10')).data as Named[])[0].id;
    await inst.admin.fails('patch', `/students/${st.yazan}`, 404, { languageId: foreignLanguage });
    expect((await s.prisma.student.findUniqueOrThrow({ where: { id: st.yazan } })).languageId).toBe(list.languages['الإنكليزية']);
  });

  it('[OFF-04] the yearly data: a situation; a new candidate takes his foreign language as exam language', async () => {
    const add = async (key: string, fullName: string, gender: 'MALE' | 'FEMALE', religion: string | null, language: string) => {
      st[key] = (await inst.student({ fullName, gender, sectionId: section, newFamily: { familyName: `عائلة ${key}` } })).id;
      await inst.admin.patch(`/students/${st[key]}`, { religionId: religion ? list.religions[religion] : null, languageId: list.languages[language] });
    };
    await add('salma', 'سلمى الحلبي', 'FEMALE', 'مسيحي', 'الفرنسية');
    await add('omar', 'عمر العمر', 'MALE', 'مسلم', 'الفرنسية');
    await add('layla', 'ليلى الشامي', 'FEMALE', null, 'الإنكليزية');
    for (const k of ['yazan', 'salma', 'omar', 'layla']) enr[k] = await inst.enrollmentOf(st[k]);

    const item = await inst.admin.patch(`/enrollments/${enr.yazan}/details`, {
      situationId: list['enrollment-situations']['ناجح ويعيد'], isExamCandidate: true, candidateNumber: ' 1024 ',
      previousSchool: 'مدرسة الأمل', certificateName: 'التعليم الأساسي', certificateDate: '2026-07-01', certificateGrade: '2650',
    });
    expect(item.details).toMatchObject({
      situation: { name: 'ناجح ويعيد' }, isExamCandidate: true, examLanguage: { name: 'الإنكليزية' }, candidateNumber: '1024',
      previousSchool: 'مدرسة الأمل', certificate: { name: 'التعليم الأساسي', date: '2026-07-01', grade: '2650' },
    });
    await inst.admin.patch(`/enrollments/${enr.salma}/details`, { situationId: list['enrollment-situations']['مستجد'], isExamCandidate: true, candidateNumber: '1025' });
    await inst.admin.patch(`/enrollments/${enr.layla}/details`, { situationId: list['enrollment-situations']['مستجد'], isExamCandidate: true, examLanguageId: list.languages['الفرنسية'], candidateNumber: '1026' });
    await inst.admin.patch(`/enrollments/${enr.omar}/details`, { situationId: list['enrollment-situations']['راسب'] });
    // the roster carries the same data
    const roster: { student: { id: number }; details: { situation: Named | null } }[] = await inst.admin.get(`/sections/${section}/students`);
    expect(Object.fromEntries(roster.map((r) => [r.student.id, r.details.situation?.name]))).toEqual({
      [st.yazan]: 'ناجح ويعيد', [st.salma]: 'مستجد', [st.omar]: 'راسب', [st.layla]: 'مستجد',
    });
  });

  it('[OFF-05] a situation in use cannot be deleted from Settings', async () => {
    await inst.admin.fails('delete', `/enrollment-situations/${list['enrollment-situations']['راسب']}`, 400);
    await inst.admin.del(`/enrollment-situations/${list['enrollment-situations']['مفصول']}`);
  });

  it('[OFF-06] the students list filters by religion, language, gender, situation and candidacy', async () => {
    const names = async (q: string) => ((await inst.admin.get(`/students?limit=50&${q}`)).data as { fullName: string }[]).map((x) => x.fullName).sort();
    expect(await names(`religionId=${list.religions['مسلم']}`)).toEqual(['عمر العمر', 'يزن الخطيب'].sort());
    expect(await names(`languageId=${list.languages['الفرنسية']}`)).toEqual(['سلمى الحلبي', 'عمر العمر'].sort());
    expect(await names('gender=FEMALE')).toEqual(['سلمى الحلبي', 'ليلى الشامي'].sort());
    expect(await names(`situationId=${list['enrollment-situations']['مستجد']}`)).toEqual(['سلمى الحلبي', 'ليلى الشامي'].sort());
    expect(await names('examCandidate=true')).toEqual(['سلمى الحلبي', 'ليلى الشامي', 'يزن الخطيب'].sort());
    expect(await names('examCandidate=false')).toEqual(['عمر العمر']);
  });

  it('[OFF-07] the students report grouped by religion: one table per value, the "not set" group last, a bar of sizes', async () => {
    const d: Doc = await inst.admin.get('/reports/students-directory?groupBy=religion');
    expect(titles(d)).toEqual(['الديانة: مسلم (2)', 'الديانة: مسيحي (1)', 'الديانة: غير محدد (1)']);
    const bars = d.blocks.find((b) => b.type === 'bars')!.items!.map((i) => [i.label, i.caption]);
    expect(bars).toEqual([['مسلم', '2'], ['مسيحي', '1'], ['غير محدد', '1']]);
    // filter and group together: the girls by situation
    const girls: Doc = await inst.admin.get('/reports/students-directory?gender=FEMALE&groupBy=situation');
    expect(titles(girls)).toEqual(['وضع الطالب: مستجد (2)']);
    const plain: Doc = await inst.admin.get(`/reports/students-directory?languageId=${list.languages['الإنكليزية']}`);
    expect(plain.blocks.filter((b) => b.type === 'table')[0].rows!.map((r) => [r.student, r.situation])).toEqual(
      expect.arrayContaining([['يزن الخطيب', 'ناجح ويعيد'], ['ليلى الشامي', 'مستجد']]),
    );
  });

  it('[OFF-08] exam candidates: by EXAM language then gender, with the candidate number; the language filter is the exam language', async () => {
    const d: Doc = await inst.admin.get('/reports/exam-candidates');
    expect(titles(d)).toEqual(['اللغة الإنكليزية - ذكر (1)', 'اللغة الفرنسية - أنثى (2)']);
    const rows = d.blocks.filter((b) => b.type === 'table').flatMap((b) => b.rows!.map((r) => [r.number, r.student, r.father]));
    expect(rows).toEqual([['1024', 'يزن الخطيب', 'محمد'], ['1025', 'سلمى الحلبي', '—'], ['1026', 'ليلى الشامي', '—']]);
    // ليلى studies English but sits the exam in French: she is on the French list only
    const english: Doc = await inst.admin.get(`/reports/exam-candidates?languageId=${list.languages['الإنكليزية']}`);
    expect(titles(english)).toEqual(['اللغة الإنكليزية - ذكر (1)']);
  });
});
