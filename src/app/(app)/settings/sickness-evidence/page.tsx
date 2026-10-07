import { SicknessEvidenceBackfillForm } from "@/components/absence/sickness-evidence-backfill-form";
import { SicknessEvidenceSettingsForm } from "@/components/absence/sickness-evidence-settings-form";
import { Banner } from "@/components/ui/banner";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import {
  getSicknessEvidenceSettings,
  latestSicknessEvidenceEvaluationRun,
  previewSicknessEvidenceBackfill,
} from "@/lib/absence/evidence-settings";
import { sicknessEpisodeStateLabel } from "@/lib/absence/sickness";
import { formatLocalDateDisplay } from "@/lib/events/dates";
import type { SicknessEpisodeState } from "@/lib/absence/catalog";

export const metadata = { title: "Sickness evidence settings" };

export default async function SicknessEvidenceSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ updated?: string; backfill?: string }>;
}) {
  const user = await requireTenant();
  const flash = await searchParams;
  const settings = await getSicknessEvidenceSettings(prisma, user.tenantId);
  const preview = await previewSicknessEvidenceBackfill(prisma, user.tenantId);
  const lastRun = await latestSicknessEvidenceEvaluationRun(prisma, user.tenantId);

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { href: "/settings", label: "Settings" },
          { label: "Sickness evidence" },
        ]}
        title="Sickness evidence"
        description="Fit note day and chase timing."
      />

      {flash.updated === "1" ? (
        <Banner tone="success" className="mt-6">
          Settings saved. Existing episodes keep their dates.
        </Banner>
      ) : null}
      {flash.backfill === "1" ? (
        <Banner tone="success" className="mt-6">
          Applied to existing episodes.
        </Banner>
      ) : null}

      <Card className="mt-8 shadow-none">
        <CardBody className="p-6">
          <p className="text-sm text-slate-600">
            Current fit note day:{" "}
            <span className="font-medium text-slate-900">
              {settings.requiredFromDay}
            </span>
            . Current chase days:{" "}
            <span className="font-medium text-slate-900">
              {settings.chaseAfterDays}
            </span>
            .
          </p>
          {settings.updatedAt ? (
            <p className="mt-1 text-sm text-slate-500">
              Last changed {settings.updatedAt.toLocaleString("en-GB")}
              {settings.updatedBy
                ? ` by ${settings.updatedBy.firstName} ${settings.updatedBy.lastName}`
                : ""}
              .
            </p>
          ) : null}
          {lastRun ? (
            <p className="mt-1 text-sm text-slate-500">
              Last check {lastRun.startedAt.toLocaleString("en-GB")}
              {lastRun.status === "SUCCESS" ? "" : ", failed"}.{" "}
              {lastRun.episodesScanned} episodes, {lastRun.tasksCreated} tasks
              created.
            </p>
          ) : null}
          <SicknessEvidenceSettingsForm
            requiredFromDay={settings.requiredFromDay}
            chaseAfterDays={settings.chaseAfterDays}
          />
        </CardBody>
      </Card>

      <Card className="mt-6 shadow-none">
        <CardBody className="p-6">
          <h2 className="text-base font-semibold text-slate-900">
            Existing episodes
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Apply the current counts to episodes that do not have them yet.
          </p>
          <dl className="mt-4 grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Episodes to update</dt>
              <dd className="font-medium text-slate-900">{preview.episodes}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Fit note due</dt>
              <dd className="font-medium text-slate-900">
                {preview.requirementEligible}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Request tasks to create</dt>
              <dd className="font-medium text-slate-900">{preview.requestTasks}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Chase tasks to create</dt>
              <dd className="font-medium text-slate-900">{preview.chases}</dd>
            </div>
          </dl>
          {preview.records.length > 0 ? (
            <ul className="mt-4 divide-y divide-slate-100 text-sm text-slate-700">
              {preview.records.map((record) => (
                <li key={record.absenceId} className="py-2">
                  {record.staffFirstName} {record.staffLastName} · day 1{" "}
                  {formatLocalDateDisplay(new Date(`${record.dayOne}T00:00:00.000Z`))}{" "}
                  · requirement{" "}
                  {formatLocalDateDisplay(
                    new Date(`${record.requirementDate}T00:00:00.000Z`),
                  )}{" "}
                  · {sicknessEpisodeStateLabel(record.episodeState as SicknessEpisodeState)}
                  {record.wouldCreateRequest ? " · request task" : ""}
                  {record.outstandingRequests > 0
                    ? ` · ${record.outstandingRequests} chase`
                    : ""}
                </li>
              ))}
            </ul>
          ) : null}
          {preview.truncated ? (
            <p className="mt-2 text-sm text-slate-500">
              Showing the first 50. Apply uses the full count.
            </p>
          ) : null}
          <SicknessEvidenceBackfillForm episodes={preview.episodes} />
        </CardBody>
      </Card>
    </div>
  );
}
