CREATE TYPE "PayPeriodStatus" AS ENUM ('OPEN', 'CLOSED');

ALTER TYPE "AbsenceHistoryAction" ADD VALUE 'PERIOD_CHANGED';

ALTER TABLE "Tenant" DROP COLUMN "payPeriodStartDay";
ALTER TABLE "Tenant" ADD COLUMN "payPeriodSeq" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "PayPeriod" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "status" "PayPeriodStatus" NOT NULL,
    "openedById" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayPeriod_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PayPeriod_id_tenantId_key" ON "PayPeriod"("id", "tenantId");
CREATE UNIQUE INDEX "PayPeriod_tenantId_number_key" ON "PayPeriod"("tenantId", "number");
CREATE INDEX "PayPeriod_tenantId_status_idx" ON "PayPeriod"("tenantId", "status");
CREATE UNIQUE INDEX "PayPeriod_one_open_per_tenant" ON "PayPeriod"("tenantId") WHERE "status" = 'OPEN';

ALTER TABLE "PayPeriod" ADD CONSTRAINT "PayPeriod_ends_on_or_after_start" CHECK ("endsOn" >= "startsOn");

ALTER TABLE "PayPeriod" ADD CONSTRAINT "PayPeriod_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayPeriod" ADD CONSTRAINT "PayPeriod_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayPeriod" ADD CONSTRAINT "PayPeriod_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Absence" ADD COLUMN "payPeriodId" TEXT;
CREATE INDEX "Absence_tenantId_payPeriodId_idx" ON "Absence"("tenantId", "payPeriodId");
ALTER TABLE "Absence" ADD CONSTRAINT "Absence_payPeriodId_tenantId_fkey" FOREIGN KEY ("payPeriodId", "tenantId") REFERENCES "PayPeriod"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
