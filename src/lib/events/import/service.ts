import {
  createHash,
} from "node:crypto";
import {
  EventImportRowStatus,
  EventImportStatus,
  EventImportVenueOutcome,
  Prisma,
  type PrismaClient,
} from "@prisma/client";
import { EventAccessError } from "@/lib/events/errors";
import {
  IMPORT_EVENT_BATCH_SIZE,
  IMPORT_TRANSACTION_TIMEOUT_MS,
} from "@/lib/events/import/constants";
import { sanitiseImportFileName, validateImportFileBytes } from "@/lib/events/import/file";
import { parseImportFile } from "@/lib/events/import/parse";
import { getImportForTenant, importStatusPath } from "@/lib/events/import/queries";
import type { ImportRowNormalized } from "@/lib/events/import/types";
import {
  validateImportRows,
  type ExistingEventForImport,
  type ExistingVenueForImport,
} from "@/lib/events/import/validate";
import { listEventTypesForTenant } from "@/lib/events/queries";
import { eventInputSchema, type EventInput } from "@/lib/events/schema";
import { createEventsBatch } from "@/lib/events/service";
import { findOrCreateVenue } from "@/lib/events/venues";

type DbClient = PrismaClient;

export type ImportMutationResult =
  | { ok: true; importId: string; href: string; repeatWarning?: boolean }
  | { ok: false; error: string };

export async function createImportFromUpload(
  db: DbClient,
  params: {
    tenantId: string;
    userId: string;
    fileName: string;
    bytes: Uint8Array;
  },
): Promise<ImportMutationResult> {
  const fileError = validateImportFileBytes(params.fileName, params.bytes);
  if (fileError) {
    return { ok: false, error: fileError };
  }

  const parsed = await parseImportFile(params.fileName, params.bytes);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }

  const fileHash = createHash("sha256").update(params.bytes).digest("hex");
  const originalFileName = sanitiseImportFileName(params.fileName);

  const [types, existingVenues, existingEvents, repeat] = await Promise.all([
    listEventTypesForTenant(db, params.tenantId),
    db.venue.findMany({
      where: { tenantId: params.tenantId },
      select: {
        id: true,
        name: true,
        nameNormalized: true,
        addressLine1: true,
        townCity: true,
        postcode: true,
        active: true,
      },
    }),
    loadExistingEvents(db, params.tenantId),
    db.eventImport.findFirst({
      where: {
        tenantId: params.tenantId,
        fileHash,
        status: EventImportStatus.COMPLETED,
      },
      select: { id: true },
    }),
  ]);

  const result = validateImportRows(parsed.rows, {
    types,
    existingEvents,
    existingVenues: existingVenues as ExistingVenueForImport[],
  });

  if (result.validRows === 0 && result.invalidRows === 0) {
    return {
      ok: false,
      error:
        "The file has no event rows. Add events to the Events sheet and upload again.",
    };
  }

  const status = result.hasBlockingErrors
    ? EventImportStatus.VALIDATION_FAILED
    : EventImportStatus.AWAITING_VENUE_CONFIRMATION;

  const created = await db.eventImport.create({
    data: {
      tenantId: params.tenantId,
      uploadedById: params.userId,
      originalFileName,
      fileHash,
      totalRows: result.totalRows,
      validRows: result.validRows,
      invalidRows: result.invalidRows,
      ignoredRows: result.ignoredRows,
      matchedVenueCount: result.matchedVenueCount,
      newVenueCount: result.newVenueCount,
      duplicateEventCount: result.duplicateEventCount,
      status,
      rows: {
        create: result.rows.map((row) => ({
          tenantId: params.tenantId,
          sourceRowNumber: row.sourceRowNumber,
          raw: row.raw as unknown as Prisma.InputJsonValue,
          normalized: (row.normalized ??
            Prisma.JsonNull) as Prisma.InputJsonValue,
          fieldErrors:
            Object.keys(row.fieldErrors).length > 0
              ? (row.fieldErrors as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          eventTypeId: row.eventTypeId,
          eventSubtypeId: row.eventSubtypeId,
          venueKey: row.venueKey,
          status: row.status as EventImportRowStatus,
        })),
      },
      venues: {
        create: result.venues.map((venue) => ({
          tenantId: params.tenantId,
          nameNormalized: venue.nameNormalized,
          importedName: venue.importedName,
          addressLine1: venue.addressLine1,
          townCity: venue.townCity,
          postcode: venue.postcode,
          outcome: venue.outcome as EventImportVenueOutcome,
          matchedVenueId: venue.matchedVenueId,
          inactiveMatch: venue.inactiveMatch,
          eventRowCount: venue.eventRowCount,
        })),
      },
    },
    select: { id: true, status: true },
  });

  return {
    ok: true,
    importId: created.id,
    href: importStatusPath(created.status, created.id),
    repeatWarning: Boolean(repeat),
  };
}

