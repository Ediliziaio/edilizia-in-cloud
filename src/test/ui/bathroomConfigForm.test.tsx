import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { BathroomConfigForm } from "@/components/render-bagno/BathroomConfigForm";
import { DEFAULT_BATHROOM_CONFIG } from "@/components/render-bagno/defaultBathroomConfig";

function renderForm(onChange: ReturnType<typeof vi.fn>) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <BathroomConfigForm
        value={structuredClone(DEFAULT_BATHROOM_CONFIG)}
        onChange={onChange}
      />,
    );
  });

  return {
    container,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function getButtonByText(container: HTMLElement, text: string) {
  const button = Array.from(container.querySelectorAll("button"))
    .find((item) => item.textContent?.includes(text));
  if (!button) throw new Error(`Button not found: ${text}`);
  return button;
}

describe("BathroomConfigForm", () => {
  it("renders material choices as touch-friendly selectable controls", () => {
    const onChange = vi.fn();
    const { container, cleanup } = renderForm(onChange);

    const selectedWallMaterial = getButtonByText(container, "Marmo Carrara");
    expect(selectedWallMaterial).toHaveAttribute("aria-pressed", "true");

    act(() => {
      getButtonByText(container, "Marmo Calacatta").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        piastrelle_parete: expect.objectContaining({
          effetto: "marmo_calacatta",
        }),
      }),
    );

    cleanup();
  });

  it("keeps free notes editable without resetting the current configuration", () => {
    const onChange = vi.fn();
    const { container, cleanup } = renderForm(onChange);

    const notes = container.querySelector("textarea");
    expect(notes).not.toBeNull();

    act(() => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      valueSetter?.call(notes, "Mantieni la luce naturale e non aggiungere decorazioni.");
      notes!.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo_intervento: DEFAULT_BATHROOM_CONFIG.tipo_intervento,
        note_libere: "Mantieni la luce naturale e non aggiungere decorazioni.",
      }),
    );

    cleanup();
  });
});
