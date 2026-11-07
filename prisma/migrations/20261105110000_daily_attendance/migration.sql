-- CreateEnum
CREATE TYPE "AttendanceMethod" AS ENUM ('MANUAL', 'BULK');

-- AlterTable
ALTER TABLE "institute_schedule_configs" ADD COLUMN     "attendance_close_time" TEXT,
ADD COLUMN     "late_after_minutes" INTEGER NOT NULL DEFAULT 15;

-- CreateTable
CREATE TABLE "daily_attendance" (
    "id" SERIAL NOT NULL,
    "institute_id" INTEGER NOT NULL,
    "branch_id" INTEGER NOT NULL,
    "student_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "check_in_at" TIMESTAMP(3),
    "check_out_at" TIMESTAMP(3),
    "status" "AttendanceStatus" NOT NULL,
    "check_in_method" "AttendanceMethod",
    "check_out_method" "AttendanceMethod",
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" INTEGER,
    "updated_by_id" INTEGER,

    CONSTRAINT "daily_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "daily_attendance_institute_id_branch_id_date_idx" ON "daily_attendance"("institute_id", "branch_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_attendance_institute_id_student_id_date_key" ON "daily_attendance"("institute_id", "student_id", "date");

-- AddForeignKey
ALTER TABLE "daily_attendance" ADD CONSTRAINT "daily_attendance_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_attendance" ADD CONSTRAINT "daily_attendance_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_attendance" ADD CONSTRAINT "daily_attendance_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

