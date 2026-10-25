import { Prisma, type PrismaClient } from "@prisma/client";
import { AbsenceAccessError } from "@/lib/absence/errors";
import { writeAbsenceHistory } from "@/lib/absence/history";
import {
  formatPayPeriodName,
  payPeriodLabel,
  rangesOverlap,
} from "@/lib/absence/pay-period";
import { formatLocalDateIso, londonTodayIso, parseLocalDate } from "@/lib/events/dates";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type PayPeriodSummary = {
  id: string;
  number: number;
  label: string;
  startsOn: string;
  endsOn: string;
  status: "OPEN" | "SCHEDULED" | "CLOSED";
  absenceCount: number;
};

export type PayPeriodMutationResult =
  | { ok: true; id: string; unchanged?: boolean }
  | {
      ok: false;
      error: string;
      fieldErrors?: Record<string, string[]>;
    };

const OVERLAP_MESSAGE = "These dates overlap another pay period.";
const ORDER_MESSAGE =
  "The next period must start after the current period ends. Shorten the current period first.";
const ALREADY_OPEN_MESSAGE = "A pay period is already open.";
const NO_OPEN_MESSAGE = "There is no open pay period.";
const UNKNOWN_PERIOD_MESSAGE = "Choose a pay period for this organisation.";

export async function listPayPeriods(
  db: DbClient,
  tenantId: string,
  todayIso = londonTodayIso(),
): Promise<PayPeriodSummary[]> {
  if (isPrismaClient(db)) {
    await syncPayPeriodStatus(db, tenantId, todayIso);
  }
  const [periods, counts] = await Promise.all([
    db.payPeriod.findMany({
      where: { tenantId },
      orderBy: { number: "desc" },
    }),
    db.absence.groupBy({
      by: ["payPeriodId"],
      where: { tenantId, payPeriodId: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const countById = new Map(
    counts.flatMap((row) =>
      row.payPeriodId ? [[row.payPeriodId, row._count._all] as const] : [],
    ),
  );
  return periods.map((period) => ({
    id: period.id,
    number: period.number,
    label: period.label,
    startsOn: formatLocalDateIso(period.startsOn),
    endsOn: formatLocalDateIso(period.endsOn),
    status: period.status,
    absenceCount: countById.get(period.id) ?? 0,
  }));
}

export async function openPayPeriod(
  db: PrismaClient,
  params: {
    tenantId: string;
    userId: string;
    startsOn: string;
    endsOn: string;
  },
): Promise<PayPeriodMutationResult> {
  const dates = validatedDates(params.startsOn, params.endsOn);
  if (!dates.ok) {
    return dates;
  }
  try {
    return await db.$transaction(async (tx) => {
      const existing = await tx.payPeriod.findFirst({
        where: { tenantId: params.tenantId },
        select: { id: true },
      });
      if (existing) {
        return { ok: false, error: ALREADY_OPEN_MESSAGE };
      }
      const created = await createPeriod(tx, params, dates.label, "OPEN");
      return { ok: true, id: created.id };
    });
  } catch (error) {
    const conflict = conflictMessage(error);
    if (conflict) {
      return { ok: false, error: ALREADY_OPEN_MESSAGE };
    }
    throw error;
  }
}

export async function updateOpenPayPeriod(
  db: PrismaClient,
  params: {
    tenantId: string;
    startsOn: string;
    endsOn: string;
  },
): Promise<PayPeriodMutationResult> {
  const dates = validatedDates(params.startsOn, params.endsOn);
  if (!dates.ok) {
    return dates;
  }
  return db.$transaction(async (tx) => {
    const current = await tx.payPeriod.findFirst({
      where: { tenantId: params.tenantId, status: "OPEN" },
    });
    if (!current) {
      return { ok: false, error: NO_OPEN_MESSAGE };
    }
    const others = await tx.payPeriod.findMany({
      where: { tenantId: params.tenantId, id: { not: current.id } },
    });
    if (
      others.some((period) =>
        rangesOverlap(dates, {
          startsOnIso: formatLocalDateIso(period.startsOn),
          endsOnIso: formatLocalDateIso(period.endsOn),
        }),
      )
    ) {
      return {
        ok: false,
        error: OVERLAP_MESSAGE,
        fieldErrors: { startsOn: [OVERLAP_MESSAGE] },
      };
    }
    await tx.payPeriod.update({
      where: { id: current.id },
      data: {
        startsOn: dates.startsOn,
        endsOn: dates.endsOn,
        label: dates.label,
      },
    });
    return { ok: true, id: current.id };
  });
}

export async function startNextPayPeriod(
  db: PrismaClient,
  params: {
    tenantId: string;
    userId: string;
    startsOn: string;
    endsOn: string;
    todayIso?: string;
  },
): Promise<PayPeriodMutationResult> {
  const dates = validatedDates(params.startsOn, params.endsOn);
  if (!dates.ok) {
    return dates;
  }
  const todayIso = params.todayIso ?? londonTodayIso();
  try {
    return await db.$transaction(async (tx) => {
      const current = await tx.payPeriod.findFirst({
        where: { tenantId: params.tenantId, status: "OPEN" },
      });
      if (!current) {
        return { ok: false, error: NO_OPEN_MESSAGE };
      }
      const currentEnd = formatLocalDateIso(current.endsOn);
      if (dates.startsOnIso <= currentEnd) {
        return {
          ok: false,
          error: ORDER_MESSAGE,
          fieldErrors: { startsOn: [ORDER_MESSAGE] },
        };
      }
      const others = await tx.payPeriod.findMany({
        where: { tenantId: params.tenantId, id: { not: current.id } },
      });
      if (
        others.some((period) =>
          rangesOverlap(dates, {
            startsOnIso: formatLocalDateIso(period.startsOn),
            endsOnIso: formatLocalDateIso(period.endsOn),
          }),
        )
      ) {
        return {
          ok: false,
          error: OVERLAP_MESSAGE,
          fieldErrors: { startsOn: [OVERLAP_MESSAGE] },
        };
      }
      if (dates.startsOnIso > todayIso) {
        const created = await createPeriod(tx, params, dates.label, "SCHEDULED");
        return { ok: true, id: created.id };
      }
      await tx.payPeriod.update({
        where: { id: current.id },
        data: {
          status: "CLOSED",
          closedAt: new Date(),
          closedById: params.userId,
        },
      });
      const created = await createPeriod(tx, params, dates.label, "OPEN");
      return { ok: true, id: created.id };
    });
  } catch (error) {
    const conflict = conflictMessage(error);
    if (conflict) {
      return { ok: false, error: conflict };
    }
    throw error;
  }
}

export async function resolvePayPeriodForCreate(
  db: DbClient,
  tenantId: string,
  requestedId: string,
): Promise<
  | { ok: true; payPeriodId: string | null; label: string | null }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> }
> {
  const requested = requestedId.trim();
  const count = await db.payPeriod.count({ where: { tenantId } });
  if (count === 0) {
    if (requested) {
      return periodError();
    }
    return { ok: true, payPeriodId: null, label: null };
  }
  if (requested) {
    const period = await db.payPeriod.findFirst({
      where: { id: requested, tenantId },
      select: { id: true, number: true, label: true },
    });
    if (!period) {
      return periodError();
    }
    return {
      ok: true,
      payPeriodId: period.id,
      label: formatPayPeriodName(period),
    };
  }
  const open = await db.payPeriod.findFirst({
    where: { tenantId, status: "OPEN" },
    select: { id: true, number: true, label: true },
  });
  if (!open) {
    return {
      ok: false,
      error: "Open a pay period before logging this absence.",
      fieldErrors: { payPeriodId: ["Open a pay period before logging this absence."] },
    };
  }
  return {
    ok: true,
    payPeriodId: open.id,
    label: formatPayPeriodName(open),
  };
}

export async function changeAbsencePayPeriod(
  db: PrismaClient,
  params: {
    tenantId: string;
    userId: string;
    absenceId: string;
    payPeriodId: string;
  },
): Promise<PayPeriodMutationResult> {
  const absence = await db.absence.findFirst({
    where: { id: params.absenceId, tenantId: params.tenantId },
    select: {
      id: true,
      payPeriodId: true,
      payPeriod: { select: { id: true, number: true, label: true } },
    },
  });
  if (!absence) {
    throw new AbsenceAccessError();
  }
  const next = await db.payPeriod.findFirst({
    where: { id: params.payPeriodId, tenantId: params.tenantId },
    select: { id: true, number: true, label: true },
  });
  if (!next) {
    return periodError();
  }
  if (absence.payPeriodId === next.id) {
    return { ok: true, id: absence.id, unchanged: true };
  }
  const previousLabel = absence.payPeriod
    ? formatPayPeriodName(absence.payPeriod)
    : "No period";
  await db.$transaction(async (tx) => {
    await tx.absence.update({
      where: { id: absence.id },
      data: {
        payPeriodId: next.id,
        updatedById: params.userId,
      },
    });
    await writeAbsenceHistory(tx, {
      tenantId: params.tenantId,
      absenceId: absence.id,
      action: "PERIOD_CHANGED",
      actedById: params.userId,
      changes: [
        {
          field: "payPeriod",
          previous: absence.payPeriodId ? previousLabel : null,
          next: formatPayPeriodName(next),
        },
      ],
    });
  });
  return { ok: true, id: absence.id };
}

async function createPeriod(
  tx: Prisma.TransactionClient,
  params: { tenantId: string; userId: string; startsOn: string; endsOn: string },
  label: string,
  status: "OPEN" | "SCHEDULED",
) {
  const tenant = await tx.tenant.update({
    where: { id: params.tenantId },
    data: { payPeriodSeq: { increment: 1 } },
    select: { payPeriodSeq: true },
  });
  return tx.payPeriod.create({
    data: {
      tenantId: params.tenantId,
      number: tenant.payPeriodSeq,
      label,
      startsOn: parseLocalDate(params.startsOn)!,
      endsOn: parseLocalDate(params.endsOn)!,
      status,
      openedById: params.userId,
    },
  });
}

export async function syncPayPeriodStatus(
  db: PrismaClient,
  tenantId: string,
  todayIso = londonTodayIso(),
): Promise<void> {
  const today = parseLocalDate(todayIso);
  if (!today) return;
  await db.$transaction(async (tx) => {
    const periods = await tx.payPeriod.findMany({ where: { tenantId } });
    const current =
      periods
        .filter((period) => period.startsOn <= today)
        .sort(
          (left, right) =>
            right.startsOn.getTime() - left.startsOn.getTime() ||
            right.number - left.number,
        )[0] ?? null;
    const desired = (period: (typeof periods)[number]) => {
      if (current?.id === period.id) return "OPEN" as const;
      if (period.startsOn > today) return "SCHEDULED" as const;
      return "CLOSED" as const;
    };
    const demote = periods.filter(
      (period) => period.status === "OPEN" && desired(period) !== "OPEN",
    );
    for (const period of demote) {
      await tx.payPeriod.update({
        where: { id: period.id },
        data: statusWrite(desired(period), period, current?.openedById),
      });
    }
    for (const period of periods) {
      if (demote.some((row) => row.id === period.id)) continue;
      const nextStatus = desired(period);
      if (period.status === nextStatus) continue;
      await tx.payPeriod.update({
        where: { id: period.id },
        data: statusWrite(nextStatus, period, current?.openedById),
      });
    }
  });
}

function statusWrite(
  status: "OPEN" | "SCHEDULED" | "CLOSED",
  period: { closedAt: Date | null; closedById: string | null; openedById: string },
  closerId: string | undefined,
) {
  if (status === "CLOSED") {
    return {
      status,
      closedAt: period.closedAt ?? new Date(),
      closedById: period.closedById ?? closerId ?? period.openedById,
    };
  }
  return { status, closedAt: null, closedById: null };
}

function isPrismaClient(db: DbClient): db is PrismaClient {
  return "$transaction" in db;
}

function validatedDates(
  startsOnIso: string,
  endsOnIso: string,
):
  | {
      ok: true;
      startsOn: Date;
      endsOn: Date;
      startsOnIso: string;
      endsOnIso: string;
      label: string;
    }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> } {
  const startsOn = parseLocalDate(startsOnIso);
  const endsOn = parseLocalDate(endsOnIso);
  const label = startsOn && endsOn ? payPeriodLabel(startsOnIso, endsOnIso) : null;
  if (!startsOn || !endsOn || !label) {
    return {
      ok: false,
      error: "Enter a valid start and end date.",
      fieldErrors: { startsOn: ["Enter a valid start and end date."] },
    };
  }
  return {
    ok: true,
    startsOn,
    endsOn,
    startsOnIso,
    endsOnIso,
    label,
  };
}

function periodError(): Extract<PayPeriodMutationResult, { ok: false }> {
  return {
    ok: false,
    error: UNKNOWN_PERIOD_MESSAGE,
    fieldErrors: { payPeriodId: [UNKNOWN_PERIOD_MESSAGE] },
  };
}

function conflictMessage(error: unknown): string | null {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return null;
  }
  return ALREADY_OPEN_MESSAGE;
}
