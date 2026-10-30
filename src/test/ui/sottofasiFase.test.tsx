// src/test/ui/sottofasiFase.test.tsx
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SottofasiFase } from "@/components/orders/SottofasiFase";
import type { Sottofase } from "@/lib/orders/sottofasi";

const riga = (patch: Partial<Sottofase> = {}): Sottofase => ({
  id: "s1", phase_id: "p1", name: "Tracce", position: 0, peso: 1, fatta: false, fatta_il: null, ...patch,
});
const azioni = () => ({ onSegna: vi.fn(), onAggiungi: vi.fn(), onRinomina: vi.fn(), onElimina: vi.fn() });
/** I comandi di una riga stanno dietro «⋯»; giorni e persone dietro «Pianifica i giorni». */
const menu = (nome: string) => fireEvent.click(screen.getByRole("button", { name: `Altro per ${nome}` }));
const pianifica = () => fireEvent.click(screen.getByRole("button", { name: "Pianifica i giorni" }));
afterEach(cleanup);

describe("SottofasiFase", () => {
  it("dice quante sono fatte e la percentuale che ne deriva", () => {
    render(
      <SottofasiFase
        nomeFase="Impianto" puoModificare puoSegnare {...azioni()}
        sottofasi={[riga({ fatta: true }), riga({ id: "s2", name: "Cavi" }), riga({ id: "s3", name: "Quadro" })]}
      />,
    );
    expect(screen.getByText("1 di 3 · 33%")).toBeInTheDocument();
    expect(screen.getByText("1 di 3 · 33%")).toHaveAttribute("title", "L'avanzamento della fase si calcola dalle sottofasi fatte");
  });

  it("segna e toglie la spunta", () => {
    const a = azioni();
    render(<SottofasiFase nomeFase="Impianto" puoModificare puoSegnare {...a} sottofasi={[riga(), riga({ id: "s2", name: "Cavi", fatta: true })]} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Tracce: da fare" }));
    expect(a.onSegna).toHaveBeenCalledWith("s1", true);
    fireEvent.click(screen.getByRole("checkbox", { name: "Cavi: fatta" }));
    expect(a.onSegna).toHaveBeenCalledWith("s2", false);
  });

  it("senza sottofasi l'ufficio vede solo un invito discreto, e la fase resta com'era", () => {
    render(<SottofasiFase nomeFase="Impianto" puoModificare puoSegnare {...azioni()} sottofasi={[]} />);
    expect(screen.getByRole("button", { name: "Dividi in sottofasi" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Aggiungi una sottofase a Impianto")).not.toBeInTheDocument();
    expect(screen.queryByText(/L'avanzamento di questa fase si calcola/)).not.toBeInTheDocument();
  });

  it("aggiunge con il nome ripulito, e non aggiunge un nome vuoto", () => {
    const a = azioni();
    render(<SottofasiFase nomeFase="Impianto" puoModificare puoSegnare {...a} sottofasi={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Dividi in sottofasi" }));
    const bottone = screen.getByRole("button", { name: "Aggiungi" });
    expect(bottone).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Aggiungi una sottofase a Impianto"), { target: { value: "  Cavi  " } });
    fireEvent.click(bottone);
    expect(a.onAggiungi).toHaveBeenCalledWith("Cavi");
  });

  it("una fase già avviata avvisa, prima di dividerla, che l'avanzamento ripartirà dalle sottofasi", () => {
    render(<SottofasiFase nomeFase="Impianto" avviata={{ percentuale: 60, chiusa: false }} puoModificare puoSegnare {...azioni()} sottofasi={[]} />);
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dividi in sottofasi" }));
    expect(screen.getByRole("note")).toHaveTextContent("già al 60%");
    expect(screen.getByRole("note")).toHaveTextContent("segna subito quelle già completate");
  });

  it("una fase chiusa avvisa che aggiungere sottofasi da fare la riapre", () => {
    render(<SottofasiFase nomeFase="Impianto" avviata={{ percentuale: 100, chiusa: true }} puoModificare puoSegnare {...azioni()} sottofasi={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Dividi in sottofasi" }));
    expect(screen.getByRole("note")).toHaveTextContent("la riapri");
  });

  it("una fase non avviata non avvisa", () => {
    render(<SottofasiFase nomeFase="Impianto" avviata={null} puoModificare puoSegnare {...azioni()} sottofasi={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Dividi in sottofasi" }));
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("rinomina con Invio e toglie dal cestino", () => {
    const a = azioni();
    render(<SottofasiFase nomeFase="Impianto" puoModificare puoSegnare {...a} sottofasi={[riga()]} />);
    menu("Tracce");
    fireEvent.click(screen.getByRole("button", { name: "Rinomina Tracce" }));
    const campo = screen.getByLabelText("Nome della sottofase Tracce");
    fireEvent.change(campo, { target: { value: "Tracce e scassi" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    expect(a.onRinomina).toHaveBeenCalledWith("s1", "Tracce e scassi");
    menu("Tracce");
    fireEvent.click(screen.getByRole("button", { name: "Elimina Tracce" }));
    expect(a.onElimina).toHaveBeenCalledWith("s1");
  });

  it("senza il permesso di modificare non ci sono comandi per aggiungere, rinominare o togliere", () => {
    render(<SottofasiFase nomeFase="Impianto" puoModificare={false} puoSegnare {...azioni()} sottofasi={[riga()]} />);
    expect(screen.queryByLabelText("Aggiungi una sottofase a Impianto")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Altro per Tracce" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rinomina Tracce" })).not.toBeInTheDocument();
  });

  it("senza il permesso di segnare le caselle sono spente", () => {
    render(<SottofasiFase nomeFase="Impianto" puoModificare={false} puoSegnare={false} {...azioni()} sottofasi={[riga()]} />);
    expect(screen.getByRole("checkbox", { name: "Tracce: da fare" })).toBeDisabled();
  });

  it("senza sottofasi e in sola lettura non compare niente", () => {
    const { container } = render(<SottofasiFase nomeFase="Impianto" puoModificare={false} puoSegnare={false} {...azioni()} sottofasi={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("date e giorni: inizio e giorni danno la fine, si salva il piano; date invertite non si salvano", () => {
    const a = { ...azioni(), onPianifica: vi.fn() };
    render(<SottofasiFase nomeFase="Impianto" puoModificare puoSegnare {...a} sottofasi={[riga()]} />);
    menu("Tracce");
    fireEvent.click(screen.getByRole("button", { name: "Date e giorni di Tracce" }));
    fireEvent.change(screen.getByLabelText("Inizio di Tracce"), { target: { value: "2026-10-30" } });
    fireEvent.change(screen.getByLabelText("Giorni necessari per Tracce"), { target: { value: "3" } });
    expect(screen.getByLabelText("Fine di Tracce")).toHaveValue("2026-11-01");
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    expect(a.onPianifica).toHaveBeenCalledWith("s1", { data_inizio: "2026-10-30", data_fine: "2026-11-01", giorni: 3 });

    fireEvent.click(screen.getByRole("button", { name: "Date e giorni di Tracce" }));
    fireEvent.change(screen.getByLabelText("Inizio di Tracce"), { target: { value: "2026-10-30" } });
    fireEvent.change(screen.getByLabelText("Fine di Tracce"), { target: { value: "2026-10-01" } });
    expect(screen.getByRole("alert")).toHaveTextContent("La fine è prima dell'inizio.");
    expect(screen.getByRole("button", { name: "Salva" })).toBeDisabled();
  });

  it("mostra il piano accanto al nome, e chi non modifica non vede il calendario", () => {
    render(<SottofasiFase nomeFase="Impianto" puoModificare={false} puoSegnare {...azioni()} onPianifica={vi.fn()}
      sottofasi={[riga({ data_inizio: "2026-10-30", data_fine: "2026-11-01", giorni: 3 })]} />);
    expect(screen.getByText("30/10 → 01/11 · 3 gg")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Date e giorni di Tracce" })).not.toBeInTheDocument();
  });

  it("spostare l'inizio con i giorni già scritti sposta la fine, e dice di quanto si allunga la fase", () => {
    render(<SottofasiFase nomeFase="Impianto" dateFase={{ start_date: "2026-10-28", end_date: "2026-10-31" }} puoModificare puoSegnare
      {...azioni()} onPianifica={vi.fn()} sottofasi={[riga({ data_inizio: "2026-10-28", data_fine: "2026-10-30", giorni: 3 })]} />);
    menu("Tracce");
    fireEvent.click(screen.getByRole("button", { name: "Date e giorni di Tracce" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Inizio di Tracce"), { target: { value: "2026-11-02" } });
    expect(screen.getByLabelText("Fine di Tracce")).toHaveValue("2026-11-04");
    expect(screen.getByRole("status")).toHaveTextContent("«Impianto» si allunga: dal 28/10 al 04/11.");
  });

  it("si scrivono i giorni sulle righe: il piano le mette in fila nella fase, dice i giorni in più e salva le date", () => {
    const a = { ...azioni(), onPianificaTutte: vi.fn() };
    render(<SottofasiFase nomeFase="Allestimento" dateFase={{ start_date: "2025-09-15", end_date: "2025-09-22" }} puoModificare puoSegnare
      {...a} sottofasi={[riga({ id: "s1", name: "Esecuzione" }), riga({ id: "s2", name: "Verifica" })]} />);
    pianifica();
    fireEvent.change(screen.getByLabelText("Giorni per Esecuzione"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Giorni per Verifica"), { target: { value: "2" } });
    const piano = screen.getByLabelText("Piano delle sottofasi di Allestimento");
    expect(piano).toHaveTextContent("dal 15/09 al 21/09");
    expect(piano).toHaveTextContent("Resta 1 giorno libero nella fase.");
    fireEvent.change(screen.getByLabelText("Giorni per Verifica"), { target: { value: "4" } });
    expect(screen.getByRole("alert")).toHaveTextContent("1 giorno in più della fase: «Allestimento» finirebbe il 23/09.");
    expect(screen.getByText("20/09 → 23/09 · 4 gg · oltre la fase")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Metti le date e allunga la fase di 1 gg" }));
    expect(a.onPianificaTutte).toHaveBeenCalledWith([
      { id: "s1", data_inizio: "2025-09-15", data_fine: "2025-09-19", giorni: 5 },
      { id: "s2", data_inizio: "2025-09-20", data_fine: "2025-09-23", giorni: 4 },
    ]);
  });

  it("riordina con le frecce e mette una sottofase insieme alla precedente", () => {
    const a = { ...azioni(), onRiordina: vi.fn(), onParallelo: vi.fn(), onPianificaTutte: vi.fn() };
    render(<SottofasiFase nomeFase="Impianto" puoModificare puoSegnare {...a}
      sottofasi={[riga({ id: "s1", name: "Tracce" }), riga({ id: "s2", name: "Cavi" }), riga({ id: "s3", name: "Frutti" })]} />);
    menu("Tracce");
    expect(screen.getByRole("button", { name: "Sposta su Tracce" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Sposta giù Tracce" }));
    expect(a.onRiordina).toHaveBeenCalledWith(["s2", "s1", "s3"]);
    pianifica();
    expect(screen.queryByRole("button", { name: "Tracce insieme alla precedente" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cavi insieme alla precedente" }));
    expect(a.onParallelo).toHaveBeenCalledWith("s2", true);
  });

  it("una sottofase fatta dice quando è finita rispetto al previsto", () => {
    render(<SottofasiFase nomeFase="Impianto" puoModificare={false} puoSegnare {...azioni()}
      sottofasi={[riga({ fatta: true, fatta_il: "2025-09-19T10:00:00", data_inizio: "2025-09-15", data_fine: "2025-09-17", giorni: 3 })]} />);
    expect(screen.getByText("finita il 19/09 (+2 gg)")).toBeInTheDocument();
  });

  it("se la fase finisce dopo l'inizio della successiva lo dice e propone di spostarle", () => {
    const onSpostaFasiDopo = vi.fn();
    render(<SottofasiFase nomeFase="Allestimento" dateFase={{ start_date: "2025-09-15", end_date: "2025-09-23" }} puoModificare puoSegnare {...azioni()}
      fasiDopo={[{ id: "f2", name: "Impianti", start_date: "2025-09-20", end_date: "2025-09-30" }, { id: "f3", name: "Finiture", start_date: "2025-10-01", end_date: null }]}
      onSpostaFasiDopo={onSpostaFasiDopo} sottofasi={[riga()]} />);
    expect(screen.getByRole("alert")).toHaveTextContent("«Allestimento» finisce il 23/09: si sovrappone a «Impianti».");
    fireEvent.click(screen.getByRole("button", { name: "Sposta le 2 fasi successive di 4 gg" }));
    expect(onSpostaFasiDopo).toHaveBeenCalledWith(4, ["f2", "f3"]);
  });

  it("con il calendario del cantiere conta i giorni di lavoro e si può includere il sabato", () => {
    const setSabato = vi.fn();
    const lavorativo = (d: string) => ![0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay());
    render(<SottofasiFase nomeFase="Allestimento" dateFase={{ start_date: "2025-09-15", end_date: "2025-09-26" }} puoModificare puoSegnare
      {...azioni()} onPianificaTutte={vi.fn()} calendario={{ lavorativo, sabato: false, setSabato }}
      sottofasi={[riga({ id: "s1", name: "Esecuzione", giorni: 5 }), riga({ id: "s2", name: "Verifica", giorni: 2 })]} />);
    pianifica();
    expect(screen.getByText("22/09 → 23/09 · 2 gg")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Si lavora il sabato"));
    expect(setSabato).toHaveBeenCalledWith(true);
  });

  it("ogni sottofase mostra la sua voce del computo: quantità, costo previsto, venduto e giorni-uomo", () => {
    const voci = new Map([["s1", { quantita: 109.45, unita: "m²", costo: 436.71, importo: 3360 }], ["s2", { quantita: 2, unita: "gg", costo: 0, importo: null }]]);
    const { rerender } = render(<SottofasiFase nomeFase="Tetto" puoModificare puoSegnare {...azioni()} voci={voci} vediVenduto onRisorse={vi.fn()}
      sottofasi={[riga({ id: "s1", name: "Smontaggio manto", giorni: 4, risorse: 3 }), riga({ id: "s2", name: "Attesa maturazione" })]} />);
    const testo = (atteso: RegExp) => screen.getByText((_, el) => el?.tagName === "P" && atteso.test(el.textContent ?? "") && ![...el.children].some(c => atteso.test(c.textContent ?? "")));
    expect(testo(/109,45 m² · costo previsto 436,71 € · venduto 3\.360,00 € · 12 giorni-uomo/)).toBeInTheDocument();
    expect(screen.getByText("senza costo nel listino")).toBeInTheDocument();
    rerender(<SottofasiFase nomeFase="Tetto" puoModificare puoSegnare {...azioni()} voci={voci} vediVenduto={false}
      sottofasi={[riga({ id: "s1", name: "Smontaggio manto" })]} />);
    expect(screen.queryByText(/venduto/)).not.toBeInTheDocument();
  });

  it("una fase con le voci del computo si divide in sottofasi con un clic, e le persone si salvano uscendo dal campo", () => {
    const onSottofasiDalleVoci = vi.fn();
    const { rerender } = render(<SottofasiFase nomeFase="Tetto" puoModificare puoSegnare {...azioni()} sottofasi={[]} vociSenzaSottofase={12} onSottofasiDalleVoci={onSottofasiDalleVoci} />);
    fireEvent.click(screen.getByRole("button", { name: "Dividi nelle 12 voci del computo" }));
    expect(onSottofasiDalleVoci).toHaveBeenCalled();
    const onRisorse = vi.fn();
    rerender(<SottofasiFase nomeFase="Tetto" puoModificare puoSegnare {...azioni()} sottofasi={[riga()]} onRisorse={onRisorse} onPianificaTutte={vi.fn()} />);
    pianifica();
    fireEvent.change(screen.getByLabelText("Persone per Tracce"), { target: { value: "3" } });
    fireEvent.blur(screen.getByLabelText("Persone per Tracce"));
    expect(onRisorse).toHaveBeenCalledWith("s1", 3);
  });

  it("pesa per giorni quando tutte le sottofasi hanno i giorni", () => {
    const a = { ...azioni(), onPesa: vi.fn(), onPianificaTutte: vi.fn() };
    const { rerender } = render(<SottofasiFase nomeFase="Impianto" puoModificare puoSegnare {...a} sottofasi={[riga({ giorni: 10 }), riga({ id: "s2", name: "Cavi" })]} />);
    pianifica();
    expect(screen.queryByRole("button", { name: "Pesa per giorni" })).not.toBeInTheDocument();
    rerender(<SottofasiFase nomeFase="Impianto" puoModificare puoSegnare {...a} sottofasi={[riga({ giorni: 10 }), riga({ id: "s2", name: "Cavi", giorni: 2 })]} />);
    fireEvent.click(screen.getByRole("button", { name: "Pesa per giorni" }));
    expect(a.onPesa).toHaveBeenCalledWith([{ id: "s1", peso: 10 }, { id: "s2", peso: 2 }]);
  });
});
