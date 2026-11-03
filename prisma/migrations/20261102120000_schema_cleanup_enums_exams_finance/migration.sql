-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "GuardianRelationship" AS ENUM ('FATHER', 'MOTHER', 'GUARDIAN', 'OTHER');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'TRANSFERRED', 'WITHDRAWN', 'COMPLETED');

-- CreateEnum
CREATE TYPE "EnrollmentSubjectStatus" AS ENUM ('ACTIVE', 'DROPPED');

-- CreateEnum
CREATE TYPE "LessonType" AS ENUM ('REGULAR', 'MAKEUP', 'EXTRA', 'EXAM');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');

-- CreateEnum
CREATE TYPE "ExamResultStatus" AS ENUM ('PENDING', 'PASSED', 'FAILED', 'ABSENT');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('SYP', 'USD');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InstallmentStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- DropForeignKey
ALTER TABLE "exams" DROP CONSTRAINT "exams_lesson_id_fkey";

-- DropForeignKey
ALTER TABLE "students" DROP CONSTRAINT "students_branch_id_fkey";

-- AlterTable
ALTER TABLE "exam_results" DROP COLUMN "status",
ADD COLUMN     "status" "ExamResultStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "exams" ADD COLUMN     "exam_date" DATE NOT NULL,
ADD COLUMN     "exam_type_id" INTEGER,
ADD COLUMN     "section_id" INTEGER NOT NULL,
ADD COLUMN     "subject_id" INTEGER NOT NULL,
ALTER COLUMN "lesson_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "family_users" DROP COLUMN "relationship",
ADD COLUMN     "relationship" "GuardianRelationship" NOT NULL;

-- AlterTable
ALTER TABLE "installments" ADD COLUMN     "paid_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2),
DROP COLUMN "status",
ADD COLUMN     "status" "InstallmentStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "lesson_attendance" ALTER COLUMN "status" TYPE "AttendanceStatus" USING (UPPER("status")::"AttendanceStatus");

-- AlterTable
ALTER TABLE "lessons" DROP COLUMN "lesson_type",
ADD COLUMN     "lesson_type" "LessonType" NOT NULL DEFAULT 'REGULAR';

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "academic_year_id" INTEGER NOT NULL,
ADD COLUMN     "branch_id" INTEGER NOT NULL,
ADD COLUMN     "cancel_reason" TEXT,
ADD COLUMN     "currency" "Currency" NOT NULL DEFAULT 'SYP',
ADD COLUMN     "exchange_rate" DECIMAL(18,4),
ADD COLUMN     "receipt_number" INTEGER NOT NULL,
ADD COLUMN     "status" "PaymentStatus" NOT NULL DEFAULT 'ACTIVE',
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2),
DROP COLUMN "payment_method",
ADD COLUMN     "payment_method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
ALTER COLUMN "note" DROP NOT NULL;

-- AlterTable
ALTER TABLE "sections" ALTER COLUMN "fee_amount" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
-- Preserve existing values (data conversion)
ALTER TABLE "student_enrollments" ALTER COLUMN "status" TYPE "EnrollmentStatus" USING (UPPER("status")::"EnrollmentStatus"),
ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "student_subscriptions" ADD COLUMN     "currency" "Currency" NOT NULL DEFAULT 'SYP',
ADD COLUMN     "discount_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "discount_reason" TEXT,
ADD COLUMN     "exchange_rate" DECIMAL(18,4),
ADD COLUMN     "first_payment_amount" DECIMAL(18,2),
ADD COLUMN     "gross_amount" DECIMAL(18,2) NOT NULL,
ALTER COLUMN "total_amount" SET DATA TYPE DECIMAL(18,2),
DROP COLUMN "status",
ADD COLUMN     "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
-- Backfill missing student branch: enrolled section branch, then the institute's first branch
UPDATE "students" s SET "branch_id" = sec."branch_id"
FROM "student_enrollments" e JOIN "sections" sec ON sec."id" = e."section_id"
WHERE s."branch_id" IS NULL AND e."student_id" = s."id";
UPDATE "students" s SET "branch_id" = (SELECT b."id" FROM "branches" b WHERE b."institute_id" = s."institute_id" ORDER BY b."id" LIMIT 1)
WHERE s."branch_id" IS NULL;

-- Normalize gender values (Arabic legacy values) and convert to enum
ALTER TABLE "students" ADD COLUMN     "user_id" INTEGER,
ALTER COLUMN "branch_id" SET NOT NULL,
ALTER COLUMN "gender" TYPE "Gender" USING (
  CASE WHEN "gender" IN ('ذكر', 'MALE', 'male') THEN 'MALE'
       WHEN "gender" IN ('أنثى', 'FEMALE', 'female') THEN 'FEMALE'
  END::"Gender");

-- CreateTable
CREATE TABLE "enrollment_subjects" (
    "id" SERIAL NOT NULL,
    "institute_id" INTEGER NOT NULL,
    "enrollment_id" INTEGER NOT NULL,
    "subject_id" INTEGER NOT NULL,
    "status" "EnrollmentSubjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enrollment_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_types" (
    "id" SERIAL NOT NULL,
    "institute_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_sequences" (
    "id" SERIAL NOT NULL,
    "institute_id" INTEGER NOT NULL,
    "branch_id" INTEGER NOT NULL,
    "academic_year_id" INTEGER NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receipt_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "enrollment_subjects_institute_id_id_key" ON "enrollment_subjects"("institute_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "enrollment_subjects_institute_id_enrollment_id_subject_id_key" ON "enrollment_subjects"("institute_id", "enrollment_id", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_types_institute_id_id_key" ON "exam_types"("institute_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_types_institute_id_name_key" ON "exam_types"("institute_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "receipt_sequences_institute_id_branch_id_academic_year_id_key" ON "receipt_sequences"("institute_id", "branch_id", "academic_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_results_institute_id_id_key" ON "exam_results"("institute_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_results_institute_id_exam_id_student_id_key" ON "exam_results"("institute_id", "exam_id", "student_id");

-- CreateIndex
CREATE INDEX "exams_institute_id_section_id_subject_id_idx" ON "exams"("institute_id", "section_id", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "exams_institute_id_id_key" ON "exams"("institute_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "installments_institute_id_id_key" ON "installments"("institute_id", "id");

-- CreateIndex
CREATE INDEX "lessons_institute_id_section_id_starts_at_idx" ON "lessons"("institute_id", "section_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_institute_id_id_key" ON "payments"("institute_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_institute_id_branch_id_academic_year_id_receipt_nu_key" ON "payments"("institute_id", "branch_id", "academic_year_id", "receipt_number");

-- CreateIndex
CREATE UNIQUE INDEX "students_user_id_key" ON "students"("user_id");

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_subjects" ADD CONSTRAINT "enrollment_subjects_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_subjects" ADD CONSTRAINT "enrollment_subjects_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "student_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_subjects" ADD CONSTRAINT "enrollment_subjects_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_types" ADD CONSTRAINT "exam_types_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_exam_type_id_fkey" FOREIGN KEY ("exam_type_id") REFERENCES "exam_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_sequences" ADD CONSTRAINT "receipt_sequences_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_sequences" ADD CONSTRAINT "receipt_sequences_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_sequences" ADD CONSTRAINT "receipt_sequences_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
