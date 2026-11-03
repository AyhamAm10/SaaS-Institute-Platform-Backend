-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE');

-- AlterTable
ALTER TABLE "enrollment_subjects" ADD COLUMN     "created_by_id" INTEGER,
ADD COLUMN     "updated_by_id" INTEGER;

-- AlterTable
ALTER TABLE "exam_results" ADD COLUMN     "created_by_id" INTEGER,
ADD COLUMN     "updated_by_id" INTEGER;

-- AlterTable
ALTER TABLE "exams" ADD COLUMN     "created_by_id" INTEGER,
ADD COLUMN     "updated_by_id" INTEGER;

-- AlterTable
ALTER TABLE "families" ADD COLUMN     "created_by_id" INTEGER,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "updated_by_id" INTEGER;

-- AlterTable
ALTER TABLE "installments" ADD COLUMN     "created_by_id" INTEGER,
ADD COLUMN     "updated_by_id" INTEGER;

-- AlterTable
ALTER TABLE "lesson_attendance" ADD COLUMN     "created_by_id" INTEGER,
ADD COLUMN     "updated_by_id" INTEGER;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "created_by_id" INTEGER,
ADD COLUMN     "updated_by_id" INTEGER;

-- AlterTable
ALTER TABLE "rooms" ADD COLUMN     "created_by_id" INTEGER,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "updated_by_id" INTEGER;

-- AlterTable
ALTER TABLE "sections" ADD COLUMN     "created_by_id" INTEGER,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "updated_by_id" INTEGER;

-- AlterTable
ALTER TABLE "student_enrollments" ADD COLUMN     "created_by_id" INTEGER,
ADD COLUMN     "updated_by_id" INTEGER;

-- AlterTable
ALTER TABLE "student_subscriptions" ADD COLUMN     "created_by_id" INTEGER,
ADD COLUMN     "updated_by_id" INTEGER;

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "created_by_id" INTEGER,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "updated_by_id" INTEGER;

-- AlterTable
ALTER TABLE "subjects" ADD COLUMN     "created_by_id" INTEGER,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "updated_by_id" INTEGER;

-- AlterTable
ALTER TABLE "teachers" ADD COLUMN     "created_by_id" INTEGER,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "updated_by_id" INTEGER;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "deleted_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "institute_id" INTEGER NOT NULL,
    "user_id" INTEGER,
    "entity" TEXT NOT NULL,
    "entity_id" INTEGER NOT NULL,
    "action" "AuditAction" NOT NULL,
    "before" JSONB,
    "changes" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_institute_id_entity_entity_id_idx" ON "audit_logs"("institute_id", "entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_institute_id_created_at_idx" ON "audit_logs"("institute_id", "created_at");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
