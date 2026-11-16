-- CreateEnum
CREATE TYPE "ClosureScope" AS ENUM ('INSTITUTE', 'BRANCH', 'SECTION');

-- CreateTable
CREATE TABLE "closures" (
    "id" SERIAL NOT NULL,
    "institute_id" INTEGER NOT NULL,
    "scope" "ClosureScope" NOT NULL,
    "branch_id" INTEGER,
    "from_date" DATE NOT NULL,
    "to_date" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" INTEGER,
    "updated_by_id" INTEGER,

    CONSTRAINT "closures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "closure_sections" (
    "closure_id" INTEGER NOT NULL,
    "section_id" INTEGER NOT NULL,
    "institute_id" INTEGER NOT NULL,

    CONSTRAINT "closure_sections_pkey" PRIMARY KEY ("closure_id","section_id")
);

-- CreateIndex
CREATE INDEX "closures_institute_id_from_date_to_date_idx" ON "closures"("institute_id", "from_date", "to_date");

-- CreateIndex
CREATE UNIQUE INDEX "closures_institute_id_id_key" ON "closures"("institute_id", "id");

-- CreateIndex
CREATE INDEX "closure_sections_institute_id_section_id_idx" ON "closure_sections"("institute_id", "section_id");

-- AddForeignKey
ALTER TABLE "closures" ADD CONSTRAINT "closures_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "closures" ADD CONSTRAINT "closures_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "closure_sections" ADD CONSTRAINT "closure_sections_closure_id_fkey" FOREIGN KEY ("closure_id") REFERENCES "closures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "closure_sections" ADD CONSTRAINT "closure_sections_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
