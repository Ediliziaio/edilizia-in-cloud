import { beforeAll, afterAll } from "vitest";

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
