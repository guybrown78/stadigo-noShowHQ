import type {
  AbsenceFollowUpState,
  AbsenceRecordStatus,
  AbsenceType,
  SicknessEpisodeState,
} from "@prisma/client";
import type {
  FitNoteStatus,
  ReturnToWorkStatus,
  SelfCertificationStatus,
} from "@/lib/absence/catalog";
import {
  EVIDENCE_CONFIRMATION_NEEDED,
  EVIDENCE_POLICY_INACTIVE,
  evidenceRequirementView,
} from "@/lib/absence/evidence-policy";
import {
  FOLLOW_UP_PURPOSE_LABELS,
  followUpDueState,
  sortFollowUpsForDetail,
} from "@/lib/absence/follow-up";
import { SICKNESS_EPISODE_STATE_LABELS } from "@/lib/absence/sickness";
import { formatLocalDateDisplay, formatLocalDateIso, parseLocalDate } from "@/lib/events/dates";

export type NextWorkKind =
  | "confirm-episode"
  | "overdue-follow-up"
  | "fit-note-due"
  | "fit-note-timing"
  | "fit-note-confirmation"
  | "chase-overdue"
  | "self-certification"
  | "return-to-work"
  | "pay-period";

export type NextWorkItem = {
  kind: NextWorkKind;
  label: string;
  actionable: boolean;
  followUpId?: string;
};

export type NextWork = {
  next: NextWorkItem | null;
  outstanding: NextWorkItem[];
};

type FollowUpPurpose = keyof typeof FOLLOW_UP_PURPOSE_LABELS;

export type NextWorkAbsence = {
  recordStatus: AbsenceRecordStatus;
  type: AbsenceType;
  payPeriod: { id: string } | null;
  sickness: {
    episodeState: SicknessEpisodeState;
    evidenceRequiredFromDay: number | null;
    evidenceRequirementDate: Date | null;
    sicknessEndedDate: Date | null;
  } | null;
  selfCertification: { status: SelfCertificationStatus } | null;
  fitNotes: Array<{ status: FitNoteStatus; chaseDueDate: Date | null }>;
  returnToWork: { status: ReturnToWorkStatus } | null;
  followUps: Array<{
    id: string;
    state: AbsenceFollowUpState;
    dueDate: Date;
    purpose: FollowUpPurpose | null;
    createdAt: Date;
    completedAt: Date | null;
    cancelledAt: Date | null;
  }>;
};

const EMPTY: NextWork = { next: null, outstanding: [] };

function displayIso(iso: string): string {
  const parsed = parseLocalDate(iso);
  return parsed ? formatLocalDateDisplay(parsed) : iso;
}

function overdueLabel(purpose: FollowUpPurpose | null): string {
  if (purpose) {
    return `${FOLLOW_UP_PURPOSE_LABELS[purpose]} is overdue.`;
  }
  return "Follow-up is overdue.";
}

export function buildNextWork(
  absence: NextWorkAbsence,
  options: {
    todayIso?: string;
    canConfirmEpisode: boolean;
    canFilePayPeriod: boolean;
  },
): NextWork {
  if (absence.recordStatus !== "ACTIVE") {
    return EMPTY;
  }

  const candidates: NextWorkItem[] = [];
  const notes: NextWorkItem[] = [];
  const sickness = absence.type === "SICKNESS" ? absence.sickness : null;
  const todayIso = options.todayIso;

  if (sickness?.episodeState === "NOT_CONFIRMED") {
    candidates.push({
      kind: "confirm-episode",
      label: SICKNESS_EPISODE_STATE_LABELS.NOT_CONFIRMED,
      actionable: options.canConfirmEpisode,
    });
  }

  const ranked = todayIso
    ? sortFollowUpsForDetail(
        absence.followUps.map((followUp) => ({
          ...followUp,
          dueDateIso: formatLocalDateIso(followUp.dueDate),
        })),
        todayIso,
      )
    : [];
  const overdue = todayIso
    ? ranked.filter(
        (followUp) =>
          followUpDueState(followUp.dueDateIso, todayIso, followUp.state) === "overdue",
      )
    : [];
  overdue.forEach((followUp, index) => {
    candidates.push({
      kind: "overdue-follow-up",
      label: overdueLabel(followUp.purpose),
      actionable: index === 0,
      followUpId: followUp.id,
    });
  });

  if (sickness) {
    const requirementDate = sickness.evidenceRequirementDate
      ? formatLocalDateIso(sickness.evidenceRequirementDate)
      : null;
    const requirement = evidenceRequirementView({
      episodeState: sickness.episodeState,
      requiredFromDay: sickness.evidenceRequiredFromDay,
      requirementDate,
      todayIso: todayIso ?? "",
      sicknessEndedDateIso: sickness.sicknessEndedDate
        ? formatLocalDateIso(sickness.sicknessEndedDate)
        : null,
    });
    if (requirement.kind === "inactive") {
      notes.push({
        kind: "fit-note-timing",
        label: EVIDENCE_POLICY_INACTIVE,
        actionable: false,
      });
    }
    if (requirement.kind === "confirmation_needed") {
      notes.push({
        kind: "fit-note-confirmation",
        label: EVIDENCE_CONFIRMATION_NEEDED,
        actionable: false,
      });
    }
    const received = absence.fitNotes.some((note) => note.status === "RECEIVED");
    if (requirement.kind === "reached" && !received) {
      candidates.push({
        kind: "fit-note-due",
        label: `Fit note from day ${requirement.requiredFromDay}, required ${displayIso(requirement.requirementDate)}.`,
        actionable: true,
      });
    }
    const chaseOverdue =
      Boolean(todayIso) &&
      absence.fitNotes.some(
        (note) =>
          note.status === "REQUESTED" &&
          note.chaseDueDate != null &&
          formatLocalDateIso(note.chaseDueDate) < todayIso!,
      );
    if (chaseOverdue && !overdue.some((followUp) => followUp.purpose === "CHASE_FIT_NOTE")) {
      notes.push({
        kind: "chase-overdue",
        label: "Fit note chase is overdue.",
        actionable: false,
      });
    }

    const selfStatus = absence.selfCertification?.status ?? "NOT_RECORDED";
    if (selfStatus === "NOT_RECORDED") {
      candidates.push({
        kind: "self-certification",
        label: "Self-certification is not recorded.",
        actionable: true,
      });
    }
    if (
      sickness.episodeState === "ENDED" &&
      (absence.returnToWork == null || absence.returnToWork.status === "NOT_RECORDED")
    ) {
      candidates.push({
        kind: "return-to-work",
        label: "Return to work is not recorded.",
        actionable: true,
      });
    }
  }

  if (!absence.payPeriod) {
    candidates.push({
      kind: "pay-period",
      label: "Not filed in a pay period.",
      actionable: options.canFilePayPeriod,
    });
  }

  const next = candidates.find((item) => item.actionable) ?? null;
  return {
    next,
    outstanding: [...candidates.filter((item) => item !== next), ...notes],
  };
}
