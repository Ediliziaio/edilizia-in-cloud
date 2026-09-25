import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SerramentiCoverLayoutPicker } from "@/components/serramenti/SerramentiCoverLayoutPicker";
import { serramentiCoverLayout, withSerramentiCoverLayout } from "@/lib/moduli-vendita/serramentiCoverLayout";
import { createFullSerramentiTemplate, FULL_SERRAMENTI_MODULES, upgradeSerramentiModuleTemplate } from "@/lib/moduli-vendita/fullSerramentiModules";

afterEach(cleanup);
describe("Serramenti shared editorial cover", () => {
  it.each(FULL_SERRAMENTI_MODULES)("new %s has the shared cover and reset snapshot", id => {
    const template = createFullSerramentiTemplate({ company_id: "test" }, id);
    expect(serramentiCoverLayout(template.pdf_blocchi)).toBe("editoriale-v1");
    expect(serramentiCoverLayout(template.pdf_blocchi?.modulo_defaults)).toBe("editoriale-v1");
  });
  it("keeps old and unknown versions classic, without mutation on mount", () => {
    expect(serramentiCoverLayout(null)).toBe("classico");
    expect(serramentiCoverLayout({ copertina_layout: "future" })).toBe("classico");
    const onChange = vi.fn();
    render(<SerramentiCoverLayoutPicker value={{ comeFunziona: { titolo: "Testo nostro" } }} onChange={onChange} />);
    expect((screen.getByRole("radio", { name: /Classico Serramenti/ }) as HTMLInputElement).checked).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });
  it("changes only layout and can return to the previous composition", () => {
    const blocks = { comeFunziona: { titolo: "Testo nostro", foto: ["/foto-mia.jpg"] }, other: false };
    const onChange = vi.fn();
    render(<SerramentiCoverLayoutPicker value={blocks} onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: /Editoriale/ }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...blocks, copertina_layout: "editoriale-v1" });
    const next = withSerramentiCoverLayout(onChange.mock.calls[0][0], "classico");
    expect(next).toEqual({ ...blocks, copertina_layout: "classico" });
    expect(blocks).not.toHaveProperty("copertina_layout");
  });
  it("upgrading content preserves the saved cover version", () => {
    const base = { company_id: "test" };
    const saved = createFullSerramentiTemplate(base, "finestre");
    delete saved.pdf_blocchi!.copertina_layout;
    expect(serramentiCoverLayout(upgradeSerramentiModuleTemplate(saved, base, "finestre").pdf_blocchi)).toBe("classico");
    saved.pdf_blocchi = withSerramentiCoverLayout(saved.pdf_blocchi, "classico");
    expect(serramentiCoverLayout(upgradeSerramentiModuleTemplate(saved, base, "finestre").pdf_blocchi)).toBe("classico");
  });
});
