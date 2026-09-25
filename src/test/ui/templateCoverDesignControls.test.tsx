import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { TemplateCoverDesignControls, COVER_DESIGN_CHOICES, type CoverDesignField } from "@/components/preventivi/TemplateCoverDesignControls";

afterEach(cleanup);
describe("shared cover design controls", () => {
  it("does not emit changes on mount, including saved values outside current slider limits", () => {
    const change = vi.fn();
    render(<TemplateCoverDesignControls hasImage fields={[{ id: "titleSize", kind: "range", value: 70, min: 20, max: 64, unit: "pt", onChange: change }]} />);
    expect(screen.getByRole("spinbutton", { name: "Dimensione titolo (pt)" })).toHaveValue(70);
    expect(change).not.toHaveBeenCalled();
  });
  it("allows intermediate typing, commits on blur and bounds an explicit edit", () => {
    const change = vi.fn();
    render(<TemplateCoverDesignControls hasImage fields={[{ id: "titleSize", kind: "range", value: 30, min: 20, max: 64, unit: "pt", onChange: change }]} />);
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "3" } });
    expect(input).toHaveValue(3); expect(change).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "36" } }); fireEvent.blur(input);
    expect(change).toHaveBeenLastCalledWith(36);
    fireEvent.change(input, { target: { value: "999" } }); fireEvent.keyDown(input, { key: "Enter" });
    expect(change).toHaveBeenLastCalledWith(64);
    change.mockClear(); fireEvent.change(input, { target: { value: "" } }); fireEvent.blur(input);
    expect(change).not.toHaveBeenCalled(); expect(input).toHaveValue(30);
  });
  it("orders controls identically and preserves a legacy choice until the user changes it", () => {
    const change = vi.fn();
    const { container } = render(<TemplateCoverDesignControls hasImage fields={[
      { id: "logoPosition", kind: "choice", value: "custom", choices: COVER_DESIGN_CHOICES.logoPosition, onChange: change },
      { id: "titleSize", kind: "range", value: 30, min: 20, max: 64, unit: "pt", onChange: vi.fn() },
    ]} />);
    expect([...container.querySelectorAll('[data-cover-design-field]')].map(el => el.getAttribute('data-cover-design-field'))).toEqual(["titleSize", "logoPosition"]);
    expect(screen.getByRole("combobox", { name: "Posizione logo" })).toHaveValue("custom");
    expect(change).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "top_center" } });
    expect(change).toHaveBeenCalledExactlyOnceWith("top_center");
  });
  it("disables irrelevant controls without clearing the saved configuration", () => {
    const change = vi.fn();
    const fields: CoverDesignField[] = [
      { id: "overlayOpacity", kind: "range", value: 65, min: 0, max: 100, unit: "%", onChange: change },
      { id: "logoPosition", kind: "choice", value: "hidden", choices: COVER_DESIGN_CHOICES.logoPosition, onChange: change },
      { id: "logoSize", kind: "range", value: 100, min: 60, max: 160, unit: "%", onChange: change },
      { id: "showDecoration", kind: "toggle", value: false, onChange: change },
      { id: "decorationStyle", kind: "choice", value: "circle", choices: COVER_DESIGN_CHOICES.decorationStyle, onChange: change },
    ];
    render(<TemplateCoverDesignControls hasImage={false} fields={fields} />);
    expect(screen.getByRole("spinbutton", { name: "Intensità velo scuro (%)" })).toBeDisabled();
    expect(screen.getByRole("spinbutton", { name: "Dimensione logo (%)" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Stile decorazione" })).toBeDisabled();
    expect(change).not.toHaveBeenCalled();
  });
  it("keeps inherited colors unset and exposes an explicit reset", () => {
    const change = vi.fn(), reset = vi.fn();
    render(<TemplateCoverDesignControls hasImage fields={[{ id: "titleColor", kind: "color", value: "#123456", fallback: "#FFFFFF", onChange: change, onReset: reset }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Ripristina colore titolo" }));
    expect(reset).toHaveBeenCalledOnce(); expect(change).not.toHaveBeenCalled();
    expect(screen.getByText(/contrasto reale va verificato/)).toBeInTheDocument();
  });
  it.each(Object.entries({ bagni: "Bagni", tetti: "Tetti", climatizzazione: "Climatizzazione", termoidraulico: "Termoidraulico", elettrico: "Elettrico", pavimenti: "Pavimenti", piscine: "Piscine", ristrutturazione: "Ristrutturazione", serramenti: "Serramenti", fotovoltaico: "Fotovoltaico", facciate: "Facciate" }))("%s uses exactly one shared design panel", (area, name) => {
    const source = readFileSync(`src/components/${area}/${name}TemplateEditor.tsx`, "utf8");
    expect(source.match(/<TemplateCoverDesignControls\b/g)).toHaveLength(1);
    for (const id of ["eyebrowSize", "titleSize", "subtitleSize", "textAlign", "textVertical", "textColor", "overlayOpacity", "overlayStyle", "logoPosition", "showDecoration", "decorationStyle", "showClientCard"]) {
      expect(source.match(new RegExp(`id:\\s*"${id}"`, "g")), `${area}: ${id} must appear exactly once`).toHaveLength(1);
    }
    expect(source).toContain("COVER_DESIGN_CHOICES.textAlign");
    expect(source).toContain("COVER_DESIGN_CHOICES.logoPosition");
  });
});
