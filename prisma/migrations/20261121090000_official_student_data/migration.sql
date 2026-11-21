-- AlterTable
ALTER TABLE "families" ADD COLUMN     "father_job" TEXT,
ADD COLUMN     "father_phone" TEXT,
ADD COLUMN     "mother_job" TEXT,
ADD COLUMN     "mother_phone" TEXT;

-- AlterTable
ALTER TABLE "student_enrollments" ADD COLUMN     "candidate_number" TEXT,
ADD COLUMN     "certificate_date" DATE,
ADD COLUMN     "certificate_grade" TEXT,
ADD COLUMN     "certificate_name" TEXT,
ADD COLUMN     "certificate_number" TEXT,
ADD COLUMN     "certificate_source" TEXT,
ADD COLUMN     "exam_language_id" INTEGER,
ADD COLUMN     "is_exam_candidate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "previous_school" TEXT,
ADD COLUMN     "situation_id" INTEGER,
ADD COLUMN     "transferred_from" TEXT;

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "address" TEXT,
ADD COLUMN     "birth_place" TEXT,
ADD COLUMN     "civil_registry" TEXT,
ADD COLUMN     "foreign_name" TEXT,
ADD COLUMN     "grandfather_name" TEXT,
ADD COLUMN     "language_id" INTEGER,
ADD COLUMN     "national_id" TEXT,
ADD COLUMN     "nationality_id" INTEGER,
ADD COLUMN     "religion_id" INTEGER;

-- CreateTable
CREATE TABLE "nationalities" (
    "id" SERIAL NOT NULL,
    "institute_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "nationalities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "religions" (
    "id" SERIAL NOT NULL,
    "institute_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "religions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "languages" (
    "id" SERIAL NOT NULL,
    "institute_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "languages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollment_situations" (
    "id" SERIAL NOT NULL,
    "institute_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "enrollment_situations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "nationalities_institute_id_id_key" ON "nationalities"("institute_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "nationalities_institute_id_name_key" ON "nationalities"("institute_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "religions_institute_id_id_key" ON "religions"("institute_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "religions_institute_id_name_key" ON "religions"("institute_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "languages_institute_id_id_key" ON "languages"("institute_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "languages_institute_id_name_key" ON "languages"("institute_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "enrollment_situations_institute_id_id_key" ON "enrollment_situations"("institute_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "enrollment_situations_institute_id_name_key" ON "enrollment_situations"("institute_id", "name");

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_nationality_id_fkey" FOREIGN KEY ("nationality_id") REFERENCES "nationalities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_religion_id_fkey" FOREIGN KEY ("religion_id") REFERENCES "religions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "languages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_situation_id_fkey" FOREIGN KEY ("situation_id") REFERENCES "enrollment_situations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_exam_language_id_fkey" FOREIGN KEY ("exam_language_id") REFERENCES "languages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nationalities" ADD CONSTRAINT "nationalities_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "religions" ADD CONSTRAINT "religions_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "languages" ADD CONSTRAINT "languages_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_situations" ADD CONSTRAINT "enrollment_situations_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Defaults for the existing institutes (new institutes get them when created).
INSERT INTO "nationalities" ("institute_id", "name", "updated_at")
SELECT i.id, v.name, CURRENT_TIMESTAMP FROM "institutes" i CROSS JOIN (VALUES ('عربي سوري')) AS v(name)
ON CONFLICT ("institute_id", "name") DO NOTHING;

INSERT INTO "religions" ("institute_id", "name", "updated_at")
SELECT i.id, v.name, CURRENT_TIMESTAMP FROM "institutes" i CROSS JOIN (VALUES ('مسلم'), ('مسيحي')) AS v(name)
ON CONFLICT ("institute_id", "name") DO NOTHING;

INSERT INTO "languages" ("institute_id", "name", "updated_at")
SELECT i.id, v.name, CURRENT_TIMESTAMP FROM "institutes" i CROSS JOIN (VALUES ('الإنكليزية'), ('الفرنسية')) AS v(name)
ON CONFLICT ("institute_id", "name") DO NOTHING;

INSERT INTO "enrollment_situations" ("institute_id", "name", "updated_at")
SELECT i.id, v.name, CURRENT_TIMESTAMP FROM "institutes" i
CROSS JOIN (VALUES ('مستجد'), ('ناجح ويعيد'), ('راسب'), ('طالب مركز'), ('مفصول')) AS v(name)
ON CONFLICT ("institute_id", "name") DO NOTHING;
