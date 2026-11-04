import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { DistintaLavorazioni } from "@/components/orders/DistintaLavorazioni";
import type { Sottofase } from "@/lib/orders/sottofasi";

const fasi = [{ id: "f1", name: "Murature", percentuale: 64 }, { id: "f2", name: "Impianti", percentuale: 0 }];
const sottofase: Sottofase = { id: "s1", phase_id: "f1", name: "Controparete", position: 0, peso: 1, fatta: false, fatta_il: null, data_fine: "2026-01-01" };
const voci = [
  { id: "v1", phase_id: "f1", position: 0, descrizione: "Controparete", unita: "mq", quantita: 10, costo_manodopera: 5, costo_materiali: 5, importo: 200, origine_codice: "A1", subphase_id: "s1" as string | null },
  { id: "v2", phase_id: "f2", position: 0, descrizione: "Tubazione", unita: "m", quantita: 2, costo_manodopera: 0, costo_materiali: 0, importo: 50, origine_codice: "B2", subphase_id: null as string | null },
];
const azioni = { onSegna: vi.fn(), onSegnaTutte: vi.fn(), onPianifica: vi.fn(), onPianificaTutte: vi.fn(), onDalleVoci: vi.fn(), onAggiungi: vi.fn(), onRinomina: vi.fn(), onElimina: vi.fn(), onRiordina: vi.fn(), onApriScheda: vi.fn() };
const mostra = (extra: Partial<React.ComponentProps<typeof DistintaLavorazioni>> = {}) => render(
  <DistintaLavorazioni fasi={fasi} sottofasiDi={new Map([["f1", [sottofase]]])} voci={voci}
    economiaDi={new Map([["f1", { venduto: 900, costoPrevisto: 400, costoConsuntivo: 77 }], ["f2", { venduto: 100, costoPrevisto: 0, costoConsuntivo: 0 }]])}
    vedeVenduto vedeCosti vedeMargini puoModificare oggi="2026-11-04" {...azioni} {...extra} />,
);
const iva = { aliquota: 10, valore_commessa: 1000, debito_fatturato: 0, imponibile_fatturato: 0, fatture_emesse: 0, debito_previsto: 100, debito_da_fatturare: 100, split_payment: 0, credito_fatture: 30, imponibile_acquisti: 300, fatture_ricevute: 1, credito_previsto_costi: 0, costi_senza_fattura_elettronica: 0, credito_previsto_ditte: 0, reverse_charge_imponibile: 500, reverse_charge_iva: 50, saldo_ad_oggi: -30, saldo_previsto: 70 };
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Distinta delle lavorazioni", () => {
  it("una riga per voce, col nome della fase che le separa", () => {
    mostra();
    expect(screen.getByRole("button", { name: "Controparete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tubazione" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Impianti" }).length).toBeGreaterThan(0);
  });
  it("chi non vede i costi non vede previsto, consuntivo e il filtro relativo", () => {
    mostra({ vedeCosti: false, vedeVenduto: false, vedeMargini: false });
    expect(screen.queryByText("Previsto")).toBeNull();
    expect(screen.queryByText("Consuntivo")).toBeNull();
    expect(screen.queryByText("Venduto imponibile")).toBeNull();
    expect(screen.queryByRole("button", { name: /Senza previsto/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Economia" })).toBeNull();
  });
  it("il margine è un permesso a sé: venduto e costi non bastano", () => {
    mostra({ vedeMargini: false });
    fireEvent.click(screen.getByRole("button", { name: "Economia" }));
    expect(screen.queryByText("Mrg %")).toBeNull();
    expect(screen.queryByText("50%")).toBeNull();
  });
  it("il margine si vede a chi ha il permesso", () => {
    mostra();
    fireEvent.click(screen.getByRole("button", { name: "Economia" }));
    expect(screen.getByText("Mrg %")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
  });
  it("il filtro «in ritardo» lascia solo le righe scadute", () => {
    mostra();
    fireEvent.click(screen.getByRole("button", { name: /In ritardo/ }));
    expect(screen.getByRole("button", { name: "Controparete" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tubazione" })).toBeNull();
  });
  it("si spunta direttamente dalla riga, solo se c'è una sottofase", () => {
    mostra();
    fireEvent.click(screen.getByRole("checkbox", { name: "Controparete: da fare" }));
    expect(azioni.onSegna).toHaveBeenCalledExactlyOnceWith("s1", true);
    expect(screen.queryByRole("checkbox", { name: /Tubazione: / })).toBeNull();
  });
  it("le righe scelte senza sottofase restano fuori dalle date in blocco, e lo dice", () => {
    mostra();
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleziona tutte le righe" }));
    const barra = screen.getByRole("group", { name: "Azioni sulle righe scelte" });
    expect(barra).toHaveTextContent("2 scelte");
    expect(barra).toHaveTextContent("1 senza sottofase");
    fireEvent.change(within(barra).getByLabelText("Fine per le righe scelte"), { target: { value: "2026-12-01" } });
    fireEvent.click(within(barra).getByRole("button", { name: "Applica le date" }));
    expect(azioni.onPianificaTutte).toHaveBeenCalledExactlyOnceWith([{ id: "s1", data_inizio: null, data_fine: "2026-12-01", giorni: null }]);
  });
  it("una data in blocco incoerente con la riga non invia niente", () => {
    mostra({ sottofasiDi: new Map([["f1", [{ ...sottofase, data_inizio: "2026-12-10", data_fine: null }]]]) });
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleziona tutte le righe" }));
    const barra = screen.getByRole("group", { name: "Azioni sulle righe scelte" });
    fireEvent.change(within(barra).getByLabelText("Fine per le righe scelte"), { target: { value: "2026-12-01" } });
    fireEvent.click(within(barra).getByRole("button", { name: "Applica le date" }));
    expect(azioni.onPianificaTutte).not.toHaveBeenCalled();
    expect(barra).toHaveTextContent("2 scelte");
  });
  it("segnare in blocco è una scrittura sola", () => {
    mostra();
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleziona tutte le righe" }));
    fireEvent.click(screen.getByRole("button", { name: "Segna fatte" }));
    expect(azioni.onSegnaTutte).toHaveBeenCalledExactlyOnceWith(["s1"], true);
    expect(azioni.onSegna).not.toHaveBeenCalled();
  });
  it("il nome della fase apre quella fase, anche con due fasi omonime", () => {
    mostra({ fasi: [{ id: "f1", name: "Uguale" }, { id: "f2", name: "Uguale" }] });
    const titoli = screen.getAllByRole("button", { name: "Uguale" }).filter((b) => !b.closest("nav"));
    fireEvent.click(titoli[1]);
    expect(screen.getByRole("button", { name: "Tubazione" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Controparete" })).toBeNull();
  });
  it("mostra l'avanzamento vero, pesato sul venduto, e dice che i costi sono in imponibile", () => {
    mostra();
    const riepilogo = screen.getByText("Avanzamento").closest("dl")!;
    expect(riepilogo).toHaveTextContent("58%");
    expect(riepilogo).toHaveTextContent("1.000,00");
    expect(riepilogo).toHaveTextContent("IVA esclusa");
  });
  it("dividere una fase già avviata chiede conferma, perché ne azzera l'avanzamento", () => {
    const voce2 = { ...voci[0], id: "v3", subphase_id: null as string | null, descrizione: "Altra voce" };
    mostra({ voci: [...voci, voce2] });
    fireEvent.click(within(screen.getByRole("navigation", { name: "Fasi" })).getByRole("button", { name: /^Murature/ }));
    fireEvent.click(screen.getByRole("button", { name: /Crea 1 sottofasi/ }));
    expect(azioni.onDalleVoci).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Crea le sottofasi" }));
    expect(azioni.onDalleVoci).toHaveBeenCalledExactlyOnceWith("f1");
  });
  it("distingue imponibile, IVA e totale, e dice quanta IVA resta da versare col reverse charge", () => {
    mostra({ iva });
    const riepilogo = screen.getByText("Avanzamento").closest("dl")!;
    expect(riepilogo).toHaveTextContent("1.000,00");
    expect(riepilogo).toHaveTextContent("100,00");
    expect(riepilogo).toHaveTextContent("1.100,00");
    expect(screen.getByText(/70,00 . da versare/)).toBeInTheDocument();
    expect(screen.getByText(/reverse charge 500,00/)).toBeInTheDocument();
  });
  it("il venduto delle righe si legge imponibile o con IVA", () => {
    mostra({ iva });
    expect(screen.getByText("200,00 €")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Con IVA" }));
    expect(screen.getByText("220,00 €")).toBeInTheDocument();
  });
  it("senza i costi non si vede il conto dell'IVA con acquisti e crediti", () => {
    mostra({ iva, vedeCosti: false });
    expect(screen.queryByText(/da versare/)).toBeNull();
  });
  it("i costi che non stanno in una fase si vedono a parte, solo con tutte le fasi", () => {
    mostra({ consuntivoSenzaFase: 33 });
    expect(screen.getByText(/33,00 . senza fase/)).toBeInTheDocument();
  });
  it("con la fase finita, una voce senza sottofase non resta da fare", () => {
    mostra({ fasi: [fasi[0], { id: "f2", name: "Impianti", percentuale: 100 }] });
    expect(screen.getByRole("button", { name: /Da fare/ })).toHaveTextContent("1");
  });
  it("aggiunge una sottofase alla fase aperta", () => {
    mostra();
    expect(screen.queryByLabelText("Nuova sottofase")).toBeNull();
    fireEvent.click(within(screen.getByRole("navigation", { name: "Fasi" })).getByRole("button", { name: /^Murature/ }));
    fireEvent.change(screen.getByLabelText("Nuova sottofase"), { target: { value: " Rasatura " } });
    fireEvent.keyDown(screen.getByLabelText("Nuova sottofase"), { key: "Enter" });
    expect(azioni.onAggiungi).toHaveBeenCalledExactlyOnceWith("f1", "Rasatura");
  });
  it("mette le righe scelte in fila dai giorni scritti", () => {
    mostra();
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleziona Controparete" }));
    const barra = screen.getByRole("group", { name: "Azioni sulle righe scelte" });
    fireEvent.change(within(barra).getByLabelText("Inizio per le righe scelte"), { target: { value: "2026-12-01" } });
    fireEvent.change(within(barra).getByLabelText("Giorni per ogni riga scelta"), { target: { value: "3" } });
    fireEvent.click(within(barra).getByRole("button", { name: "Metti in fila" }));
    expect(azioni.onPianificaTutte).toHaveBeenCalledExactlyOnceWith([{ id: "s1", data_inizio: "2026-12-01", data_fine: "2026-12-03", giorni: 3 }]);
  });
  it("una voce senza sottofase non ha comandi di riga", () => {
    mostra();
    expect(screen.getByRole("button", { name: "Altro per Controparete" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Altro per Tubazione" })).toBeNull();
  });
  it("senza venduto sulle fasi vale il contratto, e una fase dice che è da ripartire", () => {
    const vuota = new Map([["f1", { venduto: 0, costoPrevisto: 0, costoConsuntivo: 0 }], ["f2", { venduto: 0, costoPrevisto: 0, costoConsuntivo: 0 }]]);
    mostra({ economiaDi: vuota, iva: { ...iva, valore_commessa: 85000 } });
    const riepilogo = screen.getByText("Avanzamento").closest("dl")!;
    expect(riepilogo).toHaveTextContent("85.000,00");
    expect(riepilogo).toHaveTextContent("93.500,00");
    fireEvent.click(within(screen.getByRole("navigation", { name: "Fasi" })).getByRole("button", { name: /^Murature/ }));
    expect(screen.getByText("Avanzamento").closest("dl")).toHaveTextContent("Da ripartire");
  });
  it("le colonne senza dati non ci sono", () => {
    mostra({ voci: [] });
    expect(screen.queryByText("Codice")).toBeNull();
    expect(screen.queryByText("Quantità")).toBeNull();
  });
  it("in sola lettura non si sceglie e non si spunta", () => {
    mostra({ puoModificare: false });
    expect(screen.queryByRole("checkbox", { name: /Seleziona/ })).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Controparete: da fare" })).toBeDisabled();
  });
});
