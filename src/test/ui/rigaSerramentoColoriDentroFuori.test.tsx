/**
 * La riga già aggiunta in «Composizione offerta» (SerramentoRow) montata per davvero: fra le variabili, al posto di
 * «Colore», due tendine, interno ed esterno; niente casella «diverso dentro e fuori» né campi colore sotto. Le righe
 * già salvate (monocolore, pellicola su un lato, colori scritti a mano, variante tolta dal listino) si riaprono giuste
 * e non perdono niente; il prezzo segue la fascia scelta toccando una tendina (la più cara dei due lati) e una riga già
 * salvata non lo cambia mai da sola: né con le misure, né con i pezzi, né perché un testo scritto coincide con un
 * colore del listino. In fondo a ogni tendina c'è «Altro colore (scrivi)…»; il disegno legge i due colori e il telaio a Z.
 */
import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FamilyWithAxes } from "@/types/articleFamily";
import type { SrSerramentoRow } from "@/types/serramenti";
import { articoloEsempio, asseEsempio, valoreEsempio } from "@/lib/listino/esempiListino";
import { comeListinoFamily } from "@/lib/serramenti/pickerListino";
import { schedaPosizione, scelteDaAssi } from "@/lib/serramenti/schedaPosizione";
import { MACRO_SERRAMENTI, finestraSalamander, idColore, prodottoSenzaColore } from "../fixtures/finestraSalamander";
import { CHIAVE_CATALOGO_COLORI, catalogoVuoto } from "@/lib/serramenti/catalogoColori";

const { dati } = vi.hoisted(() => ({ dati: { famiglie: [] as unknown[], nessuno: [] as unknown[] } }));

vi.mock("@/lib/serramenti/queries", () => ({ useListinoGriglia: () => ({ data: dati.nessuno, isLoading: false }), useMacroFields: () => ({ data: dati.nessuno, isLoading: false }) }));
vi.mock("@/hooks/useFamilies", () => ({
  useFamily: (id: string | null | undefined) => ({ family: (dati.famiglie as FamilyWithAxes[]).find((f) => f.id === id) ?? null, isLoading: false }),
}));
vi.mock("@/hooks/useSchedeLinea", () => ({ useSchedeLinea: () => ({ indice: new Map() }) }));
vi.mock("@/hooks/useListinoCategorie", () => ({ useListinoCategorie: () => ({ categorie: dati.nessuno, isLoading: false }) }));

import { BulkAssiActions, SerramentoRow, type RichiestaBulkColore } from "@/components/serramenti/StepBom";

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

beforeEach(() => {
  dati.famiglie = [finestraSalamander("f2a")];
  localStorage.clear();
});
afterEach(() => cleanup());

const POINTER = { button: 0, ctrlKey: false, pointerType: "mouse" } as const;
const NOCE = "21 - Nussbaum (noce)";
const GREY = "97 - mattGrey_cleanCOOL (grigio opaco)";
const NERO_U = "98 - Schwarz Ulti-Matt - Premium plus (nero ultra opaco)";

/** Una posizione già salvata, come la scrive il preventivo: 1200 × 1400, a mq 600 €/m² = 1.008 €. */
function posizione(extra: Partial<SrSerramentoRow> = {}, famiglia = "f2a"): SrSerramentoRow {
  const c = idColore(famiglia);
  return {
    id: "r1", progetto_id: "p", company_id: "c", position: 0, tipologia: "finestra_2ante", tipologia_label: "Finestra 2 Ante",
    ambiente: null, materiale: null, serie: null, vetro: null, vetro_specs: null, apertura: null,
    colore_interno: null, colore_esterno: null, larghezza_mm: 1200, altezza_mm: 1400, quantita: 1, metri_quadri: 1.68,
    family_id: famiglia, macrocategoria_override_id: null, listino_voce_id: null, supplier_catalog_id: null, supplier_product_line_id: null,
    prezzo_unitario: 1008, prezzo_totale: 1008,
    valori_assi: { colore: c.bianco, telaio: `${famiglia}-telaio-l` }, scelte_assi: {},
    foto_storage_path: null, foto_render_path: null, note: null, posa_esclusa: false, created_at: "", updated_at: "",
    ...extra,
  } as SrSerramentoRow;
}

type Patch = Partial<SrSerramentoRow>;

