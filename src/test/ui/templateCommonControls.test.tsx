import { createRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { TemplateCoverTextFields, TemplateCoverStylePicker } from "@/components/preventivi/TemplateCoverControls";
import { coverStyleOnly, detectCoverStyle } from "@/lib/preventivi/templateCoverStyle";
import { TemplateImageFieldView } from "@/components/preventivi/TemplateImageFieldView";
import { TemplateRowsEditor, TemplateSectionCard } from "@/components/preventivi/TemplateContentControls";
import { templateEditorLayout } from "@/components/preventivi/TemplateEditorLayout";

afterEach(cleanup);

describe("common editor contract", () => {
  it("keeps titles multiline and distinguishes a dynamic subtitle without mutating other text", () => {
    const change = vi.fn();
    render(<TemplateCoverTextFields value={{ title: "Titolo\nSeconda riga", subtitle: "Sintesi", dynamicSubtitle: "Per {cliente_nome}" }} onChange={change} dynamicSubtitle />);
    expect(screen.getByRole("textbox", { name: "Titolo copertina" }).tagName).toBe("TEXTAREA");
    fireEvent.change(screen.getByLabelText("Titolo copertina"), { target: { value: "Nuovo\nTitolo" } });
    expect(change).toHaveBeenCalledExactlyOnceWith("title", "Nuovo\nTitolo");
    expect(screen.getByLabelText("Sottotitolo dinamico")).toHaveValue("Per {cliente_nome}");
  });

  it("starts compact and applies only the selected style on an explicit click", () => {
    const apply = vi.fn(), presets = [{ id: "one", nome: "Primo", descrizione: "Stile chiaro", tag: "Editoriale", swatchBg: "#fff", swatchText: "#111" }];
    const { container } = render(<TemplateCoverStylePicker presets={presets} activeId="one" onApply={apply} />);
    expect(container.querySelector("details")).not.toHaveAttribute("open");
    expect(apply).not.toHaveBeenCalled();
    container.querySelector("details")!.open = true;
    fireEvent.click(screen.getByRole("button", { name: "Applica stile Primo" }));
    expect(apply).toHaveBeenCalledExactlyOnceWith("one");
  });

  it.each([null, "", "/personalizzata.jpg"])("never restores/deletes media when style changes (photo = %s)", photo => {
    const original = { pdf_cover_image_url: photo, cover_image_url: photo, title: "Titolo mio", private_extra: { keep: true } };
    const patch = { pdf_cover_image_url: "/stock.jpg", cover_image_url: null as null, color: "red" };
    const next = { ...original, ...coverStyleOnly(patch) };
    expect(next).toEqual({ ...original, color: "red" });
    expect(patch.pdf_cover_image_url).toBe("/stock.jpg");
    expect(detectCoverStyle(next, [{ id: "red", patch }])).toBe("red");
  });

  it("keeps the sticky positioning on grid siblings, not their short inner containers", () => {
    expect(templateEditorLayout.preview).toContain("xl:sticky");
    expect(templateEditorLayout.navigation).toContain("md:sticky");
    expect(templateEditorLayout.previewPanel).not.toContain("sticky");
    expect(templateEditorLayout.navigationPanel).not.toContain("sticky");
  });

  it("uses accessible multiline rows and preserves metadata through edit, reorder and deletion", () => {
    const initial = [{ title: "Prima", description: "Uno", hidden: { keep: 1 } }, { title: "Seconda", description: "Due", hidden: { keep: 2 } }];
    const changed = vi.fn();
    function Harness() {
      const [items, setItems] = useState(initial);
      return <TemplateRowsEditor items={items} onChange={next => { changed(next); setItems(next); }} fields={[{ key: "title", label: "Titolo" }, { key: "description", label: "Descrizione", multiline: true }]} empty={{ title: "", description: "", hidden: { keep: 0 } }} itemLabel="Voce" addLabel="Aggiungi voce" emptyMessage="Vuoto" />;
    }
    render(<Harness />);
    expect(changed).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Descrizione 1"), { target: { value: "Testo\nlungo" } });
    expect(changed.mock.lastCall![0][0].hidden).toEqual({ keep: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Sposta giù voce 1" }));
    expect(screen.getByLabelText("Titolo 1")).toHaveValue("Seconda");
    expect(screen.getByLabelText("Descrizione 2")).toHaveValue("Testo\nlungo");
    fireEvent.click(screen.getByRole("button", { name: "Rimuovi voce 1" }));
    expect(changed.mock.lastCall![0]).toEqual([{ ...initial[0], description: "Testo\nlungo" }]);
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi voce" }));
    expect(screen.getByLabelText("Titolo 2")).toHaveValue("");
    expect(initial[0].description).toBe("Uno");
  });

  it("gives visibility switches the same explicit page name", () => {
    const change = vi.fn();
    render(<TemplateSectionCard icon={() : null => null} title="Chi siamo" toggle={{ value: true, onChange: change, label: "Mostra nel PDF" }}>Contenuto</TemplateSectionCard>);
    fireEvent.click(screen.getByRole("switch", { name: "Mostra nel PDF: Chi siamo" }));
    expect(change).toHaveBeenCalledWith(false);
  });

  it("states the real local file limit, signals a broken image and disables changes during upload", () => {
    const remove = vi.fn(), file = vi.fn();
    const props = { label: "Foto test", value: "/missing.jpg", localOnly: true, busy: false, inputRef: createRef<HTMLInputElement>(), onFile: file, onRemove: remove };
    const { rerender } = render(<TemplateImageFieldView {...props} hint="PNG/JPG max 8 MB" />);
    expect(screen.queryByText(/max 8 MB/)).not.toBeInTheDocument();
    fireEvent.error(screen.getByRole("img", { name: "Foto test" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Immagine non disponibile");
    rerender(<TemplateImageFieldView {...props} value="/valid.jpg" busy />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rimuovi foto test" })).toBeDisabled();
    expect(screen.getByLabelText("Carica foto test")).toBeDisabled();
    rerender(<TemplateImageFieldView {...props} value="/valid.jpg" />);
    fireEvent.click(screen.getByRole("button", { name: "Rimuovi foto test" }));
    expect(remove).toHaveBeenCalledOnce();
  });

  it.each(["bagni", "climatizzazione", "elettrico", "pavimenti", "piscine", "ristrutturazione", "termoidraulico", "tetti", "serramenti", "fotovoltaico", "facciate"])("%s adopts common cover controls without a second cover renderer", area => {
    const source = readFileSync(`src/components/${area}/${area[0].toUpperCase()+area.slice(1)}TemplateEditor.tsx`, "utf8");
    expect(source).toContain("<TemplateCoverTextFields");
    expect(source).toContain("<TemplateCoverStylePicker");
    expect(source).not.toMatch(/<(?:CopertinaAnteprima|CoverPreview)\b/);
    expect(source).not.toContain("Anteprima approssimativa");
  });
});
