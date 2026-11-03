-- CreateEnum
CREATE TYPE "FeatureKey" AS ENUM ('SMS', 'ONLINE_REGISTRATION', 'PARENTS_APP', 'STUDENTS_APP', 'ACCOUNTING');

-- CreateTable
CREATE TABLE "institute_features" (
    "id" SERIAL NOT NULL,
    "institute_id" INTEGER NOT NULL,
    "key" "FeatureKey" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "institute_features_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "institute_features_institute_id_id_key" ON "institute_features"("institute_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "institute_features_institute_id_key_key" ON "institute_features"("institute_id", "key");

-- AddForeignKey
ALTER TABLE "institute_features" ADD CONSTRAINT "institute_features_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
