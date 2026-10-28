/** Card controls keep their own action instead of opening the parent document. */
export function isPipelineCardControl(target: EventTarget | null) {
  return (
    target instanceof Element &&
    !!target.closest(
      "a,button,summary,input,select,textarea,[role='button'],[role='checkbox'],[role='menuitem'],[contenteditable='true'],[data-no-card-open]",
    )
  );
}
