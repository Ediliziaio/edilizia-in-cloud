/**
 * Il popup «Aggiungi serramento» (ListinoPickerDialog) montato per davvero, dentro il suo Dialog: «Colore» sono due
 * tendine, interno ed esterno, come tutte le altre variabili; il prezzo segue la fascia più cara; disegno e riga
 * leggono i due colori; «Telaio a Z» cambia il disegno.
 *
 * In fondo a ognuna c'è «Altro colore (scrivi)…»: una casella di testo nello stesso posto, per i RAL fuori listino; il testo
 * resta sul suo lato e tiene la fascia scelta per il prezzo.
 *
 * Prima il colore interno ed esterno erano due campi con tendina «cerca» (Popover + cmdk) che, dentro il Dialog,
 * non rispondevano: la tendina andava nel Portal fuori dal Dialog, il corpo della pagina è bloccato ai clic mentre il
 * Dialog è aperto, e le voci non si potevano né cliccare né cercare. Qui si prova col popup vero.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FamilyWithAxes } from "@/types/articleFamily";
import { COLORI_FUORI_STANDARD, COLORI_STANDARD, MACRO_SERRAMENTI, finestraSalamander, idColore } from "../fixtures/finestraSalamander";
import { preferenzeDaRiga } from "@/lib/serramenti/pickerListino";

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

import { ListinoPickerDialog, type ListinoPickResult } from "@/components/serramenti/ListinoPickerDialog";

beforeAll(() => {
  // Radix e cmdk misurano e scorrono gli elementi: jsdom non lo sa fare.
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
  // Dialog e Select di Radix hanno ciascuno la propria copia di FocusScope: i due si rimandano il cursore. Nel browser
  // il rimbalzo si ferma da solo, in jsdom i focus sono sincroni e la ricorsione non finisce mai (il test si pianta).
  // Un focus dentro un focus non riparte: il Select si apre dentro il Dialog vero, come nel browser.
  const focusOriginale = HTMLElement.prototype.focus;
  let dentro = false;
  HTMLElement.prototype.focus = function (this: HTMLElement, ...args: Parameters<HTMLElement["focus"]>) {
    if (dentro) return;
    dentro = true;
    try {
      focusOriginale.apply(this, args);
    } finally {
      dentro = false;
    }
  };
});

beforeEach(() => {
  dati.famiglie = [finestraSalamander("f2a")];
  dati.macro = [MACRO_SERRAMENTI];
});
afterEach(() => cleanup());

const POINTER = { button: 0, ctrlKey: false, pointerType: "mouse" } as const;

type Props = Partial<React.ComponentProps<typeof ListinoPickerDialog>>;

/** Apre il popup e arriva al passo delle misure della «Finestra 2 Ante», con 1200 × 1800 scritti. */
async function apriLaFinestra(props: Props = {}) {
  const onSelect = vi.fn<(r: ListinoPickResult) => void>();
  const onOpenChange = vi.fn();
  render(<ListinoPickerDialog open onOpenChange={onOpenChange} onSelect={onSelect} {...props} />);
  // Tipologia → (la linea è una sola) → prodotto → misure.
  fireEvent.click((await screen.findByText("Serramenti", { selector: "p" })).closest("button") as HTMLElement);
  fireEvent.click((await screen.findByText("Finestra 2 Ante", { selector: "p" })).closest("button") as HTMLElement);
  await screen.findByText("Variabili Prodotto");
  fireEvent.change(screen.getByPlaceholderText("es. 1200"), { target: { value: "1200" } });
  fireEvent.change(screen.getByPlaceholderText("es. 1400"), { target: { value: "1800" } });
  return { onSelect, onOpenChange };
}

async function scegli(tendina: string, opzione: string) {
  fireEvent.pointerDown(screen.getByRole("combobox", { name: tendina }), POINTER);
  // «pellicola solo un lato» ripete i colori di «Colore Standard»: la prima voce è quella della fascia Standard.
  fireEvent.click((await screen.findAllByRole("option", { name: opzione }))[0]);
  // la tendina si chiude: il prossimo `scegli` riparte da qui
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
}

const vista = (nome: "interna" | "esterna") =>
  screen.getAllByRole("img").find((el) => (el.getAttribute("aria-label") ?? "").includes(`vista ${nome}`)) as unknown as SVGElement;

/** I colori con cui si riempiono i profili del disegno: telaio e ante. */
const tinte = (svg: SVGElement) => new Set([...svg.querySelectorAll("polygon, path")].map((e) => e.getAttribute("fill")).filter((f): f is string => !!f && f.startsWith("#")));

