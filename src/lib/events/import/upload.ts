import { z } from "zod";
import { MAX_IMPORT_FILE_BYTES } from "@/lib/events/import/constants";

const maxMb = MAX_IMPORT_FILE_BYTES / (1024 * 1024);

function isUploadFile(value: unknown): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    "size" in value &&
    typeof (value as File).size === "number" &&
    typeof (value as File).name === "string"
  );
}

export const importUploadSchema = z.object({
  file: z
    .custom<File>(isUploadFile, {
      message: "Choose an .xlsx or CSV file to upload.",
    })
    .refine((file) => file.size > 0, {
      message: "Choose an .xlsx or CSV file to upload.",
    })
    .refine((file) => file.size <= MAX_IMPORT_FILE_BYTES, {
      message: `The file is larger than ${maxMb} MB. Split the programme into smaller files and try again.`,
    })
    .refine((file) => {
      const name = file.name.toLowerCase();
      return name.endsWith(".xlsx") || name.endsWith(".csv");
    }, {
      message:
        "Use the NoShowHQ .xlsx template, or a UTF-8 CSV with the same headers.",
    }),
  replaceImportId: z.string(),
});

export function parseImportUploadFormData(formData: FormData) {
  return importUploadSchema.safeParse({
    file: formData.get("file"),
    replaceImportId: String(formData.get("replaceImportId") ?? ""),
  });
}
