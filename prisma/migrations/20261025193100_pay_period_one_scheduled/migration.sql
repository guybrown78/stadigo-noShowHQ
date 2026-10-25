CREATE UNIQUE INDEX "PayPeriod_one_scheduled_per_tenant" ON "PayPeriod"("tenantId") WHERE "status" = 'SCHEDULED';
