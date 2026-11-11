import { describe, expect, it } from "vitest";
import { EVIDENCE_POLICY_INACTIVE } from "@/lib/absence/evidence-policy";
import { buildNextWork, type NextWorkAbsence } from "@/lib/absence/next-work";

const todayIso = "2026-11-11";

function absence(overrides: Partial<NextWorkAbsence> = {}): NextWorkAbsence {
  return {
    recordStatus: "ACTIVE",
    type: "SICKNESS",
    payPeriod: null,
    sickness: {
      episodeState: "ONGOING",
      evidenceRequiredFromDay: null,
      evidenceRequirementDate: null,
      sicknessEndedDate: null,
    },
    selfCertification: null,
    fitNotes: [],
    returnToWork: null,
    followUps: [],
    ...overrides,
  };
}

const options = {
  todayIso,
  canConfirmEpisode: true,
  canFilePayPeriod: true,
};

describe("buildNextWork", () => {
  it("puts self-certification ahead of an unfiled pay period", () => {
    const work = buildNextWork(absence(), options);
    expect(work.next?.kind).toBe("self-certification");
    expect(work.next?.label).toBe("Self-certification is not recorded.");
    expect(work.outstanding.map((item) => item.kind)).toEqual([
      "pay-period",
      "fit-note-timing",
    ]);
    expect(work.outstanding[1]?.label).toBe(EVIDENCE_POLICY_INACTIVE);
  });

  it("asks for the sickness status before later gaps", () => {
    const work = buildNextWork(
      absence({
        sickness: {
          episodeState: "NOT_CONFIRMED",
          evidenceRequiredFromDay: null,
          evidenceRequirementDate: null,
          sicknessEndedDate: null,
        },
      }),
      options,
    );
    expect(work.next?.kind).toBe("confirm-episode");
    expect(work.next?.label).toBe("Sickness status not yet confirmed");
    expect(work.outstanding.map((item) => item.kind)).toContain("self-certification");
  });

  it("puts an overdue follow-up ahead of self-certification", () => {
    const work = buildNextWork(
      absence({
        followUps: [
          {
            id: "follow-1",
            state: "OPEN",
            dueDate: new Date("2026-11-01T00:00:00.000Z"),
            purpose: null,
            createdAt: new Date("2026-10-01T00:00:00.000Z"),
            completedAt: null,
            cancelledAt: null,
          },
        ],
      }),
      options,
    );
    expect(work.next?.kind).toBe("overdue-follow-up");
    expect(work.next?.followUpId).toBe("follow-1");
    expect(work.next?.label).toBe("Follow-up is overdue.");
    expect(work.outstanding.map((item) => item.kind)).toContain("self-certification");
  });

  it("asks for a fit note once the requirement date has passed", () => {
    const work = buildNextWork(
      absence({
        payPeriod: { id: "period-1" },
        selfCertification: { status: "RECEIVED" },
        sickness: {
          episodeState: "ONGOING",
          evidenceRequiredFromDay: 8,
          evidenceRequirementDate: new Date("2026-09-22T00:00:00.000Z"),
          sicknessEndedDate: null,
        },
      }),
      options,
    );
    expect(work.next?.kind).toBe("fit-note-due");
    expect(work.next?.label).toBe("Fit note from day 8, required 22/09/2026.");
  });

  it("asks for return to work after an ended episode with nothing earlier open", () => {
    const work = buildNextWork(
      absence({
        payPeriod: { id: "period-1" },
        selfCertification: { status: "RECEIVED" },
        sickness: {
          episodeState: "ENDED",
          evidenceRequiredFromDay: null,
          evidenceRequirementDate: null,
          sicknessEndedDate: new Date("2026-10-01T00:00:00.000Z"),
        },
      }),
      options,
    );
    expect(work.next?.kind).toBe("return-to-work");
    expect(work.next?.label).toBe("Return to work is not recorded.");
  });

  it("files a cancellation when that is the only gap", () => {
    const work = buildNextWork(
      absence({
        type: "CANCELLATION",
        sickness: null,
      }),
      options,
    );
    expect(work.next?.kind).toBe("pay-period");
    expect(work.outstanding).toEqual([]);
  });

  it("leaves an archived record without a next job", () => {
    const work = buildNextWork(absence({ recordStatus: "ARCHIVED" }), options);
    expect(work.next).toBeNull();
    expect(work.outstanding).toEqual([]);
  });
});
