import { describe, expect, it } from "vitest";
import { parseImportUploadFormData } from "@/lib/events/import/upload";
import { MAX_IMPORT_FILE_BYTES } from "@/lib/events/import/constants";

function formWithFile(file: File, replaceImportId = "") {
  const formData = new FormData();
  formData.set("file", file);
  formData.set("replaceImportId", replaceImportId);
  return formData;
}

describe("parseImportUploadFormData", () => {
  it("accepts an xlsx file under the size limit", () => {
    const file = new File(["workbook"], "events.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const parsed = parseImportUploadFormData(formWithFile(file));
    expect(parsed.success).toBe(true);
  });

  it("rejects a missing or empty file", () => {
    const file = new File([], "events.xlsx");
    const parsed = parseImportUploadFormData(formWithFile(file));
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.file?.[0]).toMatch(/choose/i);
    }
  });

  it("rejects a file that is not xlsx or csv", () => {
    const file = new File(["data"], "events.txt", { type: "text/plain" });
    const parsed = parseImportUploadFormData(formWithFile(file));
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.file?.[0]).toMatch(/xlsx/i);
    }
  });

  it("rejects a file over the size limit", () => {
    const file = new File(["x"], "events.csv", { type: "text/csv" });
    Object.defineProperty(file, "size", { value: MAX_IMPORT_FILE_BYTES + 1 });
    const parsed = parseImportUploadFormData(formWithFile(file));
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.file?.[0]).toMatch(/5 MB/i);
    }
  });
});