const ANTRACITE = "#383e42"; // RAL 7016, «55 - Anthrazitgrau (grigio antracite)»
const BIANCO = "#f1ece1";
const NERO = "#1f2022"; // «nero ultra opaco»

const conferma = () => fireEvent.click(screen.getByRole("button", { name: "Aggiungi al preventivo" }));

/** Il «Totale posizione» scritto nel riepilogo del prezzo. */
const totale = () => screen.getByText("Totale posizione").parentElement?.textContent ?? "";

const ALTRO = "Altro colore (scrivi)…";
const NERO_U = "98 - Schwarz Ulti-Matt - Premium plus (nero ultra opaco)";

/** «Altro colore (scrivi)…» in fondo alla tendina di un lato: diventa una casella di testo nello stesso posto. */
async function apriAltro(lato: "interno" | "esterno") {
  fireEvent.pointerDown(screen.getByRole("combobox", { name: `Colore ${lato}` }), POINTER);
  fireEvent.click(await screen.findByRole("option", { name: ALTRO }));
  return (await screen.findByRole("textbox", { name: `Colore ${lato} scritto a mano` })) as HTMLInputElement;
}
function scrivi(campo: HTMLInputElement, testo: string) {
  fireEvent.change(campo, { target: { value: testo } });
  fireEvent.blur(campo);
}

