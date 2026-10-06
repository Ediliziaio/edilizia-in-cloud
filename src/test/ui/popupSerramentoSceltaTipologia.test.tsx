/**
 * Il primo passo del popup «Aggiungi serramento» (e la scelta della linea e del prodotto): schede basse, tutte
 * visibili senza scorrere, con la miniatura giusta.
 *
 * Prima ogni tipologia era un riquadro di ~260×255 px quasi tutto vuoto (la foto non c'è quasi mai): su tre colonne
 * se ne vedevano due righe e le altre stavano sotto il bordo del popup. Ora la scheda ha una tessera piccola con, in
 * ordine: la foto, se c'è; il disegno automatico del primo prodotto che ce l'ha; un'icona piccola. Il popup è
 * montato per davvero con un listino finto che ha tutti e tre i casi.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { articoloEsempio, asseEsempio, valoreEsempio } from "@/lib/listino/esempiListino";
import type { MacroListino } from "@/lib/listino/lineeListino";
import { finestraSalamander } from "../fixtures/finestraSalamander";

const { dati } = vi.hoisted(() => ({
  dati: { famiglie: [] as unknown[], macro: [] as unknown[], nessuno: [] as unknown[] },
}));

vi.mock("@/hooks/useFamilies", () => ({ useFamilies: () => ({ families: dati.famiglie, isLoading: false }) }));
vi.mock("@/hooks/useListinoMacrocategorie", () => ({ useListinoMacrocategorie: () => ({ macrocategorie: dati.macro, isLoading: false }) }));
vi.mock("@/hooks/useListinoCategorie", () => ({ useListinoCategorie: () => ({ categorie: dati.nessuno, isLoading: false }) }));
vi.mock("@/hooks/useSchedeLinea", () => ({ useSchedeLinea: () => ({ indice: new Map() }) }));
vi.mock("@/lib/serramenti/queries", () => ({
  useListinoGriglia: () => ({ data: dati.nessuno, isLoading: false }),
  useTariffeManodopera: () => ({ data: dati.nessuno }),
}));
vi.mock("@/features/serramenti-listini/hooks/useSupplierProductLines", () => ({
  useSupplierProductLines: () => ({ lines: dati.nessuno, isLoading: false }),
}));

import { ListinoPickerDialog } from "@/components/serramenti/ListinoPickerDialog";

beforeAll(() => {
  if (!("ResizeObserver" in globalThis)) {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture ?? (() => false);
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture ?? (() => {});
});

const macro = (id: string, nome: string, ordine: number, extra: Partial<MacroListino> = {}) =>
  ({ id, nome, verticali_abilitati: ["serramentista"], categoria_tipo: "principale", attivo: true, sort_order: ordine, ...extra }) as unknown as MacroListino;

const FOTO_PERSIANE = "https://img.test/persiane.jpg";
const FOTO_CASSONETTO = "https://img.test/cassonetto.jpg";

beforeEach(() => {
  dati.macro = [
    macro("m-serr", "Serramenti", 0), // col disegno automatico, senza foto
    macro("m-pers", "Persiane e scuri", 1, { immagine_url: FOTO_PERSIANE }), // la foto è della tipologia
    macro("m-zanz", "Zanzariere", 2), // né foto né disegno
    macro("m-tapp", "Tapparelle", 3), // due linee
    macro("m-cass", "Cassonetti", 4), // la foto è del prodotto
  ];
  dati.famiglie = [
    finestraSalamander("f2a", { macrocategoria_id: "m-serr" }),
    articoloEsempio("pers", "Persiana 2 ante", { macrocategoria_id: "m-pers", modalita_prezzo_base: "mq", prezzo_base_vendita: 250 }),
    articoloEsempio("zanz", "Zanzariera a molla", { macrocategoria_id: "m-zanz", modalita_prezzo_base: "mq", prezzo_base_vendita: 70 }),
    articoloEsempio("tapp", "Tapparella PVC", {
      macrocategoria_id: "m-tapp",
      modalita_prezzo_base: "mq",
      prezzo_base_vendita: 90,
      axes: [asseEsempio("tapp-linea", "Linea", [valoreEsempio("tapp-pvc", "PVC", { is_default: true }), valoreEsempio("tapp-alu", "Alluminio", { sort_order: 1 })])],
    }),
    articoloEsempio("cass", "Cassonetto termoisolato", { macrocategoria_id: "m-cass", modalita_prezzo_base: "mq", prezzo_base_vendita: 150, immagine_url: FOTO_CASSONETTO }),
  ];
});
afterEach(() => cleanup());

const apri = () => render(<ListinoPickerDialog open onOpenChange={vi.fn()} onSelect={vi.fn()} />);

/** La scheda di una tipologia (o di una linea) dal suo nome. */
const scheda = (nome: string) => screen.getByText(nome, { selector: "p" }).closest("button") as HTMLElement;
/** La tessera della scheda: la foto, il disegno o l'icona. */
const tessera = (b: HTMLElement) => b.querySelector("[data-miniatura]") as HTMLElement;

