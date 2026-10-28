import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FieldRenderer } from "@/components/surveys/engine/FieldRenderer";
import type { FieldDefinition } from "@/types/surveys";

afterEach(cleanup);
const field: FieldDefinition = {
  key: "rv_door_swing",
  type: "select",
  label: "Dal lato esterno la porta si apre",
  required: true,
  options: [
    { value: "spingere", label: "Spingendo verso l’interno" },
    { value: "tirare", label: "Tirando verso l’esterno" },
  ],
};
function Choice({
  initial = "",
  changed = vi.fn(),
  disabled = false,
}: {
  initial?: string;
  changed?: (key: string, value: unknown) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <fieldset disabled={disabled}>
      <FieldRenderer
        field={field}
        value={value}
        allValues={{}}
        showErrors
        onChange={(key, next) => {
          setValue(String(next));
          changed(key, next);
        }}
      />
    </fieldset>
  );
}
describe("Scelte del rilievo · schede tattili e radio compatti", () => {
  it("non seleziona una risposta mancante e rende il gruppo identificabile", () => {
    render(<Choice />);
    expect(
      screen.getByRole("radiogroup", { name: field.label }),
    ).toHaveAttribute("aria-invalid", "true");
    expect(
      screen
        .getAllByRole("radio")
        .every((r) => r.getAttribute("aria-checked") === "false"),
    ).toBe(true);
    expect(screen.getByText("Campo obbligatorio")).toBeInTheDocument();
  });
  it("tutta la scheda seleziona una sola opzione e conserva il valore previsto dal modello", () => {
    const changed = vi.fn();
    render(<Choice initial="spingere" changed={changed} />);
    fireEvent.click(screen.getByText("Tirando verso l’esterno"));
    expect(
      screen.getByRole("radio", { name: "Tirando verso l’esterno" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("radio", { name: "Spingendo verso l’interno" }),
    ).toHaveAttribute("aria-checked", "false");
    expect(changed).toHaveBeenCalledExactlyOnceWith("rv_door_swing", "tirare");
    expect(screen.queryByText("Campo obbligatorio")).not.toBeInTheDocument();
  });
  it("mantiene tastiera e focus Radix senza sostituire il radio con un’icona decorativa", async () => {
    render(<Choice initial="spingere" />);
    const first = screen.getByRole("radio", {
      name: "Spingendo verso l’interno",
    });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    await waitFor(() =>
      expect(
        screen.getByRole("radio", { name: "Tirando verso l’esterno" }),
      ).toHaveAttribute("aria-checked", "true"),
    );
  });
  it("separa il pallino di 16px dall’area tattile della scheda", () => {
    render(<Choice initial="tirare" />);
    const radio = screen.getByRole("radio", {
      name: "Tirando verso l’esterno",
    });
    expect(radio).toHaveClass("h-4", "w-4", "min-h-0", "min-w-0", "shrink-0");
    expect(radio.closest("label")).toHaveClass(
      "min-h-12",
      "rounded-xl",
      "border-blue-500",
    );
  });
  it("non aggira il blocco del form durante il salvataggio", () => {
    const changed = vi.fn();
    render(<Choice initial="spingere" disabled changed={changed} />);
    expect(
      screen.getByRole("radio", { name: "Tirando verso l’esterno" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByText("Tirando verso l’esterno"));
    expect(changed).not.toHaveBeenCalled();
  });
});
