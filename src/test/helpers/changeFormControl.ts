import { fireEvent, waitFor } from "@testing-library/react";

/** Select a real shared-menu option; retain fireEvent.change for other form controls. */
export function changeFormControl(element: Element | Node | Document | Window, event: Parameters<typeof fireEvent.change>[1]) {
  if (element instanceof HTMLElement && element.hasAttribute("data-uniform-select-trigger")) {
    const control = element.nextElementSibling?.hasAttribute("data-uniform-select-native") ? element.nextElementSibling : element.previousElementSibling;
    if (!(control instanceof HTMLSelectElement) || !control.hasAttribute("data-uniform-select-native")) throw new Error("Backing select not found");
    const value = String((event as { target?: { value?: unknown } } | undefined)?.target?.value ?? "");
    const index = Array.from(control.options).findIndex(option => option.value === value);
    // Guard tests also exercise deliberately invalid/disabled values. Preserve the
    // original programmatic event in those cases, rather than blocking the test.
    if (index < 0 || control.matches(":disabled") || control.options[index].disabled || (control.options[index].parentElement instanceof HTMLOptGroupElement && control.options[index].parentElement.disabled)) return fireEvent.change(control, event);
    if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
    fireEvent.click(element);
    const option = document.querySelector(`[data-uniform-select-option-key="option-${index}"]`);
    if (!option || option.getAttribute("aria-disabled") === "true") throw new Error(`Option ${value} is not available`);
    return fireEvent.click(option);
  }
  return fireEvent.change(element, event);
}

/** Read the submitted value/options when a form regression test needs native state. */
export function nativeFormControl(element: HTMLElement): HTMLSelectElement {
  if (element instanceof HTMLSelectElement) return element;
  const control = element.nextElementSibling;
  if (!(control instanceof HTMLSelectElement) || !control.hasAttribute("data-uniform-select-native")) throw new Error("Backing select not found");
  return control;
}

/** Inspect offered choices (including disabled choices) independently of popup visibility. */
export function formOptions(container: HTMLElement = document.body) {
  const choices = (options?: {name?: string | RegExp}) => {
    const selects = [container, ...container.querySelectorAll("select")].filter((node): node is HTMLSelectElement => node instanceof HTMLSelectElement && (node.hasAttribute("data-uniform-select-native") || node.getAttribute("aria-hidden") !== "true"));
    const native = selects.flatMap(select => Array.from(select.options));
    const custom = Array.from(container.querySelectorAll<HTMLElement>('[role="option"]:not([data-uniform-select-option-key])'));
    const name = options?.name;
    return [...native, ...custom].filter(option => {
      const text = (option instanceof HTMLOptionElement ? option.label : option.textContent ?? "").replace(/\s+/g," ").trim();
      return name === undefined || (typeof name === "string" ? text === name : new RegExp(name.source,name.flags).test(text));
    });
  };
  const query = (_role: string, options?: {name?: string | RegExp}) => {
    const found = choices(options);
    if (found.length > 1) throw new Error(`Multiple offered options match ${String(options?.name)}`);
    return found[0] ?? null;
  };
  const get = (role: string, options?: {name?: string | RegExp}) => {
    const option = query(role,options);
    if (!option) throw new Error(`Offered option not found: ${String(options?.name)}`);
    return option;
  };
  return {
    getAllByRole: (_role: string, options?: {name?: string | RegExp}) => choices(options),
    queryAllByRole: (_role: string, options?: {name?: string | RegExp}) => choices(options),
    queryByRole: query,
    getByRole: get,
    findByRole: (role: string, options?: {name?: string | RegExp}) => waitFor(() => get(role,options)),
  };
}
