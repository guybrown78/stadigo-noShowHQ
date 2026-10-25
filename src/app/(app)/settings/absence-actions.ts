"use server";

import type { AbsenceReasonKind } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { parseLocalDate } from "@/lib/events/dates";
import {
  DEFAULT_AWOL_THRESHOLD_COUNT,
  DEFAULT_AWOL_WINDOW_DAYS,
  DEFAULT_CANCELLATION_THRESHOLD,
  DEFAULT_SHORT_NOTICE_HOURS,
} from "@/lib/absence/pay-period";

export type SettingsActionState = {
  error?: string;
  ok?: boolean;
};

function wholeNumber(value: FormDataEntryValue | null, fallback: number): number {
  const parsed = Number(String(value ?? "").trim());
  return Number.isInteger(parsed) ? parsed : fallback;
}

export async function updateAttendanceSettingsAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const user = await requireTenant();
  const shortNoticeHours = wholeNumber(
    formData.get("shortNoticeHours"),
    DEFAULT_SHORT_NOTICE_HOURS,
  );
  const cancellationThreshold = wholeNumber(
    formData.get("cancellationThreshold"),
    DEFAULT_CANCELLATION_THRESHOLD,
  );
  const awolThresholdCount = wholeNumber(
    formData.get("awolThresholdCount"),
    DEFAULT_AWOL_THRESHOLD_COUNT,
  );
  const awolWindowDays = wholeNumber(
    formData.get("awolWindowDays"),
    DEFAULT_AWOL_WINDOW_DAYS,
  );
  if (
    shortNoticeHours < 1 ||
    shortNoticeHours > 24 * 14 ||
    cancellationThreshold < 1 ||
    cancellationThreshold > 100 ||
    awolThresholdCount < 1 ||
    awolThresholdCount > 100 ||
    awolWindowDays < 1 ||
    awolWindowDays > 365
  ) {
    return { error: "Check the numbers and try again." };
  }
  await prisma.tenant.update({
    where: { id: user.tenantId },
    data: {
      shortNoticeHours,
      cancellationThreshold,
      awolThresholdCount,
      awolWindowDays,
    },
  });
  revalidatePath("/settings/absence");
  revalidatePath("/dashboard");
  return { ok: true };
}

function reasonKind(value: FormDataEntryValue | null): AbsenceReasonKind | null {
  if (value === "CANCELLATION" || value === "SICKNESS") {
    return value;
  }
  return null;
}

export async function addAbsenceReasonAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const user = await requireTenant();
  const kind = reasonKind(formData.get("kind"));
  const label = String(formData.get("label") ?? "").trim().replace(/\s+/g, " ");
  if (!kind || label.length < 2 || label.length > 80 || label.startsWith("Other:")) {
    return { error: "Enter a reason of 2 to 80 characters." };
  }
  const last = await prisma.absenceReason.findFirst({
    where: { tenantId: user.tenantId, kind },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  try {
    await prisma.absenceReason.create({
      data: {
        tenantId: user.tenantId,
        kind,
        label,
        sortOrder: (last?.sortOrder ?? 0) + 1,
      },
    });
  } catch {
    return { error: "That reason is already on the list." };
  }
  revalidatePath("/settings/absence");
  return { ok: true };
}

export async function updateAbsenceReasonAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const user = await requireTenant();
  const id = String(formData.get("id") ?? "");
  const label = String(formData.get("label") ?? "").trim().replace(/\s+/g, " ");
  const active = formData.get("active") === "on";
  if (label.length < 2 || label.length > 80 || label.startsWith("Other:")) {
    return { error: "Enter a reason of 2 to 80 characters." };
  }
  const existing = await prisma.absenceReason.findFirst({
    where: { id, tenantId: user.tenantId },
  });
  if (!existing) {
    return { error: "That reason could not be found." };
  }
  try {
    await prisma.absenceReason.update({
      where: { id: existing.id },
      data: { label, active },
    });
  } catch {
    return { error: "That reason is already on the list." };
  }
  revalidatePath("/settings/absence");
  revalidatePath("/absence/new");
  revalidatePath("/absence", "layout");
  return { ok: true };
}

export async function deleteAbsenceReasonAction(formData: FormData) {
  const user = await requireTenant();
  const id = String(formData.get("id") ?? "");
  if (!id) {
    return;
  }
  await prisma.absenceReason.deleteMany({
    where: { id, tenantId: user.tenantId },
  });
  revalidatePath("/settings/absence");
  revalidatePath("/absence/new");
  revalidatePath("/absence", "layout");
}

export async function moveAbsenceReasonAction(formData: FormData) {
  const user = await requireTenant();
  const id = String(formData.get("id") ?? "");
  const direction = formData.get("direction") === "up" ? -1 : 1;
  const current = await prisma.absenceReason.findFirst({
    where: { id, tenantId: user.tenantId },
  });
  if (!current) {
    return;
  }
  const sibling = await prisma.absenceReason.findFirst({
    where: {
      tenantId: user.tenantId,
      kind: current.kind,
      sortOrder: direction < 0 ? { lt: current.sortOrder } : { gt: current.sortOrder },
    },
    orderBy: { sortOrder: direction < 0 ? "desc" : "asc" },
  });
  if (!sibling) {
    return;
  }
  await prisma.$transaction([
    prisma.absenceReason.update({
      where: { id: current.id },
      data: { sortOrder: sibling.sortOrder },
    }),
    prisma.absenceReason.update({
      where: { id: sibling.id },
      data: { sortOrder: current.sortOrder },
    }),
  ]);
  revalidatePath("/settings/absence");
}

export async function saveAwolFollowUpAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const user = await requireTenant();
  const staffId = String(formData.get("staffId") ?? "");
  const staff = await prisma.staff.findFirst({
    where: { id: staffId, tenantId: user.tenantId, deletedAt: null },
    select: { id: true },
  });
  if (!staff) {
    return { error: "That staff member could not be found." };
  }
  function optionalDate(name: string) {
    const raw = String(formData.get(name) ?? "").trim();
    if (!raw) return null;
    return parseLocalDate(raw);
  }
  const contact1At = optionalDate("contact1At");
  const contact2At = optionalDate("contact2At");
  const formalProcessAt = optionalDate("formalProcessAt");
  if (
    (String(formData.get("contact1At") ?? "").trim() && !contact1At) ||
    (String(formData.get("contact2At") ?? "").trim() && !contact2At) ||
    (String(formData.get("formalProcessAt") ?? "").trim() && !formalProcessAt)
  ) {
    return { error: "Enter a valid date or leave the field blank." };
  }
  await prisma.staffAwolFollowUp.upsert({
    where: { staffId_tenantId: { staffId: staff.id, tenantId: user.tenantId } },
    create: {
      tenantId: user.tenantId,
      staffId: staff.id,
      contact1At,
      contact2At,
      formalProcessAt,
    },
    update: { contact1At, contact2At, formalProcessAt },
  });
  revalidatePath(`/staff/${staff.id}`);
  revalidatePath("/dashboard");
  return { ok: true };
}