export async function confirmImportVenues(
  db: DbClient,
  params: { tenantId: string; importId: string },
): Promise<ImportMutationResult> {
  const record = await getImportForTenant(db, params.tenantId, params.importId);

  if (
    record.status === EventImportStatus.AWAITING_EVENT_CONFIRMATION ||
    record.status === EventImportStatus.VENUES_CONFIRMED
  ) {
    return {
      ok: true,
      importId: record.id,
      href: `/events/import/${record.id}/confirm`,
    };
  }
  if (record.status === EventImportStatus.COMPLETED) {
    return {
      ok: true,
      importId: record.id,
      href: `/events/import/${record.id}/complete`,
    };
  }
  if (record.status !== EventImportStatus.AWAITING_VENUE_CONFIRMATION) {
    return {
      ok: false,
      error:
        "This import cannot confirm venues in its current state. Upload a corrected file if it still needs changes.",
    };
  }
  if (record.invalidRows > 0) {
    return {
      ok: false,
      error: "Fix every row that needs correction before confirming venues.",
    };
  }

  try {
    await db.$transaction(
      async (tx) => {
        await lockImport(tx, params.tenantId, params.importId);
        let createdCount = 0;
        for (const venue of record.venues) {
          if (venue.outcome === EventImportVenueOutcome.AMBIGUOUS) {
            throw new Error("Ambiguous venue mapping");
          }
          if (venue.outcome === EventImportVenueOutcome.MATCHED) {
            if (!venue.matchedVenueId) {
              throw new Error("Matched venue is missing");
            }
            const existing = await tx.venue.findFirst({
              where: { id: venue.matchedVenueId, tenantId: params.tenantId },
            });
            if (!existing) {
              throw new EventAccessError();
            }
            if (!existing.active) {
              await tx.venue.update({
                where: { id: existing.id },
                data: { active: true },
              });
            }
            continue;
          }

          const created = await findOrCreateVenue(tx, {
            tenantId: params.tenantId,
            input: {
              name: venue.importedName,
              addressLine1: venue.addressLine1,
              townCity: venue.townCity,
              postcode: venue.postcode,
            },
            enrichInactive: false,
          });
          if (!created.ok) {
            throw new Error(
              created.fieldErrors.name?.[0] ?? "Could not create venue",
            );
          }
          if (created.created) {
            createdCount += 1;
            await tx.eventImportVenue.update({
              where: { id: venue.id },
              data: { createdVenueId: created.venueId },
            });
          } else {
            await tx.eventImportVenue.update({
              where: { id: venue.id },
              data: {
                matchedVenueId: created.venueId,
                createdVenueId: null,
                outcome: EventImportVenueOutcome.MATCHED,
              },
            });
          }
        }

        await tx.eventImport.update({
          where: { id: record.id },
          data: {
            status: EventImportStatus.AWAITING_EVENT_CONFIRMATION,
            venueConfirmedAt: new Date(),
            createdVenueCount: createdCount,
          },
        });
      },
      { timeout: IMPORT_TRANSACTION_TIMEOUT_MS },
    );
  } catch (error) {
    if (error instanceof EventAccessError) {
      throw error;
    }
    return {
      ok: false,
      error:
        "Venues could not be confirmed. No events were created. Try confirming again, or upload a new file.",
    };
  }

  return {
    ok: true,
    importId: record.id,
    href: `/events/import/${record.id}/confirm`,
  };
}

