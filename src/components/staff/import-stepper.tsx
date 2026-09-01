export const IMPORT_STEPS = [
  { id: "upload", label: "Download and upload" },
  { id: "check", label: "Check the file" },
  { id: "create", label: "Create staff" },
] as const;

export type ImportStepId = (typeof IMPORT_STEPS)[number]["id"];

export function ImportStepper({ current }: { current: ImportStepId }) {
  const currentIndex = IMPORT_STEPS.findIndex((step) => step.id === current);
  return (
    <ol className="mt-4 flex flex-wrap gap-2" aria-label="Import steps">
      {IMPORT_STEPS.map((step, index) => {
        const active = index === currentIndex;
        const done = index < currentIndex;
        return (
          <li
            key={step.id}
            className={`rounded-full px-3 py-1 text-sm ${
              active
                ? "bg-slate-900 text-white"
                : done
                  ? "bg-emerald-50 text-emerald-900"
                  : "bg-slate-100 text-slate-600"
            }`}
            aria-current={active ? "step" : undefined}
          >
            {index + 1}. {step.label}
          </li>
        );
      })}
    </ol>
  );
}
