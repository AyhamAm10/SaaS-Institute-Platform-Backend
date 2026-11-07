
-- AlterTable
ALTER TABLE "student_enrollments" ADD COLUMN     "status_changed_at" TIMESTAMP(3),
ADD COLUMN     "status_reason" TEXT;

-- CreateIndex
CREATE INDEX "student_enrollments_institute_id_section_id_idx" ON "student_enrollments"("institute_id", "section_id");