export async function confirmImportEvents(
  db: DbClient,
  params: { tenantId: string; userId: string; importId: string },
): Promise<ImportMutationResult> {
  const record = await getImportForTenant(db, params.tenantId, params.importId);

  if (record.status === EventImportStatus.COMPLETED) {
    return {
      ok: true,
      importId: record.id,
      href: `/events/import/${record.id}/complete`,
    };
  }
  if (
    record.status !== EventImportStatus.AWAITING_EVENT_CONFIRMATION &&
    record.status !== EventImportStatus.VENUES_CONFIRMED &&
    record.status !== EventImportStatus.FAILED
  ) {
    return {
      ok: false,
      error: "Confirm venues before creating events.",
    };
  }
  if (record.status === EventImportStatus.FAILED && record.createdEventCount > 0) {
    return {
      ok: false,
      error: "This import already failed after creating data and cannot be retried safely.",
    };
  }

  try {
    await db.$transaction(
      async (tx) => {
        const locked = await lockImport(tx, params.tenantId, params.importId);
        if (locked.status === EventImportStatus.COMPLETED) {
          return;
        }
        if (
          locked.status !== EventImportStatus.AWAITING_EVENT_CONFIRMATION &&
          locked.status !== EventImportStatus.VENUES_CONFIRMED &&
          locked.status !== EventImportStatus.FAILED
        ) {
          throw new Error("Import is not ready to create events");
        }

        const venues = await tx.eventImportVenue.findMany({
          where: { importId: record.id, tenantId: params.tenantId },
        });
        const venueIdByKey = new Map<string, string>();
        for (const venue of venues) {
          const venueId = venue.createdVenueId ?? venue.matchedVenueId;
          if (!venueId) {
            throw new Error("A venue is missing after confirmation");
          }
          venueIdByKey.set(venue.nameNormalized, venueId);
        }

        const rows = await tx.eventImportRow.findMany({
          where: {
            importId: record.id,
            tenantId: params.tenantId,
            status: EventImportRowStatus.VALID,
          },
          orderBy: { sourceRowNumber: "asc" },
        });

        const items: { rowId: string; input: EventInput; venueId: string }[] = [];
        for (const row of rows) {
          const normalized = row.normalized as ImportRowNormalized | null;
          if (!normalized || !row.venueKey || !row.eventTypeId || !row.eventSubtypeId) {
            throw new Error("Import row is missing mapping data");
          }
          const venueId = venueIdByKey.get(row.venueKey);
          if (!venueId) {
            throw new Error("Import row is missing a confirmed venue");
          }
          const parsed = eventInputSchema.safeParse({
            name: normalized.name,
            reference: normalized.reference ?? "",
            eventTypeId: row.eventTypeId,
            eventSubtypeId: row.eventSubtypeId,
            venueId,
            newVenueName: "",
            newVenueAddressLine1: "",
            newVenueTownCity: "",
            newVenuePostcode: "",
            eventDate: normalized.eventDate,
            briefingTime: normalized.briefingTime ?? "",
            startTime: normalized.startTime ?? "",
            endTime: normalized.endTime ?? "",
            endsNextDay: normalized.overnight,
            staffRequired: normalized.staffRequired,
            warningFillRate: normalized.warningFillRate,
            criticalFillRate: normalized.criticalFillRate,
            status: normalized.status,
            notes: normalized.notes ?? "",
          });
          if (!parsed.success) {
            throw new Error("A row failed validation before create");
          }
          items.push({ rowId: row.id, input: parsed.data, venueId });
        }

        const createdIds: string[] = [];
        for (let index = 0; index < items.length; index += IMPORT_EVENT_BATCH_SIZE) {
          const chunk = items.slice(index, index + IMPORT_EVENT_BATCH_SIZE);
          const created = await createEventsBatch(tx, {
            tenantId: params.tenantId,
            userId: params.userId,
            items: chunk.map((item) => ({
              input: item.input,
              venueId: item.venueId,
            })),
          });
          if (!created.ok) {
            throw new Error(created.error);
          }
          createdIds.push(...created.ids);
        }

        for (let index = 0; index < items.length; index += 1) {
          await tx.eventImportRow.update({
            where: { id: items[index]!.rowId },
            data: { createdEventId: createdIds[index] },
          });
        }

        await tx.eventImport.update({
          where: { id: record.id },
          data: {
            status: EventImportStatus.COMPLETED,
            completedAt: new Date(),
            failedAt: null,
            failureReason: null,
            createdEventCount: createdIds.length,
          },
        });
      },
      { timeout: IMPORT_TRANSACTION_TIMEOUT_MS },
    );
  } catch (error) {
    if (error instanceof EventAccessError) {
      throw error;
    }
    await db.eventImport.updateMany({
      where: {
        id: record.id,
        tenantId: params.tenantId,
        status: { not: EventImportStatus.COMPLETED },
      },
      data: {
        status: EventImportStatus.FAILED,
        failedAt: new Date(),
        failureReason:
          error instanceof Error
            ? error.message
            : "Could not create events. No events were kept from this import.",
      },
    });
    return {
      ok: false,
      error:
        "Events could not be created. No imported events were kept. You can try creating them again.",
    };
  }

  return {
    ok: true,
    importId: record.id,
    href: `/events/import/${record.id}/complete`,
  };
}

