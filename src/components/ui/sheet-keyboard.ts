export const SHEET_ENTER_MS = 550;
export const SHEET_EXIT_MS = 320;
export const SHEET_MOTION_MS = SHEET_EXIT_MS;

export function sheetMotionMs(
  prefersReducedMotion: boolean,
  duration = SHEET_EXIT_MS,
): number {
  return prefersReducedMotion ? 0 : duration;
}

export function sheetHasNestedDialog(root: ParentNode | null): boolean {
  return Boolean(root?.querySelector("dialog[open]"));
}

export function sheetTabWrapTarget(
  shiftKey: boolean,
  activeIsFirst: boolean,
  activeIsLast: boolean,
): "first" | "last" | null {
  if (shiftKey && activeIsFirst) {
    return "last";
  }
  if (!shiftKey && activeIsLast) {
    return "first";
  }
  return null;
}
