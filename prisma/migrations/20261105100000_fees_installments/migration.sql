-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_installment_id_fkey";

-- AlterTable
ALTER TABLE "payments" DROP COLUMN "installment_id",
ADD COLUMN     "applied_amount" DECIMAL(18,2) NOT NULL,
ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "subscription_id" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "sections" ADD COLUMN     "fee_currency" "Currency" NOT NULL DEFAULT 'SYP';

-- AlterTable
ALTER TABLE "student_subscriptions" ADD COLUMN     "enrollment_id" INTEGER NOT NULL;

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" SERIAL NOT NULL,
    "institute_id" INTEGER NOT NULL,
    "payment_id" INTEGER NOT NULL,
    "installment_id" INTEGER NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_allocations_institute_id_payment_id_installment_id_key" ON "payment_allocations"("institute_id", "payment_id", "installment_id");

-- CreateIndex
CREATE INDEX "installments_institute_id_due_date_idx" ON "installments"("institute_id", "due_date");

-- CreateIndex
CREATE INDEX "payments_institute_id_paid_at_idx" ON "payments"("institute_id", "paid_at");

-- CreateIndex
CREATE UNIQUE INDEX "student_subscriptions_enrollment_id_key" ON "student_subscriptions"("enrollment_id");

-- AddForeignKey
ALTER TABLE "student_subscriptions" ADD CONSTRAINT "student_subscriptions_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "student_enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "student_subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "installments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