describe("popup: scelta della tipologia", () => {
  it("la tessera è la foto se c'è, altrimenti il disegno del primo prodotto che ce l'ha, altrimenti un'icona", async () => {
    apri();
    await screen.findByText("Persiane e scuri", { selector: "p" });

    // Il disegno automatico della finestra: l'SVG, niente foto.
    const serramenti = tessera(scheda("Serramenti"));
    expect(serramenti.dataset.miniatura).toBe("disegno");
    expect(serramenti.querySelector("svg[role=img]")).toBeTruthy();
    expect(serramenti.querySelector("img")).toBeNull();

    // La foto della tipologia, e quella del primo prodotto quando la tipologia non ne ha.
    const persiane = tessera(scheda("Persiane e scuri"));
    expect(persiane.dataset.miniatura).toBe("foto");
    expect(persiane.querySelector("img")?.getAttribute("src")).toBe(FOTO_PERSIANE);
    const cassonetti = tessera(scheda("Cassonetti"));
    expect(cassonetti.dataset.miniatura).toBe("foto");
    expect(cassonetti.querySelector("img")?.getAttribute("src")).toBe(FOTO_CASSONETTO);

    // Né foto né disegno: un'icona piccola, non un riquadro vuoto.
    const zanzariere = tessera(scheda("Zanzariere"));
    expect(zanzariere.dataset.miniatura).toBe("icona");
    expect(zanzariere.querySelector("img")).toBeNull();
    expect(zanzariere.querySelector("svg[role=img]")).toBeNull();
    expect(zanzariere.querySelector("svg")).toBeTruthy();
  });

  it("le schede sono basse (mai i riquadri alti quanto una scheda) e stanno su più colonne: 2 da telefono, 3 da tablet", async () => {
    apri();
    await screen.findByText("Persiane e scuri", { selector: "p" });
    for (const nome of ["Serramenti", "Persiane e scuri", "Zanzariere", "Tapparelle", "Cassonetti"]) {
      const b = scheda(nome);
      expect(b.querySelector('[class*="aspect-"]'), nome).toBeNull();
      // la tessera è una tessera: ~56-64 px, non a tutta scheda
      expect(tessera(b).className).toMatch(/\bh-14\b/);
      expect(tessera(b).className).not.toMatch(/\bh-(2|3|4|5|6)\d\b/);
    }
    const griglia = scheda("Serramenti").parentElement as HTMLElement;
    expect(griglia.className).toContain("grid-cols-2");
    expect(griglia.className).toContain("sm:grid-cols-3");
  });

  it("nome e numero dei prodotti si leggono sulla scheda; la scheda è un bottone (tastiera) col suo segno di focus", async () => {
    apri();
    await screen.findByText("Persiane e scuri", { selector: "p" });
    expect(screen.getByRole("button", { name: /^Serramenti\s*1 prodotto/ })).toBeTruthy();
    const tapparelle = scheda("Tapparelle");
    expect(tapparelle.textContent).toMatch(/1 prodotto/);
    expect(tapparelle.textContent).toMatch(/2 linee/);
    tapparelle.focus();
    expect(document.activeElement).toBe(tapparelle);
    expect(tapparelle.className).toContain("focus-visible:ring-2");
    expect(tapparelle.className).toMatch(/min-h-\[?(44|56|60|64|72)/);
  });

  it("niente funzioni perse: la ricerca trova, la scelta avanza, «Indietro» torna alle tipologie", async () => {
    apri();
    await screen.findByText("Persiane e scuri", { selector: "p" });
    fireEvent.change(screen.getByPlaceholderText("Cerca per nome, codice o linea…"), { target: { value: "Persiana" } });
    // La ricerca guarda dopo 300 ms.
    const trovata = await screen.findByText("Persiana 2 ante", {}, { timeout: 3000 });
    expect(trovata).toBeTruthy();
    expect(screen.queryByText("Zanzariere", { selector: "p" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Pulisci" }));
    await screen.findByText("Zanzariere", { selector: "p" });

    // Una tipologia con una linea sola porta ai prodotti; da lì «Indietro» riporta alle tipologie.
    fireEvent.click(scheda("Zanzariere"));
    await screen.findByText("Zanzariera a molla", { selector: "p" });
    fireEvent.click(screen.getByRole("button", { name: "Indietro" }));
    await screen.findByText("Cassonetti", { selector: "p" });
  });
});

describe("popup: scelta della linea e del prodotto", () => {
  it("anche le linee hanno la tessera piccola (foto, disegno o icona) e stanno su più colonne", async () => {
    apri();
    fireEvent.click((await screen.findByText("Tapparelle", { selector: "p" })).closest("button") as HTMLElement);
    // Due linee: prima si sceglie la linea.
    const pvc = await screen.findByText("PVC", { selector: "p" });
    const alluminio = screen.getByText("Alluminio", { selector: "p" });
    for (const nome of [pvc, alluminio]) {
      const b = nome.closest("button") as HTMLElement;
      expect(b.querySelector('[class*="aspect-"]')).toBeNull();
      expect(tessera(b).dataset.miniatura).toBe("icona");
      expect(tessera(b).className).toMatch(/\bh-14\b/);
    }
    expect((pvc.closest("button") as HTMLElement).parentElement?.className).toContain("grid-cols-2");
    // Scelta la linea si arriva ai suoi prodotti.
    fireEvent.click(pvc.closest("button") as HTMLElement);
    await screen.findByText("Tapparella PVC", { selector: "p" });
  });

  it("un prodotto senza foto né disegno ha un segnaposto basso, non un riquadro alto quanto la scheda", async () => {
    apri();
    fireEvent.click((await screen.findByText("Zanzariere", { selector: "p" })).closest("button") as HTMLElement);
    const prodotto = (await screen.findByText("Zanzariera a molla", { selector: "p" })).closest("button") as HTMLElement;
    const segnaposto = prodotto.firstElementChild as HTMLElement;
    expect(segnaposto.className).toMatch(/\bh-14\b/);
    expect(segnaposto.className).not.toMatch(/sm:h-32/);
  });

  it("il prodotto col disegno automatico mostra il disegno, e si arriva alle misure come prima", async () => {
    apri();
    fireEvent.click((await screen.findByText("Serramenti", { selector: "p" })).closest("button") as HTMLElement);
    const finestra = (await screen.findByText("Finestra 2 Ante", { selector: "p" })).closest("button") as HTMLElement;
    expect(within(finestra).getByRole("img")).toBeTruthy();
    fireEvent.click(finestra);
    await waitFor(() => expect(screen.getByText("Variabili Prodotto")).toBeTruthy());
  });
});
