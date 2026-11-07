import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { DistintaLavorazioni } from "@/components/orders/DistintaLavorazioni";
import type { Sottofase } from "@/lib/orders/sottofasi";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: [] as unknown[], isLoading: false, isError: false }) }));

const fasi = [{ id: "f1", name: "Murature", percentuale: 64, status: "in_corso" }, { id: "f2", name: "Impianti", percentuale: 0, status: "da_iniziare" }];
const sottofase: Sottofase = { id: "s1", phase_id: "f1", name: "Controparete", position: 0, peso: 1, fatta: false, fatta_il: null, data_fine: "2026-01-01" };
const voci = [
  { id: "v1", phase_id: "f1", position: 0, descrizione: "Controparete", unita: "mq", quantita: 10, costo_manodopera: 5, costo_materiali: 5, importo: 200, origine_codice: "A1", subphase_id: "s1" as string | null },
  { id: "v2", phase_id: "f2", position: 0, descrizione: "Tubazione", unita: "m", quantita: 2, costo_manodopera: 0, costo_materiali: 0, importo: 50, origine_codice: "B2", subphase_id: null as string | null },
];
const azioni = { onAssegna: vi.fn(), onSegna: vi.fn(), onAvanza: vi.fn(), onSegnaTutte: vi.fn(), onPianifica: vi.fn(), onPianificaTutte: vi.fn(), onDateFase: vi.fn(), onDalleVoci: vi.fn(), onAggiungi: vi.fn(), onRinomina: vi.fn(), onElimina: vi.fn(), onRiordina: vi.fn(), onApriScheda: vi.fn() };
const iva = { aliquota: 10, valore_commessa: 1000, debito_fatturato: 0, imponibile_fatturato: 0, fatture_emesse: 0, debito_previsto: 100, debito_da_fatturare: 100, split_payment: 0, credito_fatture: 30, imponibile_acquisti: 300, fatture_ricevute: 1, credito_previsto_costi: 0, costi_senza_fattura_elettronica: 0, credito_previsto_ditte: 0, reverse_charge_imponibile: 500, reverse_charge_iva: 50, saldo_ad_oggi: -30, saldo_previsto: 70 };
const chiDi = new Map([["f1", { squadre: ["Squadra A"], persone: ["Mario"], ditte: [], mezzi: ["Gru"], articoli: 4 }]]);
const mostra = (extra: Partial<React.ComponentProps<typeof DistintaLavorazioni>> = {}) => render(
  <DistintaLavorazioni fasi={fasi} sottofasiDi={new Map([["f1", [sottofase]]])} voci={voci}
    economiaDi={new Map([["f1", { venduto: 900, costoPrevisto: 400, costoConsuntivo: 77 }], ["f2", { venduto: 100, costoPrevisto: 0, costoConsuntivo: 0 }]])}
    chiDi={chiDi} squadre={[{ id: "s1", nome: "Squadra A" }]} persone={[{ id: "p1", nome: "Mario" }]} ditte={[]} puoSquadre assegnaInCorso={false}
    vedeVenduto vedeCosti vedeMargini puoModificare oggi="2026-11-04" {...azioni} {...extra} />,
);
const riepilogo = () => screen.getByText("Avanzamento").closest("dl")!;
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Tabella delle lavorazioni", () => {
  const elenco = () => within(screen.getByRole("navigation", { name: "Fasi" }));
  const apriImpianti = () => fireEvent.click(screen.getByRole("button", { name: "Apri le voci di Impianti" }));
  it("una fase si apre sulle sue voci: quelle in corso partono aperte", () => {
    mostra();
    expect(screen.getByRole("button", { name: /^Controparete/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Tubazione/ })).toBeNull();
    apriImpianti();
    expect(screen.getByRole("button", { name: /^Tubazione/ })).toBeInTheDocument();
  });
  it("dall'elenco a lato si vede una fase sola", () => {
    mostra();
    fireEvent.click(elenco().getByRole("button", { name: /^Impianti/ }));
    expect(screen.getByRole("button", { name: /^Tubazione/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Controparete/ })).toBeNull();
  });
  it("con tante voci si parte dalla fase in corso", () => {
    const tante = Array.from({ length: 31 }, (_, i): Sottofase => ({ ...sottofase, id: `x${i}`, name: `Voce ${i}`, position: i }));
    mostra({ sottofasiDi: new Map([["f1", tante]]), voci: [] });
    expect(screen.queryByText("Tutte le fasi")?.closest("button")).not.toHaveAttribute("aria-current");
    expect(elenco().getByRole("button", { name: /^Murature/ })).toHaveAttribute("aria-current", "true");
  });
  it("sulla riga della fase ci sono chi la fa, venduto, previsto e consuntivo", () => {
    mostra();
    expect(screen.getByRole("button", { name: "Chi fa Murature" })).toHaveTextContent("Squadra A +1");
    expect(screen.getAllByText("900,00 €").length).toBeGreaterThan(0);
    expect(screen.getAllByText("400,00 €").length).toBeGreaterThan(0);
    expect(screen.getAllByText("77,00 €").length).toBeGreaterThan(0);
  });
  it("una fase senza nessuno invita ad assegnare, e si assegna dalla riga", () => {
    mostra();
    const bottone = screen.getByRole("button", { name: "Chi fa Impianti" });
    expect(bottone).toHaveTextContent("+ Assegna");
    fireEvent.click(bottone);
    const dialogo = screen.getByRole("dialog");
    fireEvent.click(within(dialogo).getByRole("checkbox", { name: "Squadra A" }));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Assegna" }));
    expect(azioni.onAssegna.mock.calls[0][0]).toEqual({ fasi: ["f2"], squadre: ["s1"], persone: [], ditte: [] });
  });
  it("selezionando più fasi si assegna a tutte", () => {
    mostra();
    fireEvent.click(elenco().getByRole("checkbox", { name: "Seleziona Murature" }));
    fireEvent.click(elenco().getByRole("checkbox", { name: "Seleziona Impianti" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Azioni sulle righe scelte" })).getByRole("button", { name: "Assegna" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Chi fa 2 fasi");
  });
  it("chi non vede i costi non vede previsto, consuntivo, IVA da versare e margine", () => {
    mostra({ vedeCosti: false, vedeVenduto: false, vedeMargini: false, iva });
    expect(screen.queryByText("Previsto")).toBeNull();
    expect(screen.queryByText("Consuntivo")).toBeNull();
    expect(screen.queryByText("Imponibile")).toBeNull();
    expect(screen.queryByText("IVA da versare")).toBeNull();
    expect(screen.queryAllByText("900,00 €")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /Senza previsto/ })).toBeNull();
  });
  it("il margine è un permesso a sé: venduto e costi non bastano", () => {
    mostra({ vedeMargini: false });
    expect(screen.queryByText("Margine previsto")).toBeNull();
  });
  it("i filtri senza righe non si vedono", () => {
    mostra();
    expect(screen.getByRole("button", { name: /In ritardo/ })).toBeInTheDocument();
    cleanup();
    mostra({ oggi: "2025-01-01" });
    expect(screen.queryByRole("button", { name: /In ritardo/ })).toBeNull();
  });
  it("il filtro «in ritardo» apre le fasi e lascia solo le righe scadute", () => {
    mostra();
    fireEvent.click(screen.getByRole("button", { name: /In ritardo/ }));
    expect(screen.getByRole("button", { name: /^Controparete/ })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Impianti/ }).every((b) => b.closest("nav"))).toBe(true);
  });
  it("si spunta dalla riga, solo se c'è una sottofase", () => {
    mostra();
    apriImpianti();
    fireEvent.click(screen.getByRole("checkbox", { name: "Controparete: da fare" }));
    expect(azioni.onSegna).toHaveBeenCalledExactlyOnceWith("s1", true);
    expect(screen.queryByRole("checkbox", { name: /Tubazione: / })).toBeNull();
  });
  it("una data si cambia cliccandola", () => {
    mostra();
    fireEvent.click(screen.getByRole("button", { name: "Inizio di Controparete" }));
    fireEvent.change(screen.getByLabelText("Inizio di Controparete"), { target: { value: "2025-12-01" } });
    fireEvent.blur(screen.getByLabelText("Inizio di Controparete"));
    expect(azioni.onPianifica).toHaveBeenCalledExactlyOnceWith("s1", { data_inizio: "2025-12-01", data_fine: "2026-01-01", giorni: null });
  });
  it("una data incoerente non si salva", () => {
    mostra();
    fireEvent.click(screen.getByRole("button", { name: "Inizio di Controparete" }));
    fireEvent.change(screen.getByLabelText("Inizio di Controparete"), { target: { value: "2026-12-01" } });
    fireEvent.blur(screen.getByLabelText("Inizio di Controparete"));
    expect(azioni.onPianifica).not.toHaveBeenCalled();
  });
  it("la data della fase si cambia dalla sua riga", () => {
    mostra();
    fireEvent.click(screen.getByRole("button", { name: "Fine di Impianti" }));
    fireEvent.change(screen.getByLabelText("Fine di Impianti"), { target: { value: "2026-12-01" } });
    fireEvent.blur(screen.getByLabelText("Fine di Impianti"));
    expect(azioni.onDateFase).toHaveBeenCalledExactlyOnceWith("f2", { start_date: null, end_date: "2026-12-01" });
  });
  it("segnare in blocco è una scrittura sola", () => {
    mostra();
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleziona Controparete" }));
    fireEvent.click(screen.getByRole("button", { name: "Segna fatte" }));
    expect(azioni.onSegnaTutte).toHaveBeenCalledExactlyOnceWith(["s1"], true);
    expect(azioni.onSegna).not.toHaveBeenCalled();
  });
  it("mostra lo stesso avanzamento della testata della commessa", () => {
    mostra();
    expect(riepilogo()).toHaveTextContent("32%");
  });
  it("distingue imponibile e con IVA, e dice quanta IVA resta da versare", () => {
    mostra({ iva });
    expect(riepilogo()).toHaveTextContent("1.000,00");
    expect(riepilogo()).toHaveTextContent("1.100,00");
    expect(screen.getByText("IVA da versare").nextSibling).toHaveTextContent("70,00");
  });
  it("il venduto delle righe si legge imponibile o con IVA", () => {
    mostra({ iva });
    expect(screen.getByText("200,00 €")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Imponibile" }));
    expect(screen.getByText("220,00 €")).toBeInTheDocument();
  });
  it("senza venduto sulle fasi vale il contratto", () => {
    const vuota = new Map([["f1", { venduto: 0, costoPrevisto: 0, costoConsuntivo: 0 }], ["f2", { venduto: 0, costoPrevisto: 0, costoConsuntivo: 0 }]]);
    mostra({ economiaDi: vuota, voci: [], iva: { ...iva, valore_commessa: 85000 } });
    expect(riepilogo()).toHaveTextContent("85.000,00");
    expect(riepilogo()).toHaveTextContent("93.500,00");
  });
  it("su ogni voce si leggono quantità e stato", () => {
    mostra();
    expect(screen.getByText("10 mq")).toBeInTheDocument();
    expect(screen.getByText("Da fare", { selector: "div" })).toBeInTheDocument();
  });
  it("un clic sulla voce apre il popup con tutto, e si passa alla voce dopo", () => {
    mostra({ fasi: [{ ...fasi[0] }, { ...fasi[1], status: "in_corso" }] });
    fireEvent.click(screen.getByRole("button", { name: /^Controparete/ }));
    const popup = screen.getByRole("dialog");
    expect(within(popup).getByText("Stato dei lavori")).toBeInTheDocument();
    expect(within(popup).getByText("Costo previsto")).toBeInTheDocument();
    expect(within(popup).getByText("1 di 2")).toBeInTheDocument();
    fireEvent.click(within(popup).getByRole("button", { name: "Voce dopo" }));
    expect(within(screen.getByRole("dialog")).getByText("Tubazione")).toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).getByText(/non ha ancora una sottofase/)).toBeInTheDocument();
  });
  it("nel popup le date si salvano solo se coerenti", () => {
    mostra();
    fireEvent.click(screen.getByRole("button", { name: /^Controparete/ }));
    const popup = screen.getByRole("dialog");
    fireEvent.change(within(popup).getByLabelText("Dal"), { target: { value: "2026-12-01" } });
    expect(within(popup).getByRole("alert")).toHaveTextContent("La fine viene prima");
    expect(within(popup).getByRole("button", { name: "Salva le date" })).toBeDisabled();
    fireEvent.change(within(popup).getByLabelText("Dal"), { target: { value: "2025-12-01" } });
    fireEvent.click(within(popup).getByRole("button", { name: "Salva le date" }));
    expect(azioni.onPianifica).toHaveBeenCalledExactlyOnceWith("s1", { data_inizio: "2025-12-01", data_fine: "2026-01-01", giorni: null });
  });
  it("nel popup cambiando i giorni la fine la ricalcola il database", () => {
    mostra();
    fireEvent.click(screen.getByRole("button", { name: /^Controparete/ }));
    const popup = screen.getByRole("dialog");
    fireEvent.change(within(popup).getByLabelText("Dal"), { target: { value: "2025-12-01" } });
    fireEvent.change(within(popup).getByLabelText("Giorni"), { target: { value: "7" } });
    fireEvent.click(within(popup).getByRole("button", { name: "Salva le date" }));
    expect(azioni.onPianifica.mock.calls[0][1]).toMatchObject({ data_fine: null, giorni: 7 });
  });
  it("nel popup un pulsante salva subito la percentuale", () => {
    mostra();
    fireEvent.click(screen.getByRole("button", { name: /^Controparete/ }));
    const popup = screen.getByRole("dialog");
    fireEvent.click(within(popup).getByRole("button", { name: "50%" }));
    expect(azioni.onAvanza.mock.calls[0][0]).toBe("s1");
    expect(azioni.onAvanza.mock.calls[0][1].percentuale).toBe(50);
  });
  it("nel popup i giorni scritti restano cambiando solo le date", () => {
    const s = sottofase;
    mostra({ sottofasiDi: new Map([["f1", [{ ...s, data_inizio: "2026-01-05", data_fine: "2026-01-16", giorni: 3 }]]]) });
    fireEvent.click(screen.getByRole("button", { name: /^Controparete/ }));
    const popup = screen.getByRole("dialog");
    fireEvent.change(within(popup).getByLabelText("Al"), { target: { value: "2026-01-23" } });
    fireEvent.click(within(popup).getByRole("button", { name: "Salva le date" }));
    expect(azioni.onPianifica).toHaveBeenCalledExactlyOnceWith(s.id, { data_inizio: "2026-01-05", data_fine: "2026-01-23", giorni: 3 });
  });
  it("un clic sul nome della fase apre la sua scheda", () => {
    mostra();
    fireEvent.click(screen.getByRole("button", { name: "Scheda di Murature" }));
    expect(azioni.onApriScheda).toHaveBeenCalledExactlyOnceWith("f1");
  });
  it("il consuntivo senza fase porta ai costi da sistemare", () => {
    const onCostiSenzaFase = vi.fn();
    mostra({ consuntivoSenzaFase: 1200, onCostiSenzaFase });
    fireEvent.click(within(riepilogo()).getByRole("button", { name: /senza fase/ }));
    expect(onCostiSenzaFase).toHaveBeenCalledOnce();
  });
  it("«Aggiungi sottofase» è sempre in vista e un elenco incollato crea una riga per voce", () => {
    const onAggiungiTante = vi.fn();
    mostra({ onAggiungiTante });
    fireEvent.click(screen.getAllByRole("button", { name: "Aggiungi sottofase" })[0]);
    fireEvent.paste(screen.getByPlaceholderText(/Nome e Invio/), { clipboardData: { getData: () => "Tracce\n\n  Cavi \nCollaudo" } });
    expect(onAggiungiTante).toHaveBeenCalledExactlyOnceWith("f1", ["Tracce", "Cavi", "Collaudo"]);
  });
  it("nel popup una sottofase riceve quantità e prezzi, e non si salva due volte", () => {
    const onSalvaVoce = vi.fn();
    mostra({ onSalvaVoce });
    fireEvent.click(screen.getByRole("button", { name: /^Controparete/ }));
    const popup = screen.getByRole("dialog");
    fireEvent.click(within(popup).getByRole("button", { name: /quantità e prezzi/ }));
    fireEvent.change(within(popup).getByLabelText("Quantità"), { target: { value: "12" } });
    const salva = within(popup).getByRole("button", { name: "Salva quantità e prezzi" });
    fireEvent.click(salva);
    expect(onSalvaVoce.mock.calls[0][1]).toMatchObject({ quantita: 12 });
    expect(within(popup).getByRole("button", { name: "Salvataggio…" })).toBeDisabled();
  });
  it("aggiornamento rapido: si scrive il totale fatto e Invio passa alla riga dopo", () => {
    mostra({ fasi: [{ ...fasi[0], status: "in_corso" }, { ...fasi[1], status: "in_corso" }] });
    fireEvent.click(screen.getByRole("button", { name: "Aggiorna avanzamento" }));
    const campi = document.querySelectorAll<HTMLInputElement>("input[data-rapido]");
    expect(campi.length).toBeGreaterThan(0);
    fireEvent.change(campi[0], { target: { value: "40" } });
    fireEvent.keyDown(campi[0], { key: "Enter" });
    expect(azioni.onAvanza).toHaveBeenCalledTimes(1);
    expect(azioni.onAvanza.mock.calls[0][0]).toBe("s1");
    expect(screen.getByRole("button", { name: "Fine aggiornamento" })).toHaveAttribute("aria-pressed", "true");
  });
  it("chi fa la sottofase: si vede sulla riga e si aggiunge dal popup", () => {
    const onAggiungiChi = vi.fn();
    mostra({ persone: [{ id: "p1", nome: "Mario Rossi" }], chiSottofasi: { disponibile: true, perSottofase: new Map([["s1", [{ id: "c1", subphase_id: "s1", employee_id: "p1", external_team_id: null }]]]) }, onAggiungiChi });
    expect(screen.getAllByText("Mario Rossi").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /^Controparete/ }));
    const popup = screen.getByRole("dialog");
    fireEvent.change(within(popup).getByLabelText("Aggiungi chi fa questa sottofase"), { target: { value: "p:p1" } });
    expect(onAggiungiChi).toHaveBeenCalledExactlyOnceWith(["s1"], { persona: "p1" });
  });
  it("in sola lettura non si sceglie e non si spunta", () => {
    mostra({ puoModificare: false, puoSquadre: false });
    expect(screen.queryByRole("checkbox", { name: /Seleziona/ })).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Controparete: da fare" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Chi fa Murature" })).toBeNull();
  });
  it("la barra dello stato avanzamento lavori dice quanto è fatto e se si è in ritardo", () => {
    const conDate = [
      { ...fasi[0], start_date: "2026-11-01", end_date: "2026-11-05" },
      { ...fasi[1], start_date: "2026-11-06", end_date: "2026-11-10" },
    ];
    mostra({ fasi: conDate, oggi: "2026-11-09" });
    const barra = screen.getByRole("progressbar", { name: "Stato avanzamento lavori" });
    expect(barra).toHaveAttribute("aria-valuenow", "32");
    expect(barra.getAttribute("aria-valuetext")).toContain("90% del tempo trascorso");
    expect(riepilogo()).toHaveTextContent("in ritardo di 58 punti");
  });
  it("senza date sulle fasi la barra mostra solo quanto è fatto", () => {
    mostra();
    expect(screen.getByRole("progressbar", { name: "Stato avanzamento lavori" })).toHaveAttribute("aria-valuenow", "32");
    expect(riepilogo()).toHaveTextContent("senza date sulle fasi");
  });
});
