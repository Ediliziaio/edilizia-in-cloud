import { beforeAll, afterAll } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";

/** jsdom does not stop recursive focus calls between local Radix copies. */
export function setupRadixMenus() {
  const focus = HTMLElement.prototype.focus;
  let depth = 0;
  beforeAll(() => {
    HTMLElement.prototype.focus = function (options?: FocusOptions) {
      if (depth >= 3) return;
      depth++;
      try {
        focus.call(this, options);
      } finally {
        depth--;
      }
    };
    Element.prototype.scrollIntoView ??= () => {};
    Element.prototype.hasPointerCapture ??= () => false;
    Element.prototype.setPointerCapture ??= () => {};
    Element.prototype.releasePointerCapture ??= () => {};
  });
  afterAll(() => {
    HTMLElement.prototype.focus = focus;
  });
}

/** Opens a platform menu so its options exist in the page. */
export async function apriMenu(tendina?: string | RegExp, dentro?: HTMLElement) {
  const area = dentro ? within(dentro) : screen;
  const trigger = tendina
    ? area.getByRole("combobox", { name: tendina })
    : area.getByRole("combobox");
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  await screen.findByRole("listbox");
  return trigger;
}

/**
 * Picks an option from a platform menu (OfficeSelect / Radix Select), the way a
 * person does: open the trigger, then click the entry. Replaces the old
 * `fireEvent.change` on a native <select>, which no longer exists in the app.
 */
export async function scegliNelMenu(
  tendina: string | RegExp,
  voce: string | RegExp,
  dentro?: HTMLElement,
) {
  const area = dentro ? within(dentro) : screen;
  fireEvent.keyDown(area.getByRole("combobox", { name: tendina }), {
    key: "ArrowDown",
  });
  fireEvent.click(await screen.findByRole("option", { name: voce }));
}
