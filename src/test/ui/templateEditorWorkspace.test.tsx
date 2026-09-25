import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { readFileSync } from "node:fs";
import { TemplateEditorNavigation, TemplateEditorSaveBar, TemplateEditorWorkspace, templateEditorLayout } from "@/components/preventivi/TemplateEditorLayout";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Shared module workspace", () => {
  it("reveals the compact preview from an action inside the save bar", () => {
    vi.stubGlobal("requestAnimationFrame", vi.fn());
    render(<TemplateEditorWorkspace><div data-template-content><TemplateEditorSaveBar><button data-show-template-preview>Apri PDF</button></TemplateEditorSaveBar></div><aside data-template-preview>Documento</aside></TemplateEditorWorkspace>);
    fireEvent.click(screen.getByRole("button", { name: "Apri PDF" }));
    expect(screen.getByRole("button", { name: "Anteprima" })).toHaveAttribute("aria-pressed", "true");
    expect(requestAnimationFrame).toHaveBeenCalledOnce();
  });
  it("switches compact views without remounting the edited content", () => {
    function Draft() {
      const [text, setText] = useState("Originale");
      return <input aria-label="Testo da conservare" value={text} onChange={event => setText(event.target.value)} />;
    }
    const { container } = render(<TemplateEditorWorkspace>
      <TemplateEditorNavigation><nav><button>Copertina</button></nav></TemplateEditorNavigation>
      <section data-template-content><Draft /><TemplateEditorSaveBar><span>Modifiche non salvate</span><div><button>Salva</button></div></TemplateEditorSaveBar></section>
      <aside data-template-preview>PDF</aside>
    </TemplateEditorWorkspace>);
    const input = screen.getByRole("textbox", { name: "Testo da conservare" });
    fireEvent.change(input, { target: { value: "La mia modifica" } });
    fireEvent.click(screen.getByRole("button", { name: "Anteprima" }));
    expect(screen.getByRole("button", { name: "Anteprima" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Modifica" }));
    expect(screen.getByRole("textbox", { name: "Testo da conservare" })).toBe(input);
    expect(input).toHaveValue("La mia modifica");
    expect(container.querySelector("[data-template-save-bar]")).toHaveClass("flex-wrap", "sticky");
  });
  it("offers an accessible compact page chooser and closes it after a page choice", () => {
    render(<TemplateEditorNavigation><nav><button>Controlli di qualità</button></nav></TemplateEditorNavigation>);
    const chooser = screen.getByRole("button", { name: "Scegli la pagina da modificare" });
    expect(chooser).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(chooser);
    expect(chooser).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "Controlli di qualità" }));
    expect(chooser).toHaveAttribute("aria-expanded", "false");
  });
  it("uses consistent desktop proportions and wrapping controls", () => {
    expect(templateEditorLayout.navigation).toContain("xl:col-span-2");
    expect(templateEditorLayout.content).toContain("xl:col-span-6");
    expect(templateEditorLayout.preview).toContain("xl:col-span-4");
    expect(templateEditorLayout.saveBar).toContain("[&>div]:flex-wrap");
  });
  it.each(["bagni", "climatizzazione", "elettrico", "pavimenti", "piscine", "ristrutturazione", "termoidraulico", "tetti"])("%s adopts the shared workspace and forwards the selected page", area => {
    const name = area[0].toUpperCase() + area.slice(1);
    const source = readFileSync(`src/components/${area}/${name}TemplateEditor.tsx`, "utf8");
    expect(source).toContain("<TemplateEditorWorkspace moduleId={localModule?.id}>");
    expect(source).toContain("<TemplateEditorNavigation>");
    expect(source).toContain("<TemplateEditorSaveBar>");
    expect(source).toContain("data-template-content");
    expect(source).toContain("data-template-preview");
    expect(source).toContain("LivePreviewPanel activeSection={activeSection}");
  });
});
