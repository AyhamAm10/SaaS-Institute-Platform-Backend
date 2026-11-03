-- DropIndex
DROP INDEX "users_phone_key";

-- AlterTable
ALTER TABLE "institutes" ADD COLUMN     "code" TEXT;

-- Backfill: the super admin's institute is the platform institute, others get INS0001-style codes
UPDATE "institutes" i SET "code" = 'PLATFORM'
WHERE i."id" = (SELECT u."institute_id" FROM "users" u WHERE u."role" = 'SUPER_ADMIN' ORDER BY u."id" LIMIT 1);
UPDATE "institutes" SET "code" = 'INS' || LPAD("id"::text, 4, '0') WHERE "code" IS NULL;

ALTER TABLE "institutes" ALTER COLUMN "code" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "institutes_code_key" ON "institutes"("code");

-- CreateIndex
CREATE INDEX "users_phone_idx" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_institute_id_phone_key" ON "users"("institute_id", "phone");
