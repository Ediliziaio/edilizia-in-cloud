/**
 * Listino (10/10/2026): le funzioni più usate a portata di mano.
 *
 * - «Attivo» e «Proposto nei preventivi» si cambiavano, nella vista a schede, solo da un menu ⋮ che su computer compariva
 *   al passaggio del mouse; nella tabella le due colonne sparivano sotto i 640 px.
 * - Chi poteva solo consultare non riusciva ad aprire un prodotto.
 * - «Importa» conteneva azioni che non importano niente; non c'era un filtro «senza foto».
 * - Un segnale («Posa da impostare») che non poteva comparire mai.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ListinoBarra, type AzioneImporta } from "@/components/listino/ListinoBarra";
import { ListinoNavigatore, type AzioniProdotto } from "@/components/listino/ListinoNavigatore";
import { articoloEsempio } from "@/lib/listino/esempiListino";
import { costruisciListino } from "@/lib/listino/lineeListino";
import { FILTRI_LISTINO_INIZIALI, FILTRI_LISTINO_VUOTI, SOGLIA_MARGINE_LISTINO, rigaPassa } from "@/lib/listino/filtriListino";
import { FileSpreadsheet, Layers, Sparkles } from "lucide-react";
import type { FamilyWithAxes } from "@/types/articleFamily";

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    releasePointerCapture: () => {},
    setPointerCapture: () => {},
    scrollIntoView: () => {},
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const macro = [{ id: "m1", nome: "Serramenti", verticali_abilitati: ["serramenti"] }];
const categorie = [{ id: "c1", nome: "PVC", macrocategoria_id: "m1" }];
const prodotto = (id: string, nome: string, extra: Partial<FamilyWithAxes> = {}) =>
  articoloEsempio(id, nome, { macrocategoria_id: "m1", categoria_id: "c1", prezzo_base_vendita: 100, prezzo_base_acquisto: 60, ...extra });

function azioni(over: Partial<AzioniProdotto> = {}): AzioniProdotto {
  return { onApri: vi.fn(), onAttivo: vi.fn(), onPreventivo: vi.fn(), onDuplica: vi.fn(), onSposta: vi.fn(), onElimina: vi.fn(), ...over };
}
function apri(famiglie: FamilyWithAxes[], vista: "cards" | "table", isAdmin: boolean, a: AzioniProdotto) {
  const aree = costruisciListino(famiglie, macro, categorie);
  render(
    <MemoryRouter>
      <ListinoNavigatore
        aree={aree}
        selezione={{ area: "serramenti", tipologia: "macro:m1", linea: "cat:c1" }}
        onSelezione={vi.fn()}
        vista={vista}
        cercando={false}
        isAdmin={isAdmin}
        azioni={a}
      />
    </MemoryRouter>,
  );
}

describe("Listino: il filtro «Foto»", () => {
  const con = prodotto("p1", "Con foto", { immagine_url: "https://x/foto.jpg" });
  const senza = prodotto("p2", "Senza foto");
  const disegno = prodotto("p3", "Col disegno", { disegno_tipologia: "persiana:6" });
  const righe = (...f: FamilyWithAxes[]) => costruisciListino(f, macro, categorie)[0].tipologie[0].linee[0].righe;
  const passa = (r: ReturnType<typeof righe>[number], foto: "all" | "senza" | "con") => rigaPassa(r, "", { ...FILTRI_LISTINO_VUOTI, foto });

  it("«Con foto» tiene i prodotti con una foto o con il disegno fatto dal sistema", () => {
    const [rCon, rSenza, rDisegno] = righe(con, senza, disegno);
    expect([rCon, rSenza, rDisegno].map((r) => passa(r, "con"))).toEqual([true, false, true]);
  });

  it("«Senza foto» tiene gli altri", () => {
    const [rCon, rSenza, rDisegno] = righe(con, senza, disegno);
    expect([rCon, rSenza, rDisegno].map((r) => passa(r, "senza"))).toEqual([false, true, false]);
  });

  it("«Tutte» non esclude nessuno, ed è il valore di partenza (come prima)", () => {
    const [rCon, rSenza] = righe(con, senza);
    expect(FILTRI_LISTINO_INIZIALI.foto).toBe("all");
    expect(passa(rCon, "all") && passa(rSenza, "all")).toBe(true);
  });

  it("sta fra i Filtri, dopo il margine, con le tre risposte, e dice che il disegno conta come foto", () => {
    const onFiltri = vi.fn();
    render(
      <ListinoBarra cerca="" onCerca={vi.fn()} filtri={FILTRI_LISTINO_INIZIALI} onFiltri={onFiltri} vista="table" onVista={vi.fn()} isAdmin />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Filtri/ }));
    const etichette = screen.getAllByText(/^(Come si calcola il prezzo|Margine|Foto|Stato|Nei preventivi)$/).map((n) => n.textContent);
    expect(etichette).toEqual(["Come si calcola il prezzo", "Margine", "Foto", "Stato", "Nei preventivi"]);
    expect(screen.getByRole("combobox", { name: "Foto" })).toHaveTextContent("Tutte");
    expect(document.getElementById("filtro-foto-nota")?.textContent).toContain("disegno");
    fireEvent.pointerDown(screen.getByRole("combobox", { name: "Foto" }), { button: 0, ctrlKey: false, pointerType: "mouse" });
    return screen.findAllByRole("option").then((opzioni) => {
      expect(opzioni.map((o) => o.textContent)).toEqual(["Tutte", "Senza foto", "Con foto"]);
      fireEvent.click(opzioni[1]);
      expect(onFiltri).toHaveBeenCalledWith({ ...FILTRI_LISTINO_INIZIALI, foto: "senza" });
    });
  });

  it("la soglia del margine è scritta una volta sola e dice che non è quella di Prezzo e margini", () => {
    render(<ListinoBarra cerca="" onCerca={vi.fn()} filtri={FILTRI_LISTINO_INIZIALI} onFiltri={vi.fn()} vista="table" onVista={vi.fn()} isAdmin />);
    fireEvent.click(screen.getByRole("button", { name: /Filtri/ }));
    expect(SOGLIA_MARGINE_LISTINO).toBe(15);
    expect(document.getElementById("filtro-margine-nota")?.textContent).toContain(`${SOGLIA_MARGINE_LISTINO}%`);
    expect(document.getElementById("filtro-margine-nota")?.textContent).toContain("Prezzo e margini");
  });
});

describe("Listino: la barra", () => {
  const importa: AzioneImporta[] = [
    { etichetta: "Excel o CSV", descrizione: "Da un foglio di calcolo", icona: FileSpreadsheet, href: "/azienda/impostazioni/listino/import" },
    { etichetta: "Listino fornitore in PDF", icona: Sparkles, href: "/azienda/impostazioni/listino/import?tab=ai" },
  ];
  const imposta: AzioneImporta[] = [
    { etichetta: "Modelli pronti", icona: Layers, onClick: vi.fn() },
    { etichetta: "Serie di profilo", icona: Layers, onClick: vi.fn() },
  ];
  const barra = (isAdmin: boolean) => (
    <MemoryRouter>
      <ListinoBarra
        cerca="" onCerca={vi.fn()} filtri={FILTRI_LISTINO_INIZIALI} onFiltri={vi.fn()} vista="table" onVista={vi.fn()}
        isAdmin={isAdmin} azioniImporta={importa} azioniImposta={imposta} guida={<button type="button">Come funziona</button>}
      />
    </MemoryRouter>
  );
  const apriMenu = (nome: string) => fireEvent.pointerDown(screen.getByRole("button", { name: nome }), { button: 0, ctrlKey: false, pointerType: "mouse" });

  it("«Importa» ha solo ciò che importa dati; le altre azioni stanno in «Imposta»", async () => {
    render(barra(true));
    apriMenu("Importa");
    expect((await screen.findAllByRole("menuitem")).map((v) => v.textContent)).toEqual(["Excel o CSVDa un foglio di calcolo", "Listino fornitore in PDF"]);
    cleanup();
    render(barra(true));
    apriMenu("Imposta");
    expect((await screen.findAllByRole("menuitem")).map((v) => v.textContent)).toEqual(["Modelli pronti", "Serie di profilo"]);
  });

  it("«Come funziona» sta nella barra, anche per chi può solo consultare, che non vede i comandi di scrittura", () => {
    render(barra(false));
    expect(screen.getByRole("button", { name: "Come funziona" })).toBeInTheDocument();
    for (const nome of ["Importa", "Imposta", "Tipologie e linee"]) expect(screen.queryByRole("button", { name: nome }), nome).toBeNull();
  });
});

describe("Listino: schede e tabella", () => {
  it("il menu ⋮ della scheda non aspetta il mouse: nessuna classe lo nasconde su computer", () => {
    apri([prodotto("a", "Finestra A")], "cards", true, azioni());
    const menu = screen.getByRole("button", { name: "Azioni per Finestra A" });
    const involucro = menu.parentElement!;
    expect(involucro.className).not.toMatch(/opacity-0|group-hover/);
  });

  it("chi può solo consultare apre un prodotto dal nome (schede)", () => {
    const a = azioni();
    apri([prodotto("a", "Finestra A")], "cards", false, a);
    fireEvent.click(screen.getByRole("button", { name: "Finestra A" }));
    expect(a.onApri).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }));
    expect(screen.queryByRole("button", { name: /Azioni per/ })).toBeNull();
  });

  it("chi può solo consultare apre un prodotto dalla riga (tabella), ma gli interruttori restano spenti", () => {
    const a = azioni();
    apri([prodotto("a", "Finestra A")], "table", false, a);
    fireEvent.click(screen.getByText("Finestra A"));
    expect(a.onApri).toHaveBeenCalledOnce();
    for (const interruttore of screen.getAllByRole("switch")) expect(interruttore).toBeDisabled();
  });

  it("tabella: «Attivo» e «Nei preventivi» ci sono anche sotto i 640 px, sotto il nome, e funzionano", () => {
    const a = azioni();
    apri([prodotto("a", "Finestra A", { attivo: true })], "table", true, a);
    const attivi = screen.getAllByRole("switch", { name: "Prodotto attivo: Finestra A" });
    const preventivi = screen.getAllByRole("switch", { name: "Proposto nei preventivi: Finestra A" });
    // colonna (da 640 px in su) + riga sotto il nome (sotto i 640 px)
    expect(attivi).toHaveLength(2);
    expect(preventivi).toHaveLength(2);
    const sottoIlNome = attivi.find((n) => n.closest("label"))!;
    expect(within(sottoIlNome.closest("label")!).getByText("Attivo")).toBeInTheDocument();
    // la riga sotto il nome si vede sotto i 640 px (sm:hidden) e la colonna da 640 px in su (hidden sm:table-cell)
    const classiRiga = sottoIlNome.closest("label")!.parentElement!.className.split(/\s+/);
    expect(classiRiga).toContain("sm:hidden");
    expect(classiRiga).not.toContain("hidden");
    const colonna = attivi.find((n) => !n.closest("label"))!.closest("td")!;
    expect(colonna.className).toMatch(/\bhidden\b.*sm:table-cell/);
    fireEvent.click(sottoIlNome);
    expect(a.onAttivo).toHaveBeenCalledOnce();
    fireEvent.click(preventivi.find((n) => n.closest("label"))!);
    expect(a.onPreventivo).toHaveBeenCalledOnce();
    expect(a.onApri).not.toHaveBeenCalled();
  });

  it("il segnale «Posa da impostare» non c'è più: la colonna ha sempre un valore", () => {
    apri([prodotto("a", "Finestra A", { manodopera_modalita: null as unknown as FamilyWithAxes["manodopera_modalita"] })], "cards", true, azioni());
    expect(document.body.textContent).not.toContain("Posa da impostare");
  });

  it("i segnali che servono restano: disattivato e fuori dai preventivi", () => {
    apri([prodotto("a", "Finestra A", { attivo: false, mostra_preventivo: false })], "cards", true, azioni());
    expect(document.body.textContent).toContain("Disattivato");
    expect(document.body.textContent).toContain("Fuori dai preventivi");
  });
});
