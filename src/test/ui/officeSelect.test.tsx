import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OfficeSelect } from "@/components/orders/OfficeSelect";
import { setupRadixMenus } from "@/test/helpers/radixMenus";
setupRadixMenus();
afterEach(cleanup);

const options = [
  { value: "", label: "Io" },
  { value: "anna", label: "Anna Rossi" },
];
function Example() {
  const [value, setValue] = useState("");
  return (
    <>
      <OfficeSelect
        label="Responsabile"
        value={value}
        onValueChange={setValue}
        options={options}
      />
      <output data-testid="value">{value}</output>
    </>
  );
}
async function choose(label: string) {
  fireEvent.keyDown(screen.getByRole("combobox", { name: "Responsabile" }), {
    key: "ArrowDown",
  });
  fireEvent.click(await screen.findByRole("option", { name: label }));
}

describe("rounded office select", () => {
  it("uses a labelled platform menu, not a visible native select", async () => {
    render(<Example />);
    const trigger = screen.getByRole("combobox", { name: "Responsabile" });
    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger).toHaveClass("rounded-xl");
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(await screen.findByRole("listbox")).toHaveClass("rounded-2xl");
    expect(screen.getByRole("option", { name: "Io" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
  it("preserves the empty default value when choosing Io again", async () => {
    render(<Example />);
    await choose("Anna Rossi");
    expect(screen.getByTestId("value")).toHaveTextContent("anna");
    await choose("Io");
    expect(screen.getByTestId("value")).toBeEmptyDOMElement();
    expect(screen.getByRole("combobox")).toHaveTextContent("Io");
  });
  it("does not open or mutate a disabled field", () => {
    const change = vi.fn();
    render(
      <OfficeSelect
        label="Responsabile"
        value=""
        onValueChange={change}
        options={options}
        disabled
      />,
    );
    expect(screen.getByRole("combobox")).toBeDisabled();
    fireEvent.click(screen.getByRole("combobox"));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(change).not.toHaveBeenCalled();
  });
});
