/**
 * Il guscio comune dei preventivatori: barra delle fasi (con totale), anteprima
 * veloce, pannello con gli interruttori, piede. Si prova ciò che l'utente vede e
 * ciò che non deve vedere: «Impresa» solo a chi può vedere i margini, il PDF vero
 * solo dove il modulo lo sa mostrare, le fasi bloccate che non si aprono.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AnteprimaVeloce, BarraFasi, CorpoPreventivatore, PannelloAnteprima, PiedePreventivatore, StatoDelSalvataggio,
} from "@/components/preventivatore";
import type { AnteprimaPreventivo } from "@/lib/preventivatore/anteprima";

afterEach(() => cleanup());

const passi = [
  { key: "cliente", label: "Contatto" },
  { key: "immobile", label: "Immobile e contenuti", breve: "Immobile" },
  { key: "bom", label: "Composizione offerta", breve: "Offerta" },
  { key: "economia", label: "Economia" },
];

describe("BarraFasi", () => {
  it("segna la fase attuale, le spunte e il totale sempre in vista", () => {
    render(<BarraFasi passi={passi} corrente="bom" completati={new Set(["cliente", "immobile"])} onSelect={vi.fn()} totale={{ valore: "€ 5.121" }} />);
    const nav = screen.getByRole("navigation", { name: "Fasi del preventivo" });
    const attiva = within(nav).getByRole("button", { name: /Composizione offerta/ });
    expect(attiva.getAttribute("aria-current")).toBe("step");
    expect(within(nav).getByRole("button", { name: /Contatto/ }).getAttribute("data-state")).toBe("completed");
    expect(screen.getByText("€ 5.121")).toBeTruthy();
    expect(screen.getByText("Totale IVA incl.")).toBeTruthy();
    expect(screen.getByText(/Passo 3 di 4/)).toBeTruthy();
  });

  it("le fasi bloccate non si aprono, le altre sì", () => {
    const onSelect = vi.fn();
    render(<BarraFasi passi={passi} corrente="cliente" bloccati={new Set(["bom", "economia"])} onSelect={onSelect} />);
    const bloccata = screen.getByRole("button", { name: /Composizione offerta/ }) as HTMLButtonElement;
    expect(bloccata.disabled).toBe(true);
    fireEvent.click(bloccata);
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Immobile e contenuti/ }));
    expect(onSelect).toHaveBeenCalledWith("immobile");
  });

  it("il puntino rosso compare sulle fasi con qualcosa che manca, non su quella aperta", () => {
    render(<BarraFasi passi={passi} corrente="bom" conAvviso={new Set(["cliente", "bom"])} onSelect={vi.fn()} />);
    expect(within(screen.getByRole("button", { name: /Contatto/ })).getByRole("img", { name: "Manca qualcosa" })).toBeTruthy();
    expect(within(screen.getByRole("button", { name: /Composizione offerta/ })).queryByRole("img", { name: "Manca qualcosa" })).toBeNull();
  });

  it("nella tab si legge il nome corto (stanno tutte in riga), per esteso nella striscia e per chi usa lo screen reader", () => {
    render(<BarraFasi passi={passi} corrente="bom" onSelect={vi.fn()} />);
    const tab = screen.getByRole("button", { name: "Composizione offerta" });
    expect(tab.textContent).toContain("Offerta");
    expect(tab.textContent).not.toContain("Composizione");
    expect(screen.getByText(/Passo 3 di 4/).parentElement?.textContent).toContain("Composizione offerta");
  });
});

const anteprima = (extra: Partial<AnteprimaPreventivo> = {}): AnteprimaPreventivo => ({
  emittente: "Bianchi Infissi",
  codice: "SR-2026-0412",
  dataEtichetta: "5 ottobre 2026",
  titolo: "Sostituzione serramenti",
  cliente: { nome: "Mario Rossi", righe: ["Via Garibaldi 12, Padova"] },
  cantiere: null,
  gruppi: [
    {
      id: "serramenti", titolo: "Serramenti", righe: [
        { id: "s1", titolo: "Finestra 2 ante", dettaglio: "120 × 140 cm · Bianco", quantita: 3, unita: "pz", prezzoUnitario: 800, totale: 2400, costo: 1500 },
        { id: "s2", titolo: "Portafinestra", dettaglio: null, quantita: 1, unita: "pz", prezzoUnitario: null, totale: null, costo: null },
      ],
    },
    { id: "vuoto", titolo: "Servizi", righe: [] },
  ],
  totali: [
    { id: "lordo", etichetta: "Totale voci", importo: 2400 },
    { id: "sconto", etichetta: "Sconto 5%", importo: 120, negativo: true },
    { id: "totale", etichetta: "Totale", importo: 2508, forte: true },
  ],
  totaleDocumento: 2508,
  avvisi: [],
  note: [],
  impresa: { costi: 1500, margine: 780, marginePct: null, costiCompleti: false, righeSenzaCosto: 1 },
  ...extra,
});

describe("AnteprimaVeloce", () => {
  it("mostra cliente, righe nel loro gruppo, totali con sconto in meno e totale forte", () => {
    const { container } = render(<AnteprimaVeloce dati={anteprima()} />);
    expect(screen.getByText("Mario Rossi")).toBeTruthy();
    expect(screen.getByText("Via Garibaldi 12, Padova")).toBeTruthy();
    expect(screen.getByText("Finestra 2 ante")).toBeTruthy();
    expect(screen.getByText("Serramenti")).toBeTruthy();
    expect(screen.queryByText("Servizi")).toBeNull(); // un gruppo vuoto non si disegna
    // il totale della riga e la riga «Totale voci» dicono la stessa cifra: due volte
    expect(within(container.querySelector('[data-riga="s1"]') as HTMLElement).getByText("€ 2.400")).toBeTruthy();
    expect(screen.getAllByText("€ 2.400")).toHaveLength(2);
    expect(screen.getByText("− € 120")).toBeTruthy();
    expect(screen.getByText("€ 2.508")).toBeTruthy();
  });

  it("il prezzo unitario dice a cosa si riferisce: «cad.» per i pezzi, «/ mq» per le misure", () => {
    render(<AnteprimaVeloce dati={anteprima({
      gruppi: [{ id: "g", titolo: "Lavori", righe: [
        { id: "a", titolo: "Pezzi", quantita: 3, unita: "pz", prezzoUnitario: 800, totale: 2400 },
        { id: "b", titolo: "Posa pavimento", quantita: 12.5, unita: "mq", prezzoUnitario: 18, totale: 225 },
        { id: "c", titolo: "Radiatori", quantita: 6, unita: "cad", prezzoUnitario: 120, totale: 720 },
      ] }],
    })} />);
    expect(screen.getByText("€ 800 cad.")).toBeTruthy();
    expect(screen.getByText("€ 18 / mq")).toBeTruthy();
    expect(screen.getByText("€ 120 cad.")).toBeTruthy();
  });

  it("la voce senza prezzo è «da prezzare» e l'avviso dice quante ce ne sono", () => {
    render(<AnteprimaVeloce dati={anteprima()} />);
    expect(screen.getByText("da prezzare")).toBeTruthy();
    expect(screen.getByText(/1 voce senza prezzo/)).toBeTruthy();
  });

  it("nella vista cliente non si vedono costi né margine; in quella impresa sì, col margine parziale dichiarato", () => {
    const { rerender } = render(<AnteprimaVeloce dati={anteprima()} vista="cliente" />);
    expect(screen.queryByText("Costo")).toBeNull();
    expect(screen.queryByText(/Vista impresa/)).toBeNull();

    rerender(<AnteprimaVeloce dati={anteprima()} vista="impresa" />);
    expect(screen.getByText("Costo")).toBeTruthy();
    expect(screen.getByText("€ 1.500")).toBeTruthy();
    expect(screen.getByText(/Vista impresa/)).toBeTruthy();
    expect(screen.getByText(/Manca il costo su 1 voce: il margine è parziale/)).toBeTruthy();
  });

  it("col prezzo a corpo le righe a 0 € sono «comprese» e non c'è l'avviso «senza prezzo»", () => {
    render(<AnteprimaVeloce dati={anteprima({ prezzoACorpo: true })} />);
    expect(screen.queryByText("da prezzare")).toBeNull();
    expect(screen.getByText("compresa")).toBeTruthy();
    expect(screen.queryByText(/senza prezzo/)).toBeNull();
  });

  it("la detrazione indicativa si legge col suo tetto di spesa, e dice quando lo si supera", () => {
    const { rerender } = render(<AnteprimaVeloce dati={anteprima({ detrazione: { pct: 50, importo: 1254, massimale: 96000, oltreMassimale: false } })} />);
    expect(screen.getByText("Detrazione indicativa (50%)")).toBeTruthy();
    expect(screen.getByText("€ 1.254")).toBeTruthy();
    expect(screen.getByText(/tetto di spesa di € 96\.000\./)).toBeTruthy();
    expect(screen.queryByText(/la spesa lo supera/)).toBeNull();

    rerender(<AnteprimaVeloce dati={anteprima({ detrazione: { pct: 36, importo: 34560, massimale: 96000, oltreMassimale: true } })} />);
    expect(screen.getByText("Detrazione indicativa (36%)")).toBeTruthy();
    expect(screen.getByText(/la spesa lo supera/)).toBeTruthy();

    rerender(<AnteprimaVeloce dati={anteprima({ detrazione: { pct: 50, importo: 1254, massimale: null, oltreMassimale: false } })} />);
    expect(screen.getByText(/Stima sull'imponibile netto/)).toBeTruthy();

    rerender(<AnteprimaVeloce dati={anteprima({ detrazione: null })} />);
    expect(screen.queryByText(/Detrazione indicativa/)).toBeNull();
  });

  it("un margine che non si conosce (voce venduta senza costo) è «—» con «Costi incompleti», non una cifra", () => {
    render(<AnteprimaVeloce vista="impresa" dati={anteprima({ impresa: { costi: 1500, margine: null, marginePct: null, costiCompleti: false, righeSenzaCosto: 2 } })} />);
    const riquadro = screen.getByText(/Vista impresa/).closest("div") as HTMLElement;
    expect(within(riquadro).getByText("—")).toBeTruthy();
    expect(within(riquadro).getByText(/Costi incompleti · 2 voci senza costo/)).toBeTruthy();
    expect(within(riquadro).queryByText(/%/)).toBeNull();
  });

  it("il riepilogo sta in un blocco fisso in fondo alla colonna: scorrono le righe, il totale resta in vista", () => {
    render(<AnteprimaVeloce dati={anteprima()} />);
    const blocco = screen.getByText("€ 2.508").closest(".sticky") as HTMLElement;
    expect(blocco).toBeTruthy();
    expect(blocco.className).toContain("bottom-0");
    expect(within(blocco).getByText("€ 2.508")).toBeTruthy();
    // la detrazione e gli avvisi scorrono con le righe, non stanno nel blocco fisso
    expect(within(blocco).queryByText(/senza prezzo/)).toBeNull();
  });

  it("senza niente da sommare non c'è riepilogo fisso, nemmeno nella vista impresa (non si mostra «margine —» a un preventivo vuoto)", () => {
    const { container } = render(<AnteprimaVeloce vista="impresa" dati={anteprima({ gruppi: [], totali: [], totaleDocumento: null, impresa: { costi: 0, margine: null, marginePct: null, costiCompleti: false, righeSenzaCosto: 0 } })} />);
    expect(container.querySelector(".sticky")).toBeNull();
    expect(screen.queryByText(/Vista impresa/)).toBeNull();
  });

  it("la riga che si sta toccando si evidenzia", () => {
    const { container } = render(<AnteprimaVeloce dati={anteprima()} evidenzia="s1" />);
    expect(container.querySelector('[data-riga="s1"]')?.className).toContain("bg-orange-50");
    expect(container.querySelector('[data-riga="s2"]')?.className).not.toContain("bg-orange-50");
  });

  it("senza righe dice dove compariranno; senza nome del cliente lo chiede in chiaro", () => {
    render(<AnteprimaVeloce dati={anteprima({ gruppi: [], totali: [], totaleDocumento: null, cliente: { nome: null, righe: [] }, emittente: null })} />);
    expect(screen.getByText(/Qui compaiono le voci/)).toBeTruthy();
    expect(screen.getByText("Nome del cliente")).toBeTruthy();
  });
});

describe("PannelloAnteprima", () => {
  it("«Impresa» compare SOLO a chi può vedere i margini", () => {
    const { rerender } = render(<PannelloAnteprima><p>contenuto</p></PannelloAnteprima>);
    expect(screen.queryByRole("button", { name: "Impresa" })).toBeNull();
    rerender(<PannelloAnteprima puoVedereImpresa><p>contenuto</p></PannelloAnteprima>);
    expect(screen.getByRole("button", { name: "Impresa" })).toBeTruthy();
  });

  it("l'interruttore Cliente/Impresa avvisa la pagina; «PDF vero» c'è solo se il modulo lo sa mostrare", () => {
    const onVista = vi.fn();
    const onModalita = vi.fn();
    const { rerender } = render(<PannelloAnteprima puoVedereImpresa onVista={onVista}><p>x</p></PannelloAnteprima>);
    fireEvent.click(screen.getByRole("button", { name: "Impresa" }));
    expect(onVista).toHaveBeenCalledWith("impresa");
    expect(screen.queryByRole("button", { name: "PDF vero" })).toBeNull();

    rerender(<PannelloAnteprima pdfDisponibile onModalita={onModalita}><p>x</p></PannelloAnteprima>);
    fireEvent.click(screen.getByRole("button", { name: "PDF vero" }));
    expect(onModalita).toHaveBeenCalledWith("pdf");
  });

  it("col PDF vero non c'è il cambio Cliente/Impresa (il PDF è uno solo: quello del cliente)", () => {
    render(<PannelloAnteprima modalita="pdf" pdfDisponibile puoVedereImpresa><p>x</p></PannelloAnteprima>);
    expect(screen.queryByRole("button", { name: "Impresa" })).toBeNull();
  });

  it("il pulsante per nascondere c'è solo se la pagina sa nasconderlo", () => {
    const onNascondi = vi.fn();
    const { rerender } = render(<PannelloAnteprima><p>x</p></PannelloAnteprima>);
    expect(screen.queryByRole("button", { name: "Nascondi l'anteprima" })).toBeNull();
    rerender(<PannelloAnteprima onNascondi={onNascondi}><p>x</p></PannelloAnteprima>);
    fireEvent.click(screen.getByRole("button", { name: "Nascondi l'anteprima" }));
    expect(onNascondi).toHaveBeenCalledTimes(1);
  });
});

describe("CorpoPreventivatore e piede", () => {
  it("la colonna dell'anteprima c'è solo se c'è l'anteprima e non è nascosta", () => {
    const { rerender } = render(<CorpoPreventivatore anteprima={<p>pannello</p>}><p>lavoro</p></CorpoPreventivatore>);
    expect(screen.getByRole("complementary", { name: "Anteprima del preventivo", hidden: true })).toBeTruthy();
    rerender(<CorpoPreventivatore anteprima={<p>pannello</p>} anteprimaNascosta><p>lavoro</p></CorpoPreventivatore>);
    expect(screen.queryByRole("complementary", { name: "Anteprima del preventivo", hidden: true })).toBeNull();
    rerender(<CorpoPreventivatore><p>lavoro</p></CorpoPreventivatore>);
    expect(screen.queryByRole("complementary", { name: "Anteprima del preventivo", hidden: true })).toBeNull();
    expect(screen.getByText("lavoro")).toBeTruthy();
  });

  it("il salvataggio si dice com'è: salvando, modifiche, salvato con l'ora, solo su questo dispositivo", () => {
    const { rerender } = render(<StatoDelSalvataggio stato="salvando" />);
    expect(screen.getByRole("status").textContent).toContain("Salvataggio…");
    rerender(<StatoDelSalvataggio stato="salvato" testo="Salvato alle 11:24" />);
    expect(screen.getByRole("status").textContent).toBe("Salvato alle 11:24");
    rerender(<StatoDelSalvataggio stato="locale" />);
    expect(screen.getByRole("status").textContent).toContain("Solo su questo dispositivo");
    rerender(<StatoDelSalvataggio stato="modifiche" />);
    expect(screen.getByRole("status").textContent).toContain("Modifiche non salvate");
  });

  it("il piede tiene lo stato a sinistra e le azioni a destra", () => {
    render(
      <PiedePreventivatore stato={<StatoDelSalvataggio stato="salvato" />} telefono={<span>totale</span>}>
        <button type="button">Avanti</button>
      </PiedePreventivatore>,
    );
    expect(screen.getByRole("button", { name: "Avanti" })).toBeTruthy();
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText("totale")).toBeTruthy();
  });
});
