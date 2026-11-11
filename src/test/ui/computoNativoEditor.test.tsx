import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { fireEvent, render as renderRtl, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ComputoNativoEditor from "@/components/computo/ComputoNativoEditor";
import { bozzaVuota, leggiBozzaComputo, voceVuota } from "@/lib/computo/editorNativo";

// Il passo Dati cerca i contatti del CRM dell'azienda: qui basta un'azienda qualsiasi.
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "azienda-test" }));
const render = (ui: ReactElement) => renderRtl(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
const esporta = vi.fn().mockResolvedValue(undefined);
const genera = vi.fn().mockResolvedValue(new Blob(["%PDF-test"], { type: "application/pdf" }));
vi.mock("@/lib/computo/esportaComputo", () => ({
  esportaComputoPdf: (...args: unknown[]) => esporta(...args),
  generaDocumentoComputo: (...args: unknown[]) => genera(...args),
}));
beforeEach(() => { localStorage.clear(); esporta.mockClear(); genera.mockClear(); HTMLElement.prototype.scrollIntoView = vi.fn(); });
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } });
const scegliFormato = async (name: string) => {
  fireEvent.click(await screen.findByRole("radio", { name: new RegExp(`^${name}`) }));
};

describe("editor computo integrato", () => {
  it("rimuove l’avviso di lavorazione mancante anche ripristinando la voce con Annulla", async () => {
    const key = "ui-undo-opzionale";
    localStorage.setItem(key, JSON.stringify({ ...bozzaVuota(), voci: [{ ...voceVuota(), descrizione: "Posa demo", quantita: "36", prezzo: "20" }] }));
    render(<ComputoNativoEditor initialFase={2} storageKey={key} />);
    fireEvent.click(screen.getByRole("button", { name: "Apri voce 1" }));
    fireEvent.click(screen.getByRole("switch", { name: "Opzionale (fuori dal totale)" }));
    fireEvent.click(screen.getByRole("button", { name: "Scarica preventivo" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Aggiungi almeno una lavorazione."));
    expect(esporta).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Annulla ultima modifica" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Riepilogo del computo")).toHaveTextContent("720,00 €");
    await waitFor(() => expect(leggiBozzaComputo(localStorage.getItem(key)!).voci[0].opzionale).toBeFalsy());
    fireEvent.click(screen.getByRole("button", { name: "Scarica preventivo" }));
    await waitFor(() => expect(esporta).toHaveBeenCalledOnce());
    expect(esporta.mock.calls[0][0][0].importo_computo).toBe(720);
  });
  it("avvisa che gli allegati originali possono contenere prezzi nella versione senza prezzi", async () => {
    localStorage.setItem("ui-privacy-allegati", JSON.stringify({ ...bozzaVuota(), allegati: [{ id: crypto.randomUUID(), nome: "foto.jpg", tipo: "foto", mime: "image/jpeg", dimensione: 10, includi: true }] }));
    render(<ComputoNativoEditor initialFase={4} storageKey="ui-privacy-allegati" />);
    await scegliFormato("Computo senza prezzi");
    expect(screen.getByRole("note")).toHaveTextContent("inclusi eventuali prezzi o dati personali");
  });
  it("salva il trattamento IVA e blocca un'aliquota non valida prima del download", async () => {
    localStorage.setItem("ui-iva", JSON.stringify({ ...bozzaVuota(), voci: [{ ...voceVuota(), descrizione: "Scavo", quantita: "2", prezzo: "133" }] }));
    render(<ComputoNativoEditor initialFase={3} storageKey="ui-iva" />);
    fireEvent.click(screen.getByRole("combobox", { name: "Trattamento IVA" }));
    fireEvent.click(await screen.findByRole("option", { name: "Applica IVA" }));
    expect(screen.getByText("324,52 €")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("combobox", { name: "Aliquota IVA" }));
    fireEvent.click(await screen.findByRole("option", { name: "Personalizzata" }));
    fireEvent.change(screen.getByLabelText("Aliquota IVA personalizzata"), { target: { value: "101" } });
    expect(screen.getByRole("button", { name: "Scarica preventivo" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Aliquota IVA personalizzata"), { target: { value: "10" } });
    expect(screen.getByLabelText("Aliquota IVA personalizzata")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Aliquota IVA personalizzata"), { target: { value: "10,5" } });
    expect(screen.getByRole("button", { name: "Scarica preventivo" })).toBeEnabled();
    await waitFor(() => expect(leggiBozzaComputo(localStorage.getItem("ui-iva")!).ivaAliquota).toBe("10,5"));
    fireEvent.click(screen.getByRole("button", { name: "Scarica preventivo" }));
    await waitFor(() => expect(esporta).toHaveBeenCalled());
    expect(esporta.mock.calls[0][1]).toMatchObject({ ivaModalita: "applicata", ivaAliquota: "10,5" });
  });
  it("consente di vedere una bozza incompleta senza sbloccare il PDF definitivo", async () => {
    localStorage.setItem("ui-parziale", JSON.stringify({ ...bozzaVuota(), voci: [{ ...voceVuota(), descrizione: "Voce da verificare" }] }));
    const { unmount } = render(<ComputoNativoEditor initialFase={4} storageKey="ui-parziale" />);
    const definitivo = screen.getByRole("button", { name: "Scarica preventivo" });
    expect(definitivo).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Anteprima" }));
    expect(await screen.findByRole("heading", { name: "Anteprima bozza parziale" })).toBeInTheDocument();
    expect(genera.mock.calls[0][1].parziale).toContain("BOZZA PARZIALE");
    expect(definitivo).toBeDisabled(); expect(esporta).not.toHaveBeenCalled();
    unmount();
  });
  it("permette di scegliere la versione e nascondere gli unitari senza cambiare i prezzi delle voci", async () => {
    const b = { ...bozzaVuota(), voci: [{ ...voceVuota(), descrizione: "Posa", quantita: "12", prezzo: "20" }] };
    localStorage.setItem("ui-varianti", JSON.stringify(b));
    render(<ComputoNativoEditor initialFase={4} storageKey="ui-varianti" />);
    await scegliFormato("Riepilogo per capitoli");
    expect(screen.getByRole("switch", { name: "Dettaglio delle misure" })).not.toBeChecked();
    expect(screen.getByRole("switch", { name: "Prezzi unitari" })).toBeDisabled();
    await scegliFormato("Computo dettagliato con prezzi e misure");
    expect(screen.getByRole("switch", { name: "Dettaglio delle misure" })).toBeChecked();
    fireEvent.click(screen.getByRole("switch", { name: "Prezzi unitari" }));
    fireEvent.click(screen.getByRole("button", { name: "Scarica documento" }));
    await waitFor(() => expect(esporta).toHaveBeenCalled());
    expect(esporta.mock.calls[0][1]).toMatchObject({ mostraPrezziUnitari: false, mostraImporti: true });
    expect(esporta.mock.calls[0][0][0].prezzo_unitario_computo).toBe(20);
  });
  it("ripristina una copia e conserva il documento attuale se il file è corrotto", async () => {
    render(<ComputoNativoEditor initialFase={2} storageKey="ui-import" />);
    const nuova = { ...bozzaVuota(), voci: [{ ...voceVuota(), descrizione: "Voce ripristinata", quantita: "4", prezzo: "12" }] };
    fireEvent.change(screen.getByLabelText("File bozza computo"), { target: { files: [{ size: 100, text: async () => JSON.stringify(nuova) }] } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Apri voce 1" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Apri voce 1" }));
    expect(screen.getByLabelText("Descrizione della lavorazione")).toHaveValue("Voce ripristinata");
    fireEvent.change(screen.getByLabelText("File bozza computo"), { target: { files: [{ size: 3, text: async () => "no!" }] } });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("non è stato modificato"));
    expect(screen.getByLabelText("Descrizione della lavorazione")).toHaveValue("Voce ripristinata");
  });
  it("i controlli del documento aprono la lavorazione da completare", () => {
    const prima = { ...voceVuota(), descrizione: "Prima completa", quantita: "1", prezzo: "20" };
    const seconda = { ...voceVuota(), descrizione: "Seconda da completare" };
    localStorage.setItem("ui-controlli", JSON.stringify({ ...bozzaVuota(), voci: [prima, seconda] }));
    render(<ComputoNativoEditor initialFase={4} storageKey="ui-controlli" />);
    expect(screen.getByRole("button", { name: "Scarica documento" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Completa lavorazione 2" }));
    expect(screen.getByLabelText("Descrizione della lavorazione")).toHaveValue("Seconda da completare");
    change("Quantità", "2"); change("Prezzo unitario", "15");
    fireEvent.click(screen.getByRole("button", { name: "Avanti" })); fireEvent.click(screen.getByRole("button", { name: "Avanti" }));
    expect(screen.queryByRole("region", { name: "Controlli prima del PDF" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scarica documento" })).toBeEnabled();
  });
  it("passa fra le cinque fasi conservando dati e computo e salva le varianti PDF", async () => {
    render(<ComputoNativoEditor storageKey="ui-fasi" />);
    change("Nome e cognome", "Cliente di prova");
    fireEvent.click(screen.getByRole("button", { name: "Avanti" }));
    expect(screen.getByRole("region", { name: "Progetto e allegati" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Avanti" }));
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi lavorazione" }));
    change("Descrizione della lavorazione", "Intonaco"); change("Quantità", "10"); change("Prezzo unitario", "12");
    fireEvent.click(screen.getByRole("button", { name: "Avanti" }));
    expect(screen.getByRole("region", { name: "Riepilogo per capitolo" })).toHaveTextContent("120,00");
    fireEvent.click(screen.getByRole("button", { name: "Avanti" }));
    await scegliFormato("Computo senza prezzi");
    fireEvent.click(screen.getByRole("switch", { name: "Dati del cliente" }));
    await waitFor(() => expect(leggiBozzaComputo(localStorage.getItem("ui-fasi")!).formatoPdf).toBe("senza-prezzi"));
    expect(leggiBozzaComputo(localStorage.getItem("ui-fasi")!).mostraDatiCliente).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Indietro" })); fireEvent.click(screen.getByRole("button", { name: "Indietro" }));
    // La voce che si stava modificando è ancora aperta nel pannello di lato.
    expect(screen.getByLabelText("Descrizione della lavorazione")).toHaveValue("Intonaco");
    expect(screen.getByRole("complementary", { name: "Anteprima del preventivo" })).toBeInTheDocument();
  });
  it("crea una voce, salva e genera il PDF con i dati dell'editor", async () => {
    const { unmount } = render(<ComputoNativoEditor initialFase={2} storageKey="ui-test" />);
    expect(screen.getByRole("button", { name: "Scarica preventivo" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi lavorazione" }));
    change("Descrizione della lavorazione", "Posa pavimento"); change("Quantità", "12,5"); change("Prezzo unitario", "20");
    expect(screen.getByRole("button", { name: "Scarica preventivo" })).toBeEnabled();
    await waitFor(() => expect(screen.getByRole("status", { name: "Salvataggio bozza" })).toHaveTextContent("Salvato su questo computer"));
    expect(leggiBozzaComputo(localStorage.getItem("ui-test")!).voci[0].quantita).toBe("12,5");
    fireEvent.click(screen.getByRole("button", { name: "Scarica preventivo" }));
    await waitFor(() => expect(esporta).toHaveBeenCalled());
    expect(esporta.mock.calls[0][0][0]).toMatchObject({ quantita: 12.5, importo_computo: 250 });
    unmount(); render(<ComputoNativoEditor initialFase={2} storageKey="ui-test" />);
    fireEvent.click(screen.getByRole("button", { name: "Apri voce 1" }));
    expect(screen.getByLabelText("Descrizione della lavorazione")).toHaveValue("Posa pavimento");
  });
  it("duplica, elimina e annulla senza perdere la lavorazione", () => {
    render(<ComputoNativoEditor initialFase={2} storageKey="ui-test" />);
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi lavorazione" })); change("Descrizione della lavorazione", "Muratura");
    fireEvent.click(screen.getByRole("button", { name: "Duplica voce" }));
    const riepilogo = () => screen.getByLabelText("Riepilogo del computo");
    expect(riepilogo()).toHaveTextContent(/^2 voci/);
    fireEvent.click(screen.getByRole("button", { name: "Elimina voce" })); expect(riepilogo()).toHaveTextContent(/^1 voce\b/);
    fireEvent.click(screen.getByRole("button", { name: "Annulla ultima modifica" })); expect(riepilogo()).toHaveTextContent(/^2 voci/);
  });
  it("una formula errata blocca il PDF e si può correggere", () => {
    render(<ComputoNativoEditor initialFase={2} storageKey="ui-test" />);
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi lavorazione" }));
    change("Descrizione della lavorazione", "Pavimento"); change("Prezzo unitario", "20");
    fireEvent.click(screen.getByRole("button", { name: "Misura" })); change("formula misura 1", "1/0");
    expect(screen.getByRole("button", { name: "Scarica preventivo" })).toBeDisabled();
    change("formula misura 1", "4*3"); expect(screen.getByRole("button", { name: "Scarica preventivo" })).toBeEnabled();
    expect(screen.getByLabelText("Quantità", { exact: true })).toBeDisabled();
  });
  it("non sostituisce una bozza corrotta con un computo vuoto", async () => {
    localStorage.setItem("ui-test", "corrotto"); render(<ComputoNativoEditor initialFase={2} storageKey="ui-test" />);
    expect(screen.getByRole("alert")).toHaveTextContent("non è leggibile");
    expect(screen.getByRole("button", { name: "Aggiungi lavorazione" })).toBeDisabled();
    expect(localStorage.getItem("ui-test")).toBe("corrotto");
  });
  it("se lo spazio locale non è disponibile conserva l'editor modificabile", async () => {
    const spy = vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new DOMException("Spazio esaurito", "QuotaExceededError"); });
    try {
      render(<ComputoNativoEditor initialFase={2} storageKey="ui-quota" />);
      fireEvent.click(screen.getByRole("button", { name: "Aggiungi lavorazione" }));
      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Salvataggio locale non riuscito"));
      expect(screen.getByLabelText("Descrizione della lavorazione")).toBeEnabled();
      // La copia di sicurezza compare nell'avviso, dove l'occhio già sta.
      expect(screen.getByRole("button", { name: "Scarica una copia della bozza" })).toBeEnabled();
    } finally { spy.mockRestore(); }
  });
  it("conflitti fra schede bloccano la modifica invece di perdere dati", () => {
    render(<ComputoNativoEditor initialFase={2} storageKey="ui-test" />);
    const altro = JSON.stringify({ ...bozzaVuota(), voci: [voceVuota()] }); localStorage.setItem("ui-test", altro);
    fireEvent(window, new StorageEvent("storage", { key: "ui-test", newValue: altro }));
    expect(screen.getByRole("alert")).toHaveTextContent("altra scheda");
    expect(screen.getByRole("button", { name: "Aggiungi lavorazione" })).toBeDisabled();
  });
  it("senza prezzi permette di scaricare il computo metrico con sole quantità", async () => {
    render(<ComputoNativoEditor initialFase={2} storageKey="ui-test" />);
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi lavorazione" }));
    change("Descrizione della lavorazione", "Demolizione"); change("Quantità", "12");
    expect(screen.getByRole("button", { name: "Scarica preventivo" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Avanti" })); fireEvent.click(screen.getByRole("button", { name: "Avanti" }));
    await scegliFormato("Computo senza prezzi");
    expect(screen.getByRole("button", { name: "Scarica preventivo" })).toBeEnabled();
  });
  // 11/11/2026: un piano di pagamento a metà fermava il documento, e il piano a metà lo lasciava un preset.
  it("un piano che non fa 100% non ferma il PDF e si ripara con un pulsante", async () => {
    // Com'erano scritte le rate prima dell'11/11/2026: lo schema le converte da sé.
    const rata = (descrizione: string, percentuale: string, quando: string) =>
      ({ id: crypto.randomUUID(), descrizione, percentuale, quando, giorno: null as number | null, giorniPagamento: 0 });
    localStorage.setItem("ui-piano", JSON.stringify({ ...bozzaVuota(), titolo: "Edificio", voci: [{ ...voceVuota(), descrizione: "Scavo", quantita: "10", prezzo: "100" }],
      pianoPagamenti: { rate: [rata("Acconto", "0", "firma"), rata("1° SAL mensile", "10", "sal")] } }));
    render(<ComputoNativoEditor initialFase={3} storageKey="ui-piano" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Le rate sommano il 10%");
    expect(screen.getByRole("button", { name: "Scarica preventivo" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Riporta le rate a 100%" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(screen.getByLabelText("Percentuale della rata 2")).toHaveValue("100");
  });
  it("una lavorazione da quantificare dopo non ferma il documento", async () => {
    localStorage.setItem("ui-da-quantificare", JSON.stringify({ ...bozzaVuota(), titolo: "Edificio", voci: [
      { ...voceVuota(), descrizione: "Scavo", quantita: "10", prezzo: "100" },
      { ...voceVuota(), descrizione: "Opere di completamento", unita: "", quantita: "", prezzo: "", daQuantificare: true },
    ] }));
    render(<ComputoNativoEditor initialFase={2} storageKey="ui-da-quantificare" />);
    expect(screen.getByRole("button", { name: "Scarica preventivo" })).toBeEnabled();
    expect(screen.getByLabelText("Riepilogo del computo")).toHaveTextContent("1.000,00 €");
    fireEvent.click(screen.getByRole("button", { name: "Scarica preventivo" }));
    await waitFor(() => expect(esporta).toHaveBeenCalledOnce());
    const voci = esporta.mock.calls[0][0] as Array<{ importo_computo: number | null; da_quantificare?: boolean }>;
    expect(voci[1]).toMatchObject({ importo_computo: null, da_quantificare: true });
  });
  it("un piano di partenza non cancella le rate scritte a mano senza chiedere", async () => {
    localStorage.setItem("ui-preset", JSON.stringify({ ...bozzaVuota(), titolo: "Edificio", voci: [{ ...voceVuota(), descrizione: "Scavo", quantita: "10", prezzo: "100" }],
      pianoPagamenti: { rate: [{ id: crypto.randomUUID(), descrizione: "Come d'accordo", percentuale: "100", quando: "fine", giorno: null, giorniPagamento: 0 }] } }));
    render(<ComputoNativoEditor initialFase={3} storageKey="ui-preset" />);
    fireEvent.click(screen.getByRole("button", { name: "30 · 40 · 30" }));
    expect(screen.getByRole("alert")).toHaveTextContent("sostituisce la rata che hai scritto");
    expect(screen.getByLabelText("Nome della rata 1")).toHaveValue("Come d'accordo");
    fireEvent.click(screen.getByRole("button", { name: "Sostituisci" }));
    await waitFor(() => expect(screen.getByLabelText("Nome della rata 1")).toHaveValue("Acconto"));
  });
});