/** La riga con lo stato in mano, come fa il wizard: ogni modifica arriva a `onPatch` e la riga si aggiorna. */
function Riga({ iniziale, onPatch, richiestaBulkColore = null, famiglia }: { iniziale: SrSerramentoRow; onPatch: (p: Patch) => void; richiestaBulkColore?: RichiestaBulkColore | null; famiglia?: FamilyWithAxes }) {
  const [riga, setRiga] = useState(iniziale);
  const f = famiglia ?? (dati.famiglie as FamilyWithAxes[]).find((x) => x.id === riga.family_id);
  return (
    <SerramentoRow
      serramento={riga}
      index={0}
      expanded
      onToggle={() => {}}
      onPatch={(p) => { onPatch(p); setRiga((r) => ({ ...r, ...p })); }}
      onDuplicate={() => {}}
      onDelete={() => {}}
      family={f ? comeListinoFamily(f) : undefined}
      macroId={f?.macrocategoria_id ?? undefined}
      macroNome="Serramenti"
      tariffePrezzi={new Map()}
      supplierLineMap={new Map()}
      richiestaBulk={null}
      richiestaBulkColore={richiestaBulkColore}
      richiestaBulkPosa={null}
    />
  );
}

function monta(riga: SrSerramentoRow, extra: { richiestaBulkColore?: RichiestaBulkColore | null; famiglia?: FamilyWithAxes } = {}) {
  const onPatch = vi.fn<(p: Patch) => void>();
  render(<Riga iniziale={riga} onPatch={onPatch} {...extra} />);
  return onPatch;
}

async function scegli(tendina: string, opzione: string) {
  fireEvent.pointerDown(await screen.findByRole("combobox", { name: tendina }), POINTER);
  fireEvent.click((await screen.findAllByRole("option", { name: opzione }))[0]);
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
}

const testoDi = (tendina: string) => screen.getByRole("combobox", { name: tendina }).textContent ?? "";

const vista = (nome: "interna" | "esterna") =>
  screen.getAllByRole("img").find((el) => (el.getAttribute("aria-label") ?? "").includes(`vista ${nome}`)) as unknown as SVGElement;
const tinte = (svg: SVGElement) => new Set([...svg.querySelectorAll("polygon, path")].map((e) => e.getAttribute("fill")).filter((f): f is string => !!f && f.startsWith("#")));
const ANTRACITE = "#383e42";
const BIANCO = "#f1ece1";

