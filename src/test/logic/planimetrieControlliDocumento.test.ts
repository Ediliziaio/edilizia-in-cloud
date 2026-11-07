import { describe, expect, it } from "vitest";
import bilocale from "../../../shared/planimetrie/esempi/bilocale.json";
import { validaPlanimetria, type Planimetria } from "../../../shared/planimetrie/modello.ts";
import { controlliDalDocumento } from "../../../shared/planimetrie/letturaDocumento.ts";
import { salvaPianta } from "@/components/planimetrie/editor/salvataggio";

function documento() {
  const doc = structuredClone(bilocale) as unknown as Planimetria;
  const c = doc.livelli[0].fatto.locali[0];
  c.nome = "Bagno"; c.contorno = [{ x: 0, y: 0 }, { x: 250, y: 0 }, { x: 250, y: 240 }, { x: 0, y: 240 }];
  doc.letturaDocumento = { avvisiIniziali: ["Una possibile apertura non è stata inserita.", "Alcune superfici non corrispondono ai metri quadri scritti: vecchio valore"], superficiScritteMq: { [c.id]: 5 } };
  return doc;
}

describe("controlli dal documento fino al salvataggio e al fascicolo", () => {
  it("conserva gli avvisi nella prima versione e nelle modifiche successive", async () => {
    let salvato: Planimetria | undefined;
    const archivio = { crea: async (d: { documento?: Planimetria }) => { salvato = d.documento; return "casa"; }, salva: async (d: { documento: Planimetria }) => { salvato = d.documento; return 2; } };
    const doc = documento();
    await salvaPianta(archivio, { companyId: "azienda", documento: doc, titolo: "Casa" });
    expect(salvato?.letturaDocumento).toEqual(doc.letturaDocumento);
    const riletto = JSON.parse(JSON.stringify(salvato)) as Planimetria;
    expect(validaPlanimetria(riletto).ok).toBe(true);
    await salvaPianta(archivio, { companyId: "azienda", documento: riletto, planimetriaId: "casa", versioneAttesa: 1 });
    expect(controlliDalDocumento(salvato!).join(" ")).toContain("5 m² scritti sul documento, 6 m² nel disegno attuale");
  });
  it("dopo la correzione non mostra più il vecchio scarto di superficie", () => {
    const doc = documento();
    doc.livelli[0].fatto.locali[0].contorno = [{ x: 0, y: 0 }, { x: 250, y: 0 }, { x: 250, y: 200 }, { x: 0, y: 200 }];
    expect(controlliDalDocumento(doc)).toEqual(["Alla lettura iniziale: Una possibile apertura non è stata inserita."]);
  });
  it("segnala anche uno scarto del 7% e distingue lo storico dal controllo attuale", () => {
    const doc = documento();
    const c = doc.livelli[0].fatto.locali[0];
    c.contorno = [{ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 500, y: 428 }, { x: 0, y: 428 }];
    doc.letturaDocumento!.superficiScritteMq[c.id] = 20;
    expect(controlliDalDocumento(doc)[0]).toContain("21,4 m² nel disegno attuale");
  });
  it("rifiuta metadati malformati invece di perderli durante il salvataggio", () => {
    const doc = documento();
    expect(validaPlanimetria({ ...doc, letturaDocumento: { avvisiIniziali: "testo", superficiScritteMq: {} } }).ok).toBe(false);
    expect(validaPlanimetria({ ...doc, letturaDocumento: { avvisiIniziali: [], superficiScritteMq: { stanza: -2 } } }).ok).toBe(false);
  });
});
