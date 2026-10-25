import { Inject, Injectable } from '@nestjs/common';
import { Subject } from '@prisma/client';
import { SubjectRepository } from './subject.repository';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';
import { SubjectQueryDto } from './dto/subject-query.dto';
import { Ensure } from '../../common/errors/ensure';
import { ErrorMessages } from '../../common/errors/error-messages';
import { PaginatedResult } from '../../common/pagination/paginated-result';

/**
 * Service managing Subject lifecycle, tenant isolation, and validation rules.
 */
@Injectable()
export class SubjectsService {
  constructor(
    @Inject(SubjectRepository)
    private readonly subjectRepository: SubjectRepository,
  ) {}

  /**
   * Create a new Subject scoped to the current institute.
   */
  async create(dto: CreateSubjectDto): Promise<Subject> {
    const trimmedName = dto.name.trim();

    Ensure.required(trimmedName, 'name');

    // Check name uniqueness within this institute
    const existingWithName =
      await this.subjectRepository.findByName(trimmedName);
    Ensure.custom(
      Boolean(existingWithName),
      ErrorMessages.get('subject_name_duplicate'),
      409,
    );

    return this.subjectRepository.create({
      name: trimmedName,
    });
  }

  /**
   * Update an existing Subject.
   */
  async update(id: number, dto: UpdateSubjectDto): Promise<Subject> {
    // 1. Verify existence and tenant ownership
    const existing = await this.subjectRepository.findById(id);
    if (!existing) {
      const raw = await this.subjectRepository.findRawById(id);
      Ensure.custom(raw !== null, ErrorMessages.get('subject_mismatch'), 400);
      Ensure.exists(null, 'Subject');
    }

    const updateData: Record<string, unknown> = {};

    if (dto.name !== undefined) {
      const trimmedName = dto.name.trim();
      Ensure.required(trimmedName, 'name');

      if (trimmedName !== existing!.name) {
        const nameDuplicate =
          await this.subjectRepository.findByName(trimmedName);
        Ensure.custom(
          Boolean(nameDuplicate),
          ErrorMessages.get('subject_name_duplicate'),
          409,
        );
        updateData['name'] = trimmedName;
      }
    }

    return this.subjectRepository.update(id, updateData);
  }

  /**
   * Delete a Subject after verifying it is not linked to any sections.
   */
  async delete(id: number): Promise<void> {
    const existing = await this.subjectRepository.findById(id);
    if (!existing) {
      const raw = await this.subjectRepository.findRawById(id);
      Ensure.custom(raw !== null, ErrorMessages.get('subject_mismatch'), 400);
      Ensure.exists(null, 'Subject');
    }

    // Check if subject is assigned to sections
    const linkedSectionsCount =
      await this.subjectRepository.countSectionSubjects(id);
    Ensure.custom(
      linkedSectionsCount > 0,
      ErrorMessages.get('subject_has_sections'),
      400,
    );

    await this.subjectRepository.delete(id);
  }

  /**
   * List all subjects for the current institute with pagination and search.
   */
  async findAll(query: SubjectQueryDto): Promise<PaginatedResult<Subject>> {
    return this.subjectRepository.findAllPaginated(query, query.search);
  }

  /**
   * Retrieve a single subject by ID.
   */
  async findById(id: number): Promise<Subject> {
    const subject = await this.subjectRepository.findById(id);
    if (!subject) {
      const raw = await this.subjectRepository.findRawById(id);
      Ensure.custom(raw !== null, ErrorMessages.get('subject_mismatch'), 400);
      Ensure.exists(null, 'Subject');
    }
    return subject!;
  }
}
