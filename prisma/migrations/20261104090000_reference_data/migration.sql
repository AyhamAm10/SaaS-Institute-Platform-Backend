-- CreateEnum
CREATE TYPE "StatusTone" AS ENUM ('SUCCESS', 'WARNING', 'DANGER', 'INFO', 'NEUTRAL', 'BRAND');

-- AlterTable
ALTER TABLE "exam_types" ADD COLUMN     "deleted_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "bus_id" INTEGER,
ADD COLUMN     "city_id" INTEGER,
ADD COLUMN     "know_way_id" INTEGER,
ADD COLUMN     "school_id" INTEGER,
ADD COLUMN     "status_id" INTEGER;

-- CreateTable
CREATE TABLE "cities" (
    "id" SERIAL NOT NULL,
    "institute_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "cities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schools" (
    "id" SERIAL NOT NULL,
    "institute_id" INTEGER NOT NULL,
    "city_id" INTEGER,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "schools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "know_ways" (
    "id" SERIAL NOT NULL,
    "institute_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "know_ways_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buses" (
    "id" SERIAL NOT NULL,
    "institute_id" INTEGER NOT NULL,
    "branch_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "plate_number" TEXT,
    "driver_name" TEXT,
    "driver_phone" TEXT,
    "capacity" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "buses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_statuses" (
    "id" SERIAL NOT NULL,
    "institute_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "tone" "StatusTone" NOT NULL DEFAULT 'NEUTRAL',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "student_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cities_institute_id_id_key" ON "cities"("institute_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "cities_institute_id_name_key" ON "cities"("institute_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "schools_institute_id_id_key" ON "schools"("institute_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "schools_institute_id_name_key" ON "schools"("institute_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "know_ways_institute_id_id_key" ON "know_ways"("institute_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "know_ways_institute_id_name_key" ON "know_ways"("institute_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "buses_institute_id_id_key" ON "buses"("institute_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "buses_institute_id_branch_id_name_key" ON "buses"("institute_id", "branch_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "student_statuses_institute_id_id_key" ON "student_statuses"("institute_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "student_statuses_institute_id_name_key" ON "student_statuses"("institute_id", "name");

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_bus_id_fkey" FOREIGN KEY ("bus_id") REFERENCES "buses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_know_way_id_fkey" FOREIGN KEY ("know_way_id") REFERENCES "know_ways"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "student_statuses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cities" ADD CONSTRAINT "cities_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schools" ADD CONSTRAINT "schools_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schools" ADD CONSTRAINT "schools_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "know_ways" ADD CONSTRAINT "know_ways_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buses" ADD CONSTRAINT "buses_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buses" ADD CONSTRAINT "buses_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_statuses" ADD CONSTRAINT "student_statuses_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: default student statuses for every existing institute
INSERT INTO "student_statuses" ("institute_id", "name", "tone", "is_default", "sort_order", "updated_at")
SELECT i."id", s."name", s."tone"::"StatusTone", s."is_default", s."sort_order", CURRENT_TIMESTAMP
FROM "institutes" i
CROSS JOIN (VALUES
  ('مستمر', 'SUCCESS', true, 1),
  ('مؤجل', 'WARNING', false, 2),
  ('منقطع', 'DANGER', false, 3)
) AS s("name", "tone", "is_default", "sort_order")
ON CONFLICT ("institute_id", "name") DO NOTHING;

-- Backfill: existing students get their institute's default status
UPDATE "students" st SET "status_id" = ss."id"
FROM "student_statuses" ss
WHERE st."status_id" IS NULL AND ss."institute_id" = st."institute_id" AND ss."is_default" = true;
