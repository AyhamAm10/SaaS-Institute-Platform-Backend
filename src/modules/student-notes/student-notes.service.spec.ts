import { jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { StudentNotesService } from './student-notes.service';

const row = (over: Record<string, unknown> = {}) => ({
  id: 1,
  studentId: 4,
  body: 'ملاحظة',
  visibleToFamily: true,
  createdAt: new Date('2026-11-10T08:00:00Z'),
  updatedAt: new Date('2026-11-10T08:00:00Z'),
  createdBy: { fullName: 'الإدارة' },
  ...over,
});

describe('StudentNotesService', () => {
  let repository: Record<string, jest.Mock<any>>;
  let students: Record<string, jest.Mock<any>>;
  let service: StudentNotesService;

  beforeEach(() => {
    repository = {
      findByStudent: jest.fn<any>().mockResolvedValue([row()]),
      findWithAuthor: jest.fn<any>().mockResolvedValue(row()),
      findById: jest.fn<any>().mockResolvedValue(row()),
      create: jest.fn<any>().mockResolvedValue(row()),
      update: jest.fn<any>().mockResolvedValue(row()),
      delete: jest.fn<any>().mockResolvedValue(row()),
    };
    students = { findById: jest.fn<any>().mockResolvedValue({ id: 4 }) };
    service = new StudentNotesService(repository as never, students as never);
  });

  it('lists the notes of a student with their author', async () => {
    const notes = await service.findByStudent(4);
    expect(notes[0]).toMatchObject({ id: 1, body: 'ملاحظة', author: 'الإدارة', visibleToFamily: true });
  });

  it('answers 404 for an unknown student', async () => {
    students.findById.mockResolvedValue(null);
    await expect(service.findByStudent(99)).rejects.toThrow(NotFoundException);
    await expect(service.create(99, { body: 'x' })).rejects.toThrow(NotFoundException);
  });

  it('creates a note visible to the family by default', async () => {
    await service.create(4, { body: 'مرحباً' });
    expect(repository.create).toHaveBeenCalledWith({ studentId: 4, body: 'مرحباً', visibleToFamily: true });
  });

  it('can keep a note internal', async () => {
    await service.create(4, { body: 'داخلي', visibleToFamily: false });
    expect(repository.create).toHaveBeenCalledWith({ studentId: 4, body: 'داخلي', visibleToFamily: false });
  });

  it('asks the repository only for visible notes for the family', async () => {
    await service.findVisible(4);
    expect(repository.findByStudent).toHaveBeenCalledWith(4, true);
  });

  it('updates only the fields sent', async () => {
    await service.update(1, { visibleToFamily: false });
    expect(repository.update).toHaveBeenCalledWith(1, { visibleToFamily: false });
  });

  it('answers 404 when the note does not exist', async () => {
    repository.findById.mockResolvedValue(null);
    await expect(service.update(9, { body: 'x' })).rejects.toThrow(NotFoundException);
    await expect(service.remove(9)).rejects.toThrow(NotFoundException);
  });

  it('removes a note', async () => {
    await service.remove(1);
    expect(repository.delete).toHaveBeenCalledWith(1);
  });
});
