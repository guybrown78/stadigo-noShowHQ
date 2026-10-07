/**
 * @vitest-environment jsdom
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FORM_CHECK_MESSAGE } from "@/lib/form";

const createEventAction = vi.hoisted(() => vi.fn());
const updateEventAction = vi.hoisted(() => vi.fn());

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/app/(app)/events/actions", () => ({
  createEventAction,
  updateEventAction,
}));

import { EventForm, type EventFormTypeOption, type EventFormVenueOption } from "@/components/events/event-form";

const types: EventFormTypeOption[] = [
  {
    id: "type-other",
    name: "Other",
    subtypes: [{ id: "sub-other", name: "Private hire" }],
  },
  {
    id: "type-sport",
    name: "Sporting",
    subtypes: [{ id: "sub-football", name: "Football Match" }],
  },
];

const venues: EventFormVenueOption[] = [
  { id: "venue-ap", name: "Alexandra Palace", postcode: "N22 7AY" },
];

const scrollIntoView = vi.fn();

beforeAll(() => {
  Element.prototype.scrollIntoView = scrollIntoView;
});

beforeEach(() => {
  createEventAction.mockReset();
  updateEventAction.mockReset();
  createEventAction.mockResolvedValue({});
  updateEventAction.mockResolvedValue({});
  scrollIntoView.mockClear();
});

afterEach(() => {
  cleanup();
});

function renderCreate() {
  return render(<EventForm mode="create" types={types} venues={venues} />);
}

function field(name: RegExp | string) {
  return screen.getByLabelText(name);
}

function describedText(control: HTMLElement) {
  const ids = control.getAttribute("aria-describedby")?.split(/\s+/) ?? [];
  return ids
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");
}

async function submitForm() {
  const form = screen.getByRole("button", { name: "Create event" }).closest("form");
  if (!form) {
    throw new Error("event form missing");
  }
  await act(async () => {
    form.requestSubmit();
  });
}

function fillMinimalDraft() {
  fireEvent.change(field(/Event name/), {
    target: { value: "QA-REL keyboard reset investigation draft" },
  });
  fireEvent.change(field(/Reference/), {
    target: { value: "QA-REL-RESET-ONLY" },
  });
  fireEvent.change(field(/Event type/), { target: { value: "type-other" } });
  fireEvent.change(field(/^Venue/), { target: { value: "venue-ap" } });
  fireEvent.change(field(/Event date/), { target: { value: "2026-10-08" } });
  fireEvent.change(field(/Staff required/), { target: { value: "1" } });
}

function setTime(groupName: string, hour: string, minute: string) {
  const group = screen.getByRole("group", { name: groupName });
  fireEvent.change(within(group).getByLabelText("Hour"), {
    target: { value: hour },
  });
  fireEvent.change(within(group).getByLabelText("Minutes"), {
    target: { value: minute },
  });
}

function hiddenTime(name: string) {
  const input = document.querySelector(
    `input[name="${name}"]`,
  ) as HTMLInputElement | null;
  if (!input) {
    throw new Error(`missing ${name}`);
  }
  return input.value;
}

describe("EventForm rejected submission", () => {
  it("keeps the draft and focuses the subtype when subtype is missing", async () => {
    renderCreate();
    fillMinimalDraft();

    await submitForm();

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(FORM_CHECK_MESSAGE);
    });

    const subtype = field(/Event subtype/) as HTMLSelectElement;
    expect(subtype.value).toBe("");
    expect(subtype.getAttribute("aria-invalid")).toBe("true");
    expect(describedText(subtype)).toContain("Select an event subtype");
    expect(document.activeElement).toBe(subtype);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
    expect(scrollIntoView.mock.instances[0]).toBe(subtype);

    expect((field(/Event name/) as HTMLInputElement).value).toBe(
      "QA-REL keyboard reset investigation draft",
    );
    expect((field(/Reference/) as HTMLInputElement).value).toBe(
      "QA-REL-RESET-ONLY",
    );
    expect((field(/Event type/) as HTMLSelectElement).value).toBe("type-other");
    expect((field(/^Status/) as HTMLSelectElement).value).toBe("PLANNED");
    expect((field(/^Venue/) as HTMLSelectElement).value).toBe("venue-ap");
    expect((field(/Event date/) as HTMLInputElement).value).toBe("2026-10-08");
    expect((field(/Staff required/) as HTMLInputElement).value).toBe("1");
    expect((field(/Warning fill rate/) as HTMLInputElement).value).toBe("90");
    expect((field(/Critical fill rate/) as HTMLInputElement).value).toBe("85");
    expect((field(/Internal notes/) as HTMLTextAreaElement).value).toBe("");
    expect(createEventAction).not.toHaveBeenCalled();
  });

  it("keeps optional values across a repeated rejection", async () => {
    renderCreate();
    fireEvent.change(field(/Event name/), {
      target: { value: "QA-REL optional draft" },
    });
    fireEvent.change(field(/Event type/), { target: { value: "type-other" } });
    fireEvent.change(field(/^Status/), { target: { value: "CONFIRMED" } });
    fireEvent.change(field(/^Venue/), { target: { value: "venue-ap" } });
    fireEvent.change(field(/Event date/), { target: { value: "2026-10-09" } });
    fireEvent.click(field(/Ends the next day/));
    setTime("Start time", "22", "00");
    setTime("End time", "02", "00");
    setTime("Briefing time", "18", "00");
    fireEvent.change(field(/Staff required/), { target: { value: "6" } });
    fireEvent.change(field(/Warning fill rate/), { target: { value: "80" } });
    fireEvent.change(field(/Critical fill rate/), { target: { value: "70" } });
    fireEvent.change(field(/Internal notes/), {
      target: { value: "Bring radios." },
    });

    await submitForm();
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(FORM_CHECK_MESSAGE);
    });
    await submitForm();

    expect((field(/Reference/) as HTMLInputElement).value).toBe("");
    expect((field(/Event type/) as HTMLSelectElement).value).toBe("type-other");
    expect((field(/Event subtype/) as HTMLSelectElement).value).toBe("");
    expect((field(/^Status/) as HTMLSelectElement).value).toBe("CONFIRMED");
    expect((field(/^Venue/) as HTMLSelectElement).value).toBe("venue-ap");
    expect((field(/Event date/) as HTMLInputElement).value).toBe("2026-10-09");
    expect((field(/Ends the next day/) as HTMLInputElement).checked).toBe(true);
    expect(hiddenTime("briefingTime")).toBe("18:00");
    expect(hiddenTime("startTime")).toBe("22:00");
    expect(hiddenTime("endTime")).toBe("02:00");
    expect((field(/Staff required/) as HTMLInputElement).value).toBe("6");
    expect((field(/Warning fill rate/) as HTMLInputElement).value).toBe("80");
    expect((field(/Critical fill rate/) as HTMLInputElement).value).toBe("70");
    expect((field(/Internal notes/) as HTMLTextAreaElement).value).toBe(
      "Bring radios.",
    );
    expect((field(/Event name/) as HTMLInputElement).value).toBe(
      "QA-REL optional draft",
    );
    expect(document.activeElement).toBe(field(/Event subtype/));
    expect(createEventAction).not.toHaveBeenCalled();
  });

  it("does not move focus again while the operator edits the draft", async () => {
    renderCreate();
    fillMinimalDraft();
    await submitForm();

    const subtype = field(/Event subtype/);
    await waitFor(() => {
      expect(document.activeElement).toBe(subtype);
    });

    const name = field(/Event name/) as HTMLInputElement;
    name.focus();
    fireEvent.change(name, {
      target: { value: `${name.value} edited` },
    });

    expect(document.activeElement).toBe(name);
    expect(name.value).toBe(
      "QA-REL keyboard reset investigation draft edited",
    );
  });

  it("submits the preserved draft once a subtype is selected", async () => {
    renderCreate();
    fillMinimalDraft();
    await submitForm();
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(FORM_CHECK_MESSAGE);
    });

    fireEvent.change(field(/Event subtype/), {
      target: { value: "sub-other" },
    });
    await submitForm();

    await waitFor(() => {
      expect(createEventAction).toHaveBeenCalledTimes(1);
    });
    const formData = createEventAction.mock.calls[0][1] as FormData;
    expect(formData.get("name")).toBe(
      "QA-REL keyboard reset investigation draft",
    );
    expect(formData.get("reference")).toBe("QA-REL-RESET-ONLY");
    expect(formData.get("eventTypeId")).toBe("type-other");
    expect(formData.get("eventSubtypeId")).toBe("sub-other");
    expect(formData.get("status")).toBe("PLANNED");
    expect(formData.get("venueId")).toBe("venue-ap");
    expect(formData.get("eventDate")).toBe("2026-10-08");
    expect(formData.get("staffRequired")).toBe("1");
    expect(formData.get("warningFillRate")).toBe("90");
    expect(formData.get("criticalFillRate")).toBe("85");
    expect(formData.get("notes")).toBe("");
    expect(updateEventAction).not.toHaveBeenCalled();
  });

  it("keeps an edited draft when update validation fails", async () => {
    render(
      <EventForm
        mode="edit"
        eventId="event-1"
        types={types}
        venues={venues}
        initialValues={{
          name: "Saved event",
          reference: "SAVED-1",
          eventTypeId: "type-other",
          eventSubtypeId: "sub-other",
          venueId: "venue-ap",
          eventDate: "2026-10-01",
          staffRequired: 4,
          status: "PLANNED",
          notes: "Saved note",
        }}
      />,
    );

    fireEvent.change(field(/Event name/), {
      target: { value: "Edited draft name" },
    });
    fireEvent.change(field(/Reference/), { target: { value: "" } });
    fireEvent.change(field(/Event subtype/), { target: { value: "" } });
    fireEvent.change(field(/Event date/), { target: { value: "2026-10-11" } });
    fireEvent.change(field(/Staff required/), { target: { value: "9" } });
    fireEvent.change(field(/Internal notes/), { target: { value: "" } });

    const form = screen.getByRole("button", { name: "Save changes" }).closest("form");
    if (!form) {
      throw new Error("event form missing");
    }
    await act(async () => {
      form.requestSubmit();
    });

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(FORM_CHECK_MESSAGE);
    });
    expect((field(/Event name/) as HTMLInputElement).value).toBe(
      "Edited draft name",
    );
    expect((field(/Reference/) as HTMLInputElement).value).toBe("");
    expect((field(/Event subtype/) as HTMLSelectElement).value).toBe("");
    expect((field(/Event date/) as HTMLInputElement).value).toBe("2026-10-11");
    expect((field(/Staff required/) as HTMLInputElement).value).toBe("9");
    expect((field(/Internal notes/) as HTMLTextAreaElement).value).toBe("");
    expect((field(/^Venue/) as HTMLSelectElement).value).toBe("venue-ap");
    expect(updateEventAction).not.toHaveBeenCalled();
    expect(createEventAction).not.toHaveBeenCalled();
  });

  it("drops a subtype that does not belong to the newly selected type", () => {
    renderCreate();
    fireEvent.change(field(/Event type/), { target: { value: "type-other" } });
    fireEvent.change(field(/Event subtype/), { target: { value: "sub-other" } });
    expect((field(/Event subtype/) as HTMLSelectElement).value).toBe("sub-other");

    fireEvent.change(field(/Event type/), { target: { value: "type-sport" } });

    const subtype = field(/Event subtype/) as HTMLSelectElement;
    expect(subtype.value).toBe("");
    expect(within(subtype).getByRole("option", { name: "Football Match" })).toBeTruthy();
    expect(within(subtype).queryByRole("option", { name: "Private hire" })).toBeNull();
  });
});