describe("popup «Aggiungi serramento»: colore interno ed esterno", () => {
  it("al posto di «Colore» ci sono due tendine, interno ed esterno; niente casella né campi in più", async () => {
    await apriLaFinestra();
    expect(screen.getByRole("combobox", { name: "Colore interno" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Colore esterno" })).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "Colore" })).toBeNull();
    expect(screen.queryByText(/Colore diverso dentro e fuori/)).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("textbox", { name: /Colore/ })).toBeNull();
    expect(screen.queryByPlaceholderText(/RAL 9010|RAL 7016/)).toBeNull();
    // Le fasce e i colori sono quelli del listino, come nelle altre variabili.
    fireEvent.pointerDown(screen.getByRole("combobox", { name: "Colore interno" }), POINTER);
    const elenco = within(await screen.findByRole("listbox"));
    expect(elenco.getByText("Colore Standard (+10%)")).toBeTruthy();
    expect(elenco.getByText("Colore Fuori Standard (+15%)")).toBeTruthy();
    for (const voce of [...COLORI_STANDARD, ...COLORI_FUORI_STANDARD]) expect(elenco.getAllByText(voce).length).toBeGreaterThan(0);
  });

  it("scelti interno ed esterno: il disegno ha un colore per lato, il prezzo la fascia più cara, la riga i due testi", async () => {
    const { onSelect, onOpenChange } = await apriLaFinestra();
    // Di serie: bianco dentro e fuori.
    expect(tinte(vista("interna")).has(BIANCO)).toBe(true);
    expect(tinte(vista("esterna")).has(BIANCO)).toBe(true);

    await scegli("Colore interno", "55 - Anthrazitgrau (grigio antracite)");
    expect(tinte(vista("interna")).has(ANTRACITE)).toBe(true);
    expect(tinte(vista("esterna")).has(ANTRACITE)).toBe(false);
    expect(tinte(vista("esterna")).has(BIANCO)).toBe(true);
    // 2,16 m² × 600 = 1.296; Colore Standard +10% = 1.425,60.
    await waitFor(() => expect(totale()).toContain("1.425,60"));

    await scegli("Colore esterno", "98 - Schwarz Ulti-Matt - Premium plus (nero ultra opaco)");
    expect(tinte(vista("esterna")).has(NERO)).toBe(true);
    expect(tinte(vista("interna")).has(ANTRACITE)).toBe(true);
    // Fuori Standard +15% è più caro di Standard +10%: 1.296 × 1,15 = 1.490,40.
    await waitFor(() => expect(totale()).toContain("1.490,40"));
    expect(screen.getByText(/Il prezzo segue il colore più caro: Colore Fuori Standard \(\+15%\)/)).toBeTruthy();

    conferma();
    expect(onSelect).toHaveBeenCalledTimes(1);
    const r = onSelect.mock.calls[0][0];
    const c = idColore("f2a");
    expect(r.colore_interno).toBe("55 - Anthrazitgrau (grigio antracite)");
    expect(r.colore_esterno).toBe("98 - Schwarz Ulti-Matt - Premium plus (nero ultra opaco)");
    // «Colore» della riga è UNA scelta, quella che decide il prezzo.
    expect(r.valori_assi.colore).toBe(c.fuori);
    expect(r.scelte_assi?.colore).toBe("98 - Schwarz Ulti-Matt - Premium plus (nero ultra opaco)");
    expect(r.prezzo_unitario).toBeCloseTo(1490.4, 2);
    expect(r.disegno_config).toMatchObject({
      coloreInterno: "55 - Anthrazitgrau (grigio antracite)",
      coloreEsterno: "98 - Schwarz Ulti-Matt - Premium plus (nero ultra opaco)",
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("la fascia più cara vale in qualunque ordine, e a parità vale l'esterno", async () => {
    const c = idColore("f2a");
    const { onSelect } = await apriLaFinestra();
    // più cara dentro, meno cara fuori
    await scegli("Colore interno", "97 - mattGrey_cleanCOOL (grigio opaco)");
    await scegli("Colore esterno", "21 - Nussbaum (noce)");
    await waitFor(() => expect(totale()).toContain("1.490,40"));
    conferma();
    const r = onSelect.mock.calls[0][0];
    expect(r.valori_assi.colore).toBe(c.fuori);
    expect(r.scelte_assi?.colore).toBe("97 - mattGrey_cleanCOOL (grigio opaco)");
    expect(r.colore_interno).toBe("97 - mattGrey_cleanCOOL (grigio opaco)");
    expect(r.colore_esterno).toBe("21 - Nussbaum (noce)");
  });

  it("uguali dentro e fuori: i due testi si scrivono lo stesso, la variabile «Colore» è quella scelta", async () => {
    const c = idColore("f2a");
    const { onSelect } = await apriLaFinestra();
    await scegli("Colore interno", "51 - Golden Oak (rovere dorato)");
    await scegli("Colore esterno", "51 - Golden Oak (rovere dorato)");
    expect(screen.queryByText(/Il prezzo segue il colore più caro/)).toBeNull();
    conferma();
    const r = onSelect.mock.calls[0][0];
    expect(r.colore_interno).toBe("51 - Golden Oak (rovere dorato)");
    expect(r.colore_esterno).toBe("51 - Golden Oak (rovere dorato)");
    expect(r.valori_assi.colore).toBe(c.standard);
    expect(r.scelte_assi?.colore).toBe("51 - Golden Oak (rovere dorato)");
    expect(r.prezzo_unitario).toBeCloseTo(1425.6, 2);
  });

  it("di serie il bianco è scritto dentro e fuori e la riga costa quanto prima", async () => {
    const c = idColore("f2a");
    const { onSelect } = await apriLaFinestra();
    conferma();
    const r = onSelect.mock.calls[0][0];
    expect(r.colore_interno).toBe("Bianco");
    expect(r.colore_esterno).toBe("Bianco");
    expect(r.valori_assi.colore).toBe(c.bianco);
    expect(r.scelte_assi?.colore).toBeUndefined();
    expect(r.prezzo_unitario).toBeCloseTo(1296, 2);
  });

  it("una fascia senza il colore scelto («Da decidere») si scrive «(da scegliere)», come nel PDF", async () => {
    const { onSelect } = await apriLaFinestra();
    // La voce «Da decidere» è dentro il gruppo della fascia: la prima dopo l'etichetta «Colore Standard».
    fireEvent.pointerDown(screen.getByRole("combobox", { name: "Colore esterno" }), POINTER);
    const standard = (await screen.findAllByRole("option", { name: "Da decidere" }))[0];
    fireEvent.click(standard);
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    conferma();
    const r = onSelect.mock.calls[0][0];
    expect(r.colore_esterno).toBe("Colore Standard (da scegliere)");
    expect(r.colore_interno).toBe("Bianco");
    expect(r.valori_assi.colore).toBe(idColore("f2a").standard);
  });
});

describe("popup «Aggiungi serramento»: telaio a Z", () => {
  it("passando da L a Z (con la voce dell'aletta) il disegno da dentro cambia subito; da fuori no", async () => {
    const { onSelect } = await apriLaFinestra();
    const prima = { dentro: vista("interna").getAttribute("viewBox"), fuori: vista("esterna").getAttribute("viewBox") };
    await scegli("Telaio", "Aletta 35 mm Salamander");
    const dopo = { dentro: vista("interna").getAttribute("viewBox"), fuori: vista("esterna").getAttribute("viewBox") };
    // L'aletta esce dal riquadro: il disegno da dentro si allarga per contenerla.
    expect(dopo.dentro).not.toBe(prima.dentro);
    expect(dopo.fuori).toBe(prima.fuori);
    conferma();
    const r = onSelect.mock.calls[0][0];
    expect(r.disegno_config?.telaio).toContain("Telaio a Z");
    expect(r.disegno_config?.telaio).toContain("35");
  });

  it("anche «Da decidere» (senza misura dell'aletta) cambia il disegno; tornando a L torna com'era", async () => {
    await apriLaFinestra();
    const aL = vista("interna").getAttribute("viewBox");
    fireEvent.pointerDown(screen.getByRole("combobox", { name: "Telaio" }), POINTER);
    // «Da decidere» del telaio: l'unico gruppo con elenco della finestra di prova è «Telaio a Z»
    fireEvent.click(await screen.findByRole("option", { name: "Da decidere" }));
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    const aZ = vista("interna").getAttribute("viewBox");
    expect(aZ).not.toBe(aL);
    await scegli("Telaio", "Telaio a L");
    expect(vista("interna").getAttribute("viewBox")).toBe(aL);
  });
});

describe("popup «Aggiungi serramento»: «Altro colore (scrivi)…»", () => {
  it("un RAL fuori listino sull'esterno, al prezzo della fascia già scelta: scrivere non cambia né prezzo né variante", async () => {
    const c = idColore("f2a");
    const { onSelect } = await apriLaFinestra();
    await scegli("Colore esterno", NERO_U); // Fuori Standard +15%
    await waitFor(() => expect(totale()).toContain("1.490,40"));
    const campo = await apriAltro("esterno");
    // La casella prende il posto della tendina e parte dal colore di adesso.
    expect(screen.queryByRole("combobox", { name: "Colore esterno" })).toBeNull();
    expect(screen.getByRole("combobox", { name: "Colore interno" })).toBeTruthy();
    expect(campo.value).toBe(NERO_U);
    scrivi(campo, "RAL 7016 goffrato");
    expect(totale()).toContain("1.490,40");
    expect(screen.getByText("Colore scritto: il prezzo resta quello di Colore Fuori Standard (+15%).")).toBeTruthy();
    conferma();
    const r = onSelect.mock.calls[0][0];
    expect(r.colore_esterno).toBe("RAL 7016 goffrato");
    expect(r.colore_interno).toBe("Bianco");
    // Fascia e colore della riga restano quelli scelti prima di scrivere.
    expect(r.valori_assi.colore).toBe(c.fuori);
    expect(r.scelte_assi?.colore).toBe(NERO_U);
    expect(r.prezzo_unitario).toBeCloseTo(1490.4, 2);
    expect(r.disegno_config).toMatchObject({ coloreEsterno: "RAL 7016 goffrato" });
  });

  it("sull'interno funziona uguale, e la fascia più bassa dell'altro lato non abbassa il prezzo", async () => {
    const c = idColore("f2a");
    const { onSelect } = await apriLaFinestra();
    await scegli("Colore interno", "21 - Nussbaum (noce)"); // Standard +10%
    await waitFor(() => expect(totale()).toContain("1.425,60"));
    scrivi(await apriAltro("esterno"), "Verde RAL 6005");
    await scegli("Colore interno", "51 - Golden Oak (rovere dorato)"); // un altro colore Standard: stessa fascia
    expect(totale()).toContain("1.425,60");
    conferma();
    const r = onSelect.mock.calls[0][0];
    expect(r.colore_interno).toBe("51 - Golden Oak (rovere dorato)");
    expect(r.colore_esterno).toBe("Verde RAL 6005");
    expect(r.valori_assi.colore).toBe(c.standard);
    expect(r.prezzo_unitario).toBeCloseTo(1425.6, 2);
  });

  it("senza uscire dalla casella: il clic su «Aggiungi al preventivo» scrive prima il testo, poi aggiunge", async () => {
    const { onSelect } = await apriLaFinestra();
    const campo = await apriAltro("esterno");
    fireEvent.change(campo, { target: { value: "RAL 9005 opaco" } });
    // Come nel browser: premendo il bottone il cursore lascia la casella, poi arriva il clic.
    fireEvent.blur(campo);
    conferma();
    expect(onSelect.mock.calls[0][0].colore_esterno).toBe("RAL 9005 opaco");
    expect(onSelect.mock.calls[0][0].colore_interno).toBe("Bianco");
  });

  it("la freccia riporta alla tendina con il colore che decide il prezzo; la casella lasciata com'era non scrive niente", async () => {
    const { onSelect } = await apriLaFinestra();
    await scegli("Colore esterno", NERO_U);
    scrivi(await apriAltro("esterno"), "RAL 7016 goffrato");
    fireEvent.click(screen.getByRole("button", { name: "Colore esterno: scegli dall'elenco" }));
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Colore esterno" }).textContent).toContain("98 - Schwarz Ulti-Matt"));
    expect(totale()).toContain("1.490,40");
    // Aperta e lasciata com'era: torna la tendina, il lato non cambia.
    const campo = await apriAltro("interno");
    fireEvent.blur(campo);
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Colore interno" }).textContent).toContain("Bianco"));
    conferma();
    const r = onSelect.mock.calls[0][0];
    expect(r.colore_esterno).toBe(NERO_U);
    expect(r.colore_interno).toBe("Bianco");
  });

  it("la posizione dopo riparte anche dal colore scritto a mano, con la fascia dell'ultima", async () => {
    const c = idColore("f2a");
    const ultima = {
      family_id: "f2a",
      valori_assi: { colore: c.fuori, telaio: "f2a-telaio-l" },
      scelte_assi: { colore: NERO_U },
      colore_interno: "Bianco",
      colore_esterno: "RAL 7016 goffrato",
    };
    const { onSelect } = await apriLaFinestra({ preferenzeAssi: preferenzeDaRiga(ultima, dati.famiglie as FamilyWithAxes[]) });
    const campo = await screen.findByRole("textbox", { name: "Colore esterno scritto a mano" });
    expect((campo as HTMLInputElement).value).toBe("RAL 7016 goffrato");
    expect(screen.getByRole("combobox", { name: "Colore interno" }).textContent).toContain("Bianco");
    await waitFor(() => expect(totale()).toContain("1.490,40"));
    conferma();
    const r = onSelect.mock.calls[0][0];
    expect(r.colore_esterno).toBe("RAL 7016 goffrato");
    expect(r.valori_assi.colore).toBe(c.fuori);
    expect(r.prezzo_unitario).toBeCloseTo(1490.4, 2);
  });
});

describe("popup per i complementi di una finestra", () => {
  it("per tapparelle e simili «Colore» resta una tendina sola: il complemento non ha i due lati", async () => {
    dati.famiglie = [finestraSalamander("tap", { nome: "Tapparella PVC", disegno_tipologia: null })];
    const onSelect = vi.fn<(r: ListinoPickResult) => void>();
    render(<ListinoPickerDialog open onOpenChange={vi.fn()} onSelect={onSelect} tipo="accessorio" />);
    fireEvent.click((await screen.findByText("Serramenti", { selector: "p" })).closest("button") as HTMLElement);
    fireEvent.click((await screen.findByText("Tapparella PVC", { selector: "p" })).closest("button") as HTMLElement);
    await screen.findByText("Variabili Prodotto");
    fireEvent.change(screen.getByPlaceholderText("es. 1200"), { target: { value: "1000" } });
    fireEvent.change(screen.getByPlaceholderText("es. 1400"), { target: { value: "1000" } });
    expect(screen.getByRole("combobox", { name: "Colore" })).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "Colore interno" })).toBeNull();
    // Una tendina sola, senza «Altro colore (scrivi)…»: i due lati sono solo della finestra.
    fireEvent.pointerDown(screen.getByRole("combobox", { name: "Colore" }), POINTER);
    await screen.findByRole("listbox");
    expect(screen.queryByRole("option", { name: ALTRO })).toBeNull();
    fireEvent.click(screen.getByRole("option", { name: "Bianco" })); // lo stesso di prima: chiude la tendina
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    conferma();
    const r = onSelect.mock.calls[0][0];
    expect(r.colore_interno).toBeNull();
    expect(r.colore_esterno).toBeNull();
    expect(r.valori_assi.colore).toBe(idColore("tap").bianco);
  });
});

describe("popup: la posizione dopo riparte dai colori dell'ultima", () => {
  it("interno e esterno si riprendono ognuno dal suo lato (anche se il prezzo segue il più caro)", async () => {
    const c = idColore("f2a");
    const ultima = {
      family_id: "f2a",
      valori_assi: { colore: c.fuori, telaio: "f2a-telaio-l" },
      scelte_assi: { colore: "98 - Schwarz Ulti-Matt - Premium plus (nero ultra opaco)" },
      colore_interno: "Bianco",
      colore_esterno: "98 - Schwarz Ulti-Matt - Premium plus (nero ultra opaco)",
    };
    const preferenze = preferenzeDaRiga(ultima, dati.famiglie as FamilyWithAxes[]);
    await apriLaFinestra({ preferenzeAssi: preferenze });
    expect(screen.getByRole("combobox", { name: "Colore interno" }).textContent).toContain("Bianco");
    expect(screen.getByRole("combobox", { name: "Colore esterno" }).textContent).toContain("98 - Schwarz Ulti-Matt");
    expect(tinte(vista("interna")).has(BIANCO)).toBe(true);
    expect(tinte(vista("esterna")).has(NERO)).toBe(true);
  });
});
