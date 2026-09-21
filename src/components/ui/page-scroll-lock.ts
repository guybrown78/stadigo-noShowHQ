export function pageScrollShiftPx(
  clientWidthBefore: number,
  clientWidthAfter: number,
): number {
  return Math.max(0, clientWidthAfter - clientWidthBefore);
}

export function lockPageScroll(): () => void {
  const root = document.documentElement;
  const body = document.body;
  const previous = {
    rootOverflow: root.style.overflow,
    bodyOverflow: body.style.overflow,
    bodyPaddingRight: body.style.paddingRight,
  };
  const before = root.clientWidth;
  root.style.overflow = "hidden";
  body.style.overflow = "hidden";
  const shift = pageScrollShiftPx(before, root.clientWidth);
  if (shift > 0) {
    body.style.paddingRight = `${shift}px`;
  }

  return () => {
    root.style.overflow = previous.rootOverflow;
    body.style.overflow = previous.bodyOverflow;
    body.style.paddingRight = previous.bodyPaddingRight;
  };
}