export async function cancelImport(
  db: DbClient,
  params: { tenantId: string; importId: string },
): Promise<ImportMutationResult> {
  const record = await getImportForTenant(db, params.tenantId, params.importId);
  if (record.status === EventImportStatus.COMPLETED) {
    return {
      ok: false,
      error: "This import has already created events and cannot be cancelled.",
    };
  }

  await db.$transaction(async (tx) => {
    await tx.eventImportRow.deleteMany({
      where: { importId: record.id, tenantId: params.tenantId },
    });
    await tx.eventImportVenue.deleteMany({
      where: { importId: record.id, tenantId: params.tenantId },
    });
    await tx.eventImport.update({
      where: { id: record.id },
      data: {
        status: EventImportStatus.CANCELLED,
        cancelledAt: new Date(),
      },
    });
  });

  return { ok: true, importId: record.id, href: "/events/import" };
}

async function loadExistingEvents(
  db: DbClient,
  tenantId: string,
): Promise<ExistingEventForImport[]> {
  const events = await db.event.findMany({
    where: { tenantId, deletedAt: null },
    select: {
      id: true,
      name: true,
      reference: true,
      eventDate: true,
      venueId: true,
      venue: { select: { nameNormalized: true } },
    },
  });
  return events.map((event) => ({
    id: event.id,
    name: event.name,
    reference: event.reference,
    eventDate: event.eventDate,
    venueId: event.venueId,
    venueNameNormalized: event.venue.nameNormalized,
  }));
}

async function lockImport(
  db: Prisma.TransactionClient,
  tenantId: string,
  importId: string,
) {
  const rows = await db.$queryRaw<
    { id: string; status: EventImportStatus }[]
  >`
    SELECT id, status
    FROM "EventImport"
    WHERE id = ${importId} AND "tenantId" = ${tenantId}
    FOR UPDATE
  `;
  const row = rows[0];
  if (!row) {
    throw new EventAccessError();
  }
  return row;
}