describe("riga del preventivo: «Colore» sono due tendine", () => {
  it("una combinazione da quotare aggiorna il colore senza inventare un prezzo", async () => {
    dati.famiglie = [finestraSalamander("f2a", { custom_field_values: { [CHIAVE_CATALOGO_COLORI]: { ...catalogoVuoto(), modalita: "combinazioni" } } })];
    const onPatch = monta(posizione());
    await scegli("Colore esterno", NOCE);
    const patch = onPatch.mock.calls.at(-1)![0];
    expect(patch.colore_esterno).toBe(NOCE);
    expect(patch.prezzo_unitario).toBeUndefined();
    expect(JSON.parse(patch.valori_assi!.__colore_esterno).valueId).toBe(idColore("f2a").standard);
    expect(screen.getByText(/Combinazione interno\/esterno da quotare/)).toBeInTheDocument();
  });
  it("un catalogo corrotto non modifica il prezzo storico quando cambia il colore", async () => {
    dati.famiglie = [finestraSalamander("f2a", { custom_field_values: { [CHIAVE_CATALOGO_COLORI]: { versione: 99 } } })];
    const onPatch = monta(posizione());
    await scegli("Colore esterno", NOCE);
    expect(onPatch.mock.calls.at(-1)![0].prezzo_unitario).toBeUndefined();
    expect(screen.getByRole("alert")).toHaveTextContent("prezzo salvato resta invariato");
  });
  it("fra le variabili ci sono «Colore interno» e «Colore esterno»; niente casella, niente campi colore sotto", async () => {
    const c = idColore("f2a");
    monta(posizione({ valori_assi: { colore: c.standard, telaio: "f2a-telaio-l" }, scelte_assi: { colore: NOCE } }));
    expect(await screen.findByRole("combobox", { name: "Colore interno" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Colore esterno" })).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "Colore" })).toBeNull();
    expect(screen.queryByText(/Colore diverso dentro e fuori/)).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("textbox", { name: /Colore/ })).toBeNull();
    // Una riga monocolore di oggi (nessun testo) si legge uguale dentro e fuori, come la scrive il PDF.
    expect(testoDi("Colore interno")).toContain(NOCE);
    expect(testoDi("Colore esterno")).toContain(NOCE);
  });

  it("cambiando l'esterno la riga scrive i due testi, la fascia più cara e il prezzo nuovo (+15% su 1.008 = 1.159,20)", async () => {
    const c = idColore("f2a");
    const onPatch = monta(posizione({ valori_assi: { colore: c.standard, telaio: "f2a-telaio-l" }, scelte_assi: { colore: NOCE } }));
    await scegli("Colore esterno", NERO_U);
    expect(onPatch).toHaveBeenCalledTimes(1);
    const p = onPatch.mock.calls[0][0];
    expect(p.colore_interno).toBe(NOCE);
    expect(p.colore_esterno).toBe(NERO_U);
    expect(p.valori_assi).toMatchObject({ colore: c.fuori, telaio: "f2a-telaio-l" });
    expect(p.scelte_assi).toEqual({ colore: NERO_U });
    expect(p.prezzo_unitario).toBeCloseTo(1159.2, 2);
    // La tendina dice cosa si è scelto e il prezzo sa il perché.
    await waitFor(() => expect(testoDi("Colore esterno")).toContain("98 - Schwarz Ulti-Matt"));
    expect(screen.getByText(/Il prezzo segue il colore più caro: Colore Fuori Standard \(\+15%\)/)).toBeTruthy();
  });

  it("più cara dentro: la variabile «Colore» della riga è quella dell'interno, qualunque lato si tocchi", async () => {
    const c = idColore("f2a");
    const onPatch = monta(posizione({ valori_assi: { colore: c.standard, telaio: "f2a-telaio-l" }, scelte_assi: { colore: NOCE } }));
    await scegli("Colore interno", GREY);
    const p = onPatch.mock.calls[0][0];
    expect(p.colore_interno).toBe(GREY);
    expect(p.colore_esterno).toBe(NOCE);
    expect(p.valori_assi?.colore).toBe(c.fuori);
    expect(p.scelte_assi).toEqual({ colore: GREY });
    expect(p.prezzo_unitario).toBeCloseTo(1159.2, 2);
  });

  it("tornando uguali dentro e fuori il prezzo scende alla fascia scelta e i testi restano scritti", async () => {
    const c = idColore("f2a");
    const onPatch = monta(posizione({
      valori_assi: { colore: c.fuori, telaio: "f2a-telaio-l" }, scelte_assi: { colore: NERO_U },
      colore_interno: NOCE, colore_esterno: NERO_U, prezzo_unitario: 1159.2,
    }));
    await scegli("Colore esterno", NOCE);
    const p = onPatch.mock.calls[0][0];
    expect(p.colore_interno).toBe(NOCE);
    expect(p.colore_esterno).toBe(NOCE);
    expect(p.valori_assi?.colore).toBe(c.standard);
    expect(p.prezzo_unitario).toBeCloseTo(1108.8, 2);
    expect(screen.queryByText(/Il prezzo segue il colore più caro/)).toBeNull();
  });

  it("una riga con la pellicola su un lato si riapre come la scrive il PDF: dentro il bianco di serie, fuori il colore", async () => {
    const c = idColore("f2a");
    monta(posizione({ valori_assi: { colore: c.unLato, telaio: "f2a-telaio-l" }, scelte_assi: { colore: "51 - Golden Oak (rovere dorato)" } }));
    await screen.findByRole("combobox", { name: "Colore interno" });
    expect(testoDi("Colore interno")).toContain("Bianco");
    expect(testoDi("Colore esterno")).toContain("51 - Golden Oak (rovere dorato)");
  });

  it("un colore scritto a mano si legge nella sua casella, resta com'è anche cambiando l'altro lato, e tiene la fascia più cara della riga", async () => {
    const c = idColore("f2a");
    const onPatch = monta(posizione({
      valori_assi: { colore: c.fuori, telaio: "f2a-telaio-l" }, scelte_assi: { colore: GREY },
      colore_interno: "Verde RAL 6005", prezzo_unitario: 1159.2,
    }));
    const scritto = await screen.findByRole("textbox", { name: "Colore interno scritto a mano" });
    expect((scritto as HTMLInputElement).value).toBe("Verde RAL 6005");
    expect(screen.queryByRole("combobox", { name: "Colore interno" })).toBeNull();
    expect(testoDi("Colore esterno")).toContain(GREY);
    await scegli("Colore esterno", NOCE);
    const p = onPatch.mock.calls[0][0];
    expect(p.colore_interno).toBe("Verde RAL 6005");
    expect(p.colore_esterno).toBe(NOCE);
    // Il prezzo non scende: il lato scritto a mano tiene la fascia della riga (Fuori Standard +15%), e anche il suo colore.
    expect(p.valori_assi?.colore).toBe(c.fuori);
    expect(p.scelte_assi).toEqual({ colore: GREY });
    expect(p.prezzo_unitario).toBeCloseTo(1159.2, 2);
  });
});

describe("riga del preventivo: i colori per i prodotti senza la variabile «Colore»", () => {
  it("una zanzariera (senza «Colore» né altre varianti di colore) ha i due campi da scrivere a mano, come prima", async () => {
    dati.famiglie = [prodottoSenzaColore("zanz")];
    const onPatch = monta(posizione({ family_id: "zanz", valori_assi: {}, tipologia_label: "Zanzariera a molla", colore_interno: "Bianco" }, "zanz"));
    const interno = await screen.findByRole("textbox", { name: "Colore interno" });
    expect((interno as HTMLInputElement).value).toBe("Bianco");
    expect(screen.queryByRole("combobox", { name: "Colore interno" })).toBeNull();
    fireEvent.change(interno, { target: { value: "Noce" } });
    fireEvent.blur(interno);
    expect(onPatch).toHaveBeenCalledWith({ colore_interno: "Noce" });
    const esterno = screen.getByRole("textbox", { name: "Colore esterno" });
    fireEvent.change(esterno, { target: { value: "Antracite" } });
    fireEvent.blur(esterno);
    expect(onPatch).toHaveBeenCalledWith({ colore_esterno: "Antracite" });
  });

  it("un prodotto che ha già un'altra variante di colore (il colore del profilo) non ha un secondo posto dove scriverlo", async () => {
    dati.famiglie = [zanzarieraConColoreDelProfilo()];
    monta(posizione({ family_id: "zp", valori_assi: { colore_profilo: "zp-bianco" }, tipologia_label: "Zanzariera plissé" }, "zp"));
    await screen.findByRole("combobox", { name: "Colore profilo" });
    // Né campi scritti a mano né tendine «interno/esterno»: il colore è quello della variante del prodotto.
    expect(screen.queryByLabelText(/^Colore (interno|esterno)$/)).toBeNull();
  });

  it("…ma se la riga li aveva già scritti restano visibili e modificabili: non si perde niente", async () => {
    dati.famiglie = [zanzarieraConColoreDelProfilo()];
    monta(posizione({ family_id: "zp", valori_assi: { colore_profilo: "zp-bianco" }, tipologia_label: "Zanzariera plissé", colore_esterno: "Marrone RAL 8017" }, "zp"));
    const esterno = await screen.findByRole("textbox", { name: "Colore esterno" });
    expect((esterno as HTMLInputElement).value).toBe("Marrone RAL 8017");
  });
});

/** Una zanzariera con la sua variante di colore (il profilo), ma non «Colore»: i colori si scelgono lì. */
function zanzarieraConColoreDelProfilo(): FamilyWithAxes {
  return articoloEsempio("zp", "Zanzariera plissé", {
    macrocategoria_id: MACRO_SERRAMENTI.id,
    modalita_prezzo_base: "mq",
    prezzo_base_vendita: 70,
    axes: [asseEsempio("zp-colore-profilo", "Colore profilo", [valoreEsempio("zp-bianco", "Bianco", { is_default: true }), valoreEsempio("zp-marrone", "Marrone")])],
  });
}

describe("riga del preventivo: «stesse scelte per tutte le righe»", () => {
  it("il colore interno scelto in cima arriva alla riga con lo stesso ricalcolo del menu singolo; la stessa richiesta non si ripete", async () => {
    const c = idColore("f2a");
    const richiesta: RichiestaBulkColore = { lato: "esterno", valore: "colore_fuori_standard", scelta: GREY, nonce: 1 };
    const onPatch = monta(posizione({ valori_assi: { colore: c.bianco, telaio: "f2a-telaio-l" } }), { richiestaBulkColore: richiesta });
    await waitFor(() => expect(onPatch).toHaveBeenCalledTimes(1));
    const p = onPatch.mock.calls[0][0];
    expect(p.colore_esterno).toBe(GREY);
    expect(p.colore_interno).toBe("Bianco");
    expect(p.valori_assi?.colore).toBe(c.fuori);
    expect(p.prezzo_unitario).toBeCloseTo(1159.2, 2);
    // Un nuovo render con la stessa richiesta non riapplica niente.
    await new Promise((r) => setTimeout(r, 30));
    expect(onPatch).toHaveBeenCalledTimes(1);
  });
});

describe("riga del preventivo: il prezzo di una riga già salvata non cambia da solo", () => {
  /**
   * Il caso trovato in revisione: variante «Bianco» e un esterno scritto con lo stesso testo di un colore della fascia
   * «Colore Fuori Standard +15%». Il testo coincide con un colore del listino, ma nessuna tendina è stata toccata.
   */
  const rigaDelRevisore = () => posizione({
    valori_assi: { colore: idColore("f2a").bianco, telaio: "f2a-telaio-l" },
    colore_esterno: NERO_U,
    prezzo_unitario: 1008,
  });
  const aspetta = () => new Promise((r) => setTimeout(r, 30));

  it("all'apertura non scrive niente, e la nota «segue il colore più caro» non c'è perché non sarebbe vera", async () => {
    const onPatch = monta(rigaDelRevisore());
    await screen.findByRole("combobox", { name: "Colore esterno" });
    await aspetta();
    expect(onPatch).not.toHaveBeenCalled();
    // L'esterno si legge com'è scritto; il prezzo resta quello della variante «Bianco».
    expect(testoDi("Colore esterno")).toContain("98 - Schwarz Ulti-Matt");
    expect(screen.queryByText(/Il prezzo segue il colore più caro/)).toBeNull();
  });

  it("cambiando l'altezza la variante resta «Bianco»: da 1.008 € si va a 1.080 €, non a 1.242 €", async () => {
    const onPatch = monta(rigaDelRevisore());
    const altezza = await screen.findByDisplayValue("1400");
    fireEvent.change(altezza, { target: { value: "1500" } });
    fireEvent.blur(altezza);
    expect(onPatch).toHaveBeenCalledTimes(1);
    const p = onPatch.mock.calls[0][0];
    expect(p.altezza_mm).toBe(1500);
    // 1,2 × 1,5 m = 1,8 m² × 600 €/m², senza maggiorazione.
    expect(p.prezzo_unitario).toBeCloseTo(1080, 2);
    expect(p.valori_assi).toBeUndefined();
    expect(p.scelte_assi).toBeUndefined();
    expect(p.colore_interno).toBeUndefined();
    expect(p.colore_esterno).toBeUndefined();
    // Nemmeno dopo, con le misure nuove, la nota si scrive.
    expect(screen.queryByText(/Il prezzo segue il colore più caro/)).toBeNull();
  });

  it("lo stesso per la larghezza e per i pezzi: la fascia della riga non si rilegge dai testi", async () => {
    const onPatch = monta(rigaDelRevisore());
    const larghezza = await screen.findByDisplayValue("1200");
    fireEvent.change(larghezza, { target: { value: "1300" } });
    fireEvent.blur(larghezza);
    const pezzi = screen.getAllByRole("spinbutton").find((el) => (el as HTMLInputElement).value === "1") as HTMLInputElement;
    fireEvent.change(pezzi, { target: { value: "3" } });
    fireEvent.blur(pezzi);
    expect(onPatch).toHaveBeenCalledTimes(2);
    for (const [p] of onPatch.mock.calls) {
      expect(p.valori_assi).toBeUndefined();
      expect(p.scelte_assi).toBeUndefined();
    }
    // 1,3 × 1,4 m = 1,82 m² × 600 = 1.092 € a pezzo, senza maggiorazione, con 1 o con 3 pezzi.
    expect(onPatch.mock.calls[0][0].prezzo_unitario).toBeCloseTo(1092, 2);
    expect(onPatch.mock.calls[1][0].prezzo_unitario).toBeCloseTo(1092, 2);
  });

  it("toccando la tendina dell'esterno la fascia nuova SÌ si applica, e da quel momento la nota è vera", async () => {
    const c = idColore("f2a");
    const onPatch = monta(rigaDelRevisore());
    await scegli("Colore esterno", GREY); // un altro colore di «Fuori Standard +15%»
    expect(onPatch).toHaveBeenCalledTimes(1);
    const p = onPatch.mock.calls[0][0];
    expect(p.valori_assi?.colore).toBe(c.fuori);
    expect(p.scelte_assi).toEqual({ colore: GREY });
    expect(p.colore_esterno).toBe(GREY);
    expect(p.colore_interno).toBe("Bianco");
    expect(p.prezzo_unitario).toBeCloseTo(1159.2, 2); // 1.008 × 1,15
    expect(await screen.findByText(/Il prezzo segue il colore più caro: Colore Fuori Standard \(\+15%\)/)).toBeTruthy();
  });

  it("toccando la tendina dell'interno conta anche la fascia che dice il testo dell'esterno: è un gesto sul colore", async () => {
    const c = idColore("f2a");
    const onPatch = monta(rigaDelRevisore());
    await scegli("Colore interno", NOCE); // Standard +10%
    const p = onPatch.mock.calls[0][0];
    expect(p.valori_assi?.colore).toBe(c.fuori);
    expect(p.colore_interno).toBe(NOCE);
    expect(p.colore_esterno).toBe(NERO_U);
    expect(p.prezzo_unitario).toBeCloseTo(1159.2, 2);
  });

  it("colori scelti quando la posizione non ha un prezzo da calcolare: vale la fascia più cara, non per forza l'esterno", async () => {
    const c = idColore("f2a");
    const onPatch = monta(posizione({
      larghezza_mm: null, altezza_mm: null, metri_quadri: null, prezzo_unitario: 0,
      valori_assi: { colore: c.bianco, telaio: "f2a-telaio-l" },
    }));
    await scegli("Colore interno", GREY); // Fuori Standard +15%
    await scegli("Colore esterno", NOCE); // Standard +10%, più economico
    const ultimo = onPatch.mock.calls[onPatch.mock.calls.length - 1][0];
    expect(ultimo.valori_assi?.colore).toBe(c.fuori);
    expect(ultimo.colore_interno).toBe(GREY);
    expect(ultimo.colore_esterno).toBe(NOCE);
    // Senza misure non c'è un prezzo da scrivere.
    expect(ultimo.prezzo_unitario).toBeUndefined();
  });
});

describe("riga del preventivo: una variante tolta dal listino", () => {
  it("le due tendine dicono «Scelta tolta dal listino» (non «Da scegliere…»), e la riga non cambia né prezzo né dati", async () => {
    const onPatch = monta(posizione({
      valori_assi: { colore: "f2a-sparito", telaio: "f2a-telaio-l" }, scelte_assi: { colore: "99 - Colore sparito" }, prezzo_unitario: 1159.2,
    }));
    await screen.findByRole("combobox", { name: "Colore interno" });
    expect(testoDi("Colore interno")).toContain("Scelta tolta dal listino");
    expect(testoDi("Colore esterno")).toContain("Scelta tolta dal listino");
    expect(screen.queryByText("Da scegliere…")).toBeNull();
    // L'etichetta non è rossa: una scelta c'è, solo che il listino non la ha più.
    expect(screen.getByText("Colore interno").className).not.toContain("rose-700");
    await new Promise((r) => setTimeout(r, 30));
    expect(onPatch).not.toHaveBeenCalled();
  });

  it("cambiando le misure il prezzo si rifà con le scelte salvate: la variante tolta resta com'è", async () => {
    const onPatch = monta(posizione({
      valori_assi: { colore: "f2a-sparito", telaio: "f2a-telaio-l" }, scelte_assi: { colore: "99 - Colore sparito" }, prezzo_unitario: 1159.2,
    }));
    const altezza = await screen.findByDisplayValue("1400");
    fireEvent.change(altezza, { target: { value: "1500" } });
    fireEvent.blur(altezza);
    const p = onPatch.mock.calls[0][0];
    expect(p.valori_assi).toBeUndefined();
    expect(p.scelte_assi).toBeUndefined();
  });
});

describe("riga del preventivo: «Altro colore (scrivi)…»", () => {
  /** Colore Standard, «21 - Nussbaum», 1200 × 1400: 1.008 € + 10% = 1.108,80 €. */
  const standardNoce = () => posizione({
    valori_assi: { colore: idColore("f2a").standard, telaio: "f2a-telaio-l" }, scelte_assi: { colore: NOCE }, prezzo_unitario: 1108.8,
  });
  const ALTRO = "Altro colore (scrivi)…";

  async function apriAltro(lato: "interno" | "esterno") {
    fireEvent.pointerDown(await screen.findByRole("combobox", { name: `Colore ${lato}` }), POINTER);
    fireEvent.click(await screen.findByRole("option", { name: ALTRO }));
    return (await screen.findByRole("textbox", { name: `Colore ${lato} scritto a mano` })) as HTMLInputElement;
  }
  function scrivi(campo: HTMLInputElement, testo: string) {
    fireEvent.change(campo, { target: { value: testo } });
    fireEvent.blur(campo);
  }

  it("in fondo a ognuna delle due tendine, dopo i colori del listino, c'è «Altro colore (scrivi)…»", async () => {
    monta(standardNoce());
    for (const lato of ["interno", "esterno"] as const) {
      fireEvent.pointerDown(await screen.findByRole("combobox", { name: `Colore ${lato}` }), POINTER);
      const voci = (await screen.findAllByRole("option")).map((o) => o.textContent);
      expect(voci[voci.length - 1]).toBe(ALTRO);
      expect(voci.some((v) => v === GREY)).toBe(true);
      fireEvent.keyDown(document.body, { key: "Escape" });
      await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    }
  });

  it("sceglierla trasforma la tendina di quel lato in una casella nello stesso posto: parte dal colore di adesso, niente si scrive", async () => {
    const onPatch = monta(standardNoce());
    const campo = await apriAltro("esterno");
    expect(campo.value).toBe(NOCE);
    expect(screen.queryByRole("combobox", { name: "Colore esterno" })).toBeNull();
    // L'altro lato resta una tendina.
    expect(screen.getByRole("combobox", { name: "Colore interno" })).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(campo));
    expect(onPatch).not.toHaveBeenCalled();
  });

  it("il testo si scrive con una sola scrittura che non tocca né prezzo né variante, e la riga dice che la fascia resta", async () => {
    const onPatch = monta(standardNoce());
    const campo = await apriAltro("esterno");
    scrivi(campo, "RAL 7016 goffrato");
    // Solo il testo di quel lato: niente prezzo, niente `valori_assi`, niente `scelte_assi`, l'altro lato non si tocca.
    expect(onPatch).toHaveBeenCalledTimes(1);
    expect(onPatch).toHaveBeenCalledWith({ colore_esterno: "RAL 7016 goffrato" });
    expect((screen.getByRole("textbox", { name: "Colore esterno scritto a mano" }) as HTMLInputElement).value).toBe("RAL 7016 goffrato");
    expect(screen.getByText("Colore scritto: il prezzo resta quello di Colore Standard (+10%).")).toBeTruthy();
    expect(testoDi("Colore interno")).toContain(NOCE);
  });

  it("anche su un lato scritto, cambiare le misure non muove la fascia: 1.108,80 € → 1.188 € (Standard +10% sempre)", async () => {
    const onPatch = monta(standardNoce());
    scrivi(await apriAltro("esterno"), "RAL 7016 goffrato");
    const altezza = screen.getByDisplayValue("1400");
    fireEvent.change(altezza, { target: { value: "1500" } });
    fireEvent.blur(altezza);
    const p = onPatch.mock.calls[1][0];
    expect(p.valori_assi).toBeUndefined();
    expect(p.prezzo_unitario).toBeCloseTo(1188, 2); // 1,8 m² × 600 × 1,10
  });

  it("il testo esce nel PDF sul lato giusto: l'esterno scritto, l'interno com'era", async () => {
    const onPatch = monta(standardNoce());
    scrivi(await apriAltro("esterno"), "RAL 7016 goffrato");
    const dopo = { ...standardNoce(), ...onPatch.mock.calls[0][0] };
    const scheda = schedaPosizione(scelteDaAssi(finestraSalamander("f2a").axes, dopo.valori_assi, dopo.scelte_assi), {
      coloreInterno: dopo.colore_interno, coloreEsterno: dopo.colore_esterno,
    });
    expect(scheda.coloreEsterno).toBe("RAL 7016 goffrato");
    expect(scheda.coloreInterno).toBe(NOCE);
  });

  it("riaprendo la riga il testo c'è, nella sua casella, con la fascia di prima e senza scrivere niente", async () => {
    const onPatch = monta(posizione({ ...standardNoce(), colore_esterno: "RAL 7016 goffrato" }));
    const campo = await screen.findByRole("textbox", { name: "Colore esterno scritto a mano" });
    expect((campo as HTMLInputElement).value).toBe("RAL 7016 goffrato");
    expect(testoDi("Colore interno")).toContain(NOCE);
    expect(screen.getByText("Colore scritto: il prezzo resta quello di Colore Standard (+10%).")).toBeTruthy();
    await new Promise((r) => setTimeout(r, 30));
    expect(onPatch).not.toHaveBeenCalled();
  });

  it("scrivere un testo uguale a un colore di una fascia più cara non cambia nemmeno allora il prezzo né la variante", async () => {
    const onPatch = monta(standardNoce());
    scrivi(await apriAltro("esterno"), GREY); // «Fuori Standard +15%» nel listino
    expect(onPatch).toHaveBeenCalledTimes(1);
    expect(onPatch).toHaveBeenCalledWith({ colore_esterno: GREY });
    expect(screen.queryByText(/Il prezzo segue il colore più caro/)).toBeNull();
    expect(screen.getByText("Colore scritto: il prezzo resta quello di Colore Standard (+10%).")).toBeTruthy();
  });

  it("sul lato interno funziona uguale", async () => {
    const onPatch = monta(standardNoce());
    scrivi(await apriAltro("interno"), "Verde RAL 6005");
    expect(onPatch).toHaveBeenCalledWith({ colore_interno: "Verde RAL 6005" });
    expect(testoDi("Colore esterno")).toContain(NOCE);
  });

  it("la freccia riporta alla tendina: il lato riprende il colore che decide il prezzo, e il prezzo non cambia", async () => {
    const c = idColore("f2a");
    const onPatch = monta(posizione({ ...standardNoce(), colore_esterno: "RAL 7016 goffrato" }));
    fireEvent.click(await screen.findByRole("button", { name: "Colore esterno: scegli dall'elenco" }));
    const p = onPatch.mock.calls[0][0];
    expect(p.colore_esterno).toBe(NOCE);
    expect(p.colore_interno).toBe(NOCE);
    expect(p.valori_assi?.colore).toBe(c.standard);
    expect(p.prezzo_unitario).toBeCloseTo(1108.8, 2);
    await waitFor(() => expect(testoDi("Colore esterno")).toContain(NOCE));
    expect(screen.queryByRole("textbox", { name: /scritto a mano/ })).toBeNull();
  });

  it("casella svuotata: come la freccia; aperta e lasciata com'era: niente si scrive e torna la tendina", async () => {
    const onPatch = monta(posizione({ ...standardNoce(), colore_esterno: "RAL 7016 goffrato" }));
    scrivi(await screen.findByRole("textbox", { name: "Colore esterno scritto a mano" }) as HTMLInputElement, "  ");
    expect(onPatch).toHaveBeenCalledTimes(1);
    expect(onPatch.mock.calls[0][0].colore_esterno).toBe(NOCE);
    await waitFor(() => expect(testoDi("Colore esterno")).toContain(NOCE));

    onPatch.mockClear();
    const campo = await apriAltro("interno");
    fireEvent.blur(campo); // niente di nuovo
    expect(onPatch).not.toHaveBeenCalled();
    await waitFor(() => expect(testoDi("Colore interno")).toContain(NOCE));
  });

  it("i prodotti senza la variabile «Colore» non cambiano: i loro due campi sono quelli di prima", async () => {
    dati.famiglie = [prodottoSenzaColore("zanz")];
    monta(posizione({ family_id: "zanz", valori_assi: {}, tipologia_label: "Zanzariera a molla" }, "zanz"));
    expect(await screen.findByRole("textbox", { name: "Colore interno" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: ALTRO })).toBeNull();
  });
});

describe("riga del preventivo: il disegno", () => {
  it("scelti i due colori il disegno ha un colore per lato; passando da L a Z da dentro compare l'aletta", async () => {
    monta(posizione());
    await screen.findByRole("combobox", { name: "Colore interno" });
    expect(tinte(vista("interna")).has(BIANCO)).toBe(true);
    await scegli("Colore interno", "55 - Anthrazitgrau (grigio antracite)");
    expect(tinte(vista("interna")).has(ANTRACITE)).toBe(true);
    expect(tinte(vista("esterna")).has(ANTRACITE)).toBe(false);

    const aL = { dentro: vista("interna").getAttribute("viewBox"), fuori: vista("esterna").getAttribute("viewBox") };
    await scegli("Telaio", "Aletta 35 mm Salamander");
    expect(vista("interna").getAttribute("viewBox")).not.toBe(aL.dentro);
    expect(vista("esterna").getAttribute("viewBox")).toBe(aL.fuori);
    await scegli("Telaio", "Telaio a L · standard");
    expect(vista("interna").getAttribute("viewBox")).toBe(aL.dentro);
  });
});

describe("barra «Stesse scelte per tutte le righe»", () => {
  const righe = [posizione({ id: "r1" }), posizione({ id: "r2", position: 1 })];

  it("«Colore» sono due tendine, interno ed esterno; niente campi scritti a mano né «Colori a tutte»", () => {
    const onApplica = vi.fn();
    const onColore = vi.fn();
    render(<BulkAssiActions serramenti={righe} famiglie={dati.famiglie as FamilyWithAxes[]} onApplica={onApplica} onColore={onColore} />);
    expect(screen.getByRole("combobox", { name: "Colore interno" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Colore esterno" })).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "Colore" })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /Colori a tutte/ })).toBeNull();
  });

  it("scegliere un colore interno o esterno in cima chiama la richiesta del lato giusto, con la fascia e il colore", async () => {
    const onApplica = vi.fn();
    const onColore = vi.fn();
    render(<BulkAssiActions serramenti={righe} famiglie={dati.famiglie as FamilyWithAxes[]} onApplica={onApplica} onColore={onColore} />);
    await scegli("Colore interno", GREY);
    expect(onColore).toHaveBeenLastCalledWith("interno", "colore_fuori_standard", GREY);
    await scegli("Colore esterno", "Bianco");
    expect(onColore).toHaveBeenLastCalledWith("esterno", "bianco", null);
    // Il telaio (un'altra variabile) segue la strada di prima.
    await scegli("Telaio", "Aletta 60 mm Salamander");
    expect(onApplica).toHaveBeenCalledWith("telaio", "telaio_a_z", "Aletta 60 mm Salamander");
    expect(onColore).toHaveBeenCalledTimes(2);
  });
});
