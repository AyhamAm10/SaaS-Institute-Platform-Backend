-- CreateTable
CREATE TABLE "student_notes" (
    "id" SERIAL NOT NULL,
    "institute_id" INTEGER NOT NULL,
    "student_id" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "visible_to_family" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" INTEGER,
    "updated_by_id" INTEGER,

    CONSTRAINT "student_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "student_notes_institute_id_student_id_created_at_idx" ON "student_notes"("institute_id", "student_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "student_notes_institute_id_id_key" ON "student_notes"("institute_id", "id");

-- AddForeignKey
ALTER TABLE "student_notes" ADD CONSTRAINT "student_notes_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_notes" ADD CONSTRAINT "student_notes_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_notes" ADD CONSTRAINT "student_notes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

