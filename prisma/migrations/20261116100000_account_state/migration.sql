ALTER TABLE "users" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true,
 ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;
