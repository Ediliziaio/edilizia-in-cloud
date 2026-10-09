import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apriDocumentoDopoAttesa } from "@/lib/campo/apriDocumento";

/** La scheda si apre subito, dentro il tocco; il link ci arriva dopo. Altrimenti il telefono la blocca. */
const scheda = () => ({ opener: {} as unknown, closed: false, location: { replace: vi.fn() }, close: vi.fn() });
afterEach(() => vi.restoreAllMocks());

describe("apertura di un documento il cui link arriva dopo un'attesa", () => {
  it("apre la scheda PRIMA di chiedere il link, poi ci mette il link", async () => {
    const s = scheda();
    const ordine: string[] = [];
    const open = vi.spyOn(window, "open").mockImplementation(() => { ordine.push("scheda"); return s as unknown as Window; });
    const esito = await apriDocumentoDopoAttesa(async () => { ordine.push("link"); return "https://example.test/doc.pdf"; });
    expect(esito).toBe(true);
    expect(ordine).toEqual(["scheda", "link"]);
    expect(open).toHaveBeenCalledWith("", "_blank");
    expect(s.location.replace).toHaveBeenCalledWith("https://example.test/doc.pdf");
    expect(s.opener).toBeNull();
  });

  it("se il link non arriva chiude la scheda e dice di no", async () => {
    const s = scheda();
    vi.spyOn(window, "open").mockReturnValue(s as unknown as Window);
    expect(await apriDocumentoDopoAttesa(async () => null)).toBe(false);
    expect(s.close).toHaveBeenCalled();
    expect(s.location.replace).not.toHaveBeenCalled();
  });

  it("se la richiesta del link va in errore chiude la scheda e dice di no", async () => {
    const s = scheda();
    vi.spyOn(window, "open").mockReturnValue(s as unknown as Window);
    expect(await apriDocumentoDopoAttesa(async () => { throw new Error("rete"); })).toBe(false);
    expect(s.close).toHaveBeenCalled();
  });

  it("se il telefono non ha concesso la scheda, apre nella stessa finestra", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    expect(await apriDocumentoDopoAttesa(async () => "https://example.test/doc.pdf")).toBe(true);
    expect(assign).toHaveBeenCalledWith("https://example.test/doc.pdf");
    vi.unstubAllGlobals();
  });

  it("se la scheda è stata chiusa nel frattempo non ci scrive sopra", async () => {
    const s = { ...scheda(), closed: true };
    vi.spyOn(window, "open").mockReturnValue(s as unknown as Window);
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    expect(await apriDocumentoDopoAttesa(async () => "https://example.test/doc.pdf")).toBe(true);
    expect(s.location.replace).not.toHaveBeenCalled();
    expect(assign).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("le pagine che aprono un documento con un link a scadenza", () => {
  // Documenti HR, documenti del subappaltatore, foto di avanzamento: il link si ottiene con una chiamata,
  // quindi la scheda va aperta PRIMA. Un window.open dopo l'attesa, sul telefono, non apre niente.
  const pagine = [
    "src/pages/campo/CampoDocumenti.tsx",
    "src/pages/campo/subappaltatore/SubDocumenti.tsx",
    "src/pages/campo/CampoAvanzamento.tsx",
  ];
  for (const pagina of pagine) {
    it(`${pagina.split("/").pop()} usa apriDocumentoDopoAttesa e non apre schede dopo un'attesa`, () => {
      const sorgente = readFileSync(resolve(process.cwd(), pagina), "utf8");
      expect(sorgente).toContain("apriDocumentoDopoAttesa(");
      expect(sorgente).not.toContain("window.open(data.signedUrl");
      expect(sorgente).not.toMatch(/linkFileRiservato\([^)]*\)\.then\(\(?u\)?\s*=>\s*window\.open/);
    });
  }
});
