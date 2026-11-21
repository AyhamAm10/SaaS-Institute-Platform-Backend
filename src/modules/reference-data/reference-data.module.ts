import { Module } from '@nestjs/common';
import { BranchesModule } from '../branches/branches.module';
import { CitiesController } from './cities/cities.controller';
import { CitiesService } from './cities/cities.service';
import { CityRepository } from './cities/city.repository';
import { SchoolsController } from './schools/schools.controller';
import { SchoolsService } from './schools/schools.service';
import { SchoolRepository } from './schools/school.repository';
import { KnowWaysController } from './know-ways/know-ways.controller';
import { KnowWaysService } from './know-ways/know-ways.service';
import { KnowWayRepository } from './know-ways/know-way.repository';
import { ExamTypesController } from './exam-types/exam-types.controller';
import { ExamTypesService } from './exam-types/exam-types.service';
import { ExamTypeRepository } from './exam-types/exam-type.repository';
import { BusesController } from './buses/buses.controller';
import { BusesService } from './buses/buses.service';
import { BusRepository } from './buses/bus.repository';
import { StudentStatusesController } from './student-statuses/student-statuses.controller';
import { StudentStatusesService } from './student-statuses/student-statuses.service';
import { StudentStatusRepository } from './student-statuses/student-status.repository';
import { StudentStatusSystemRepository } from './student-statuses/student-status-system.repository';
import { NationalitiesController } from './nationalities/nationalities.controller';
import { NationalitiesService } from './nationalities/nationalities.service';
import { NationalityRepository } from './nationalities/nationality.repository';
import { ReligionsController } from './religions/religions.controller';
import { ReligionsService } from './religions/religions.service';
import { ReligionRepository } from './religions/religion.repository';
import { LanguagesController } from './languages/languages.controller';
import { LanguagesService } from './languages/languages.service';
import { LanguageRepository } from './languages/language.repository';
import { EnrollmentSituationsController } from './enrollment-situations/enrollment-situations.controller';
import { EnrollmentSituationsService } from './enrollment-situations/enrollment-situations.service';
import { EnrollmentSituationRepository } from './enrollment-situations/enrollment-situation.repository';
import { OfficialListsService } from './official-lists/official-lists.service';
import { OfficialListsSystemRepository } from './official-lists/official-lists-system.repository';

/**
 * Reference data (lookup tables) of an institute: cities, schools, referral
 * sources, exam types, buses, student statuses and the official lists
 * (nationalities, religions, languages, enrollment situations). Shared rules live in
 * `lookup/` (LookupRepository / LookupService). Services are exported so other
 * modules validate references through them (role.md §10).
 */
@Module({
  imports: [BranchesModule],
  controllers: [
    CitiesController,
    SchoolsController,
    KnowWaysController,
    ExamTypesController,
    BusesController,
    StudentStatusesController,
    NationalitiesController,
    ReligionsController,
    LanguagesController,
    EnrollmentSituationsController,
  ],
  providers: [
    CityRepository,
    CitiesService,
    SchoolRepository,
    SchoolsService,
    KnowWayRepository,
    KnowWaysService,
    ExamTypeRepository,
    ExamTypesService,
    BusRepository,
    BusesService,
    StudentStatusRepository,
    StudentStatusSystemRepository,
    StudentStatusesService,
    NationalityRepository,
    NationalitiesService,
    ReligionRepository,
    ReligionsService,
    LanguageRepository,
    LanguagesService,
    EnrollmentSituationRepository,
    EnrollmentSituationsService,
    OfficialListsSystemRepository,
    OfficialListsService,
  ],
  exports: [
    CitiesService,
    SchoolsService,
    KnowWaysService,
    ExamTypesService,
    BusesService,
    StudentStatusesService,
    NationalitiesService,
    ReligionsService,
    LanguagesService,
    EnrollmentSituationsService,
    OfficialListsService,
  ],
})
export class ReferenceDataModule {}
