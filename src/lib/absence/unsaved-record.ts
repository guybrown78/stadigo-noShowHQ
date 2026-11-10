const baseline = new WeakMap<Element, string>();

function readValue(field: Element): string | null {
  if (field instanceof HTMLInputElement) {
    if (
      field.type === "hidden" ||
      field.type === "button" ||
      field.type === "submit" ||
      field.type === "reset" ||
      field.type === "file"
    ) {
      return null;
    }
    if (field.type === "checkbox" || field.type === "radio") {
      return field.checked ? "1" : "0";
    }
    return field.value;
  }
  if (field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) {
    return field.value;
  }
  return null;
}

export function rememberRecordField(field: Element) {
  if (baseline.has(field)) return;
  const value = readValue(field);
  if (value === null) return;
  baseline.set(field, value);
}

export function rememberRecordFields(root: ParentNode) {
  if (root instanceof Element) rememberRecordField(root);
  root.querySelectorAll("input, textarea, select").forEach(rememberRecordField);
}

export function recordHasUnsavedChanges(root: ParentNode): boolean {
  const fields = root.querySelectorAll("input, textarea, select");
  for (const field of fields) {
    const saved = baseline.get(field);
    if (saved === undefined) continue;
    const value = readValue(field);
    if (value !== null && value !== saved) return true;
  }
  return false;
}
