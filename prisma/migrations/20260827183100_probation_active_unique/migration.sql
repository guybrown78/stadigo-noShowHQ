-- At most one unresolved probation cycle per staff member in a tenant
CREATE UNIQUE INDEX "StaffProbation_tenantId_staffId_active_key"
  ON "StaffProbation"("tenantId", "staffId")
  WHERE "completedAt" IS NULL;
