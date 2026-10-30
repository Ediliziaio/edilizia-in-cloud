import { useState } from "react";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AperturaSezioniContext, Sezione } from "@/components/sicurezza/pos/campi";
import { BarraSezioniPos, NavSezioniPos } from "@/components/sicurezza/pos/MenuSezioniPos";
import { CosaManca, raggruppaVoci } from "@/components/sicurezza/pos/CosaManca";
import { RischiLavorazionePos } from "@/components/sicurezza/pos/RischiLavorazionePos";
import { FunzioniAvanzatePos } from "@/components/sicurezza/pos/FunzioniAvanzatePos";
import { useSezioniApertePos } from "@/components/sicurezza/pos/useSezioniPos";
import {
  applicaValutazione, lavorazioneVuota, posVuoto, valutazioneAttiva, vociMancanti,
  type Lavorazione, type PosContenuto, type VoceMancante,
} from "../../../supabase/functions/_shared/posModello";

afterEach(cleanup);

const SEZIONI = [
  { id: "opera", titolo: "Opera e cantiere", mancanti: 0 },
  { id: "formazione", titolo: "Formazione", mancanti: 2 },
  { id: "iter", titolo: "Firme e consegna" },
];

describe("sezioni che si aprono e si chiudono", () => {
  it("senza il contesto (le sezioni usate da sole) restano aperte e il titolo non è un pulsante", () => {
    render(<Sezione id="opera" numero={1} titolo="Opera e cantiere" riferimento="3.2.1" mancanti={0}><p>contenuto</p></Sezione>);
    expect(screen.getByText("contenuto")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Opera e cantiere/ })).toBeNull();
  });

  it("con il contesto il titolo apre e chiude, e dice se è aperta", () => {
    function Prova() {
      const ap = useSezioniApertePos(["opera"], () => false);
      return <AperturaSezioniContext.Provider value={ap}><Sezione id="opera" numero={1} titolo="Opera e cantiere" riferimento="3.2.1" mancanti={0}><p>contenuto</p></Sezione></AperturaSezioniContext.Provider>;
    }
    render(<Prova />);
    const titolo = screen.getByRole("button", { name: /Opera e cantiere/ });
    expect(titolo).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("contenuto")).not.toBeVisible();
    fireEvent.click(titolo);
    expect(titolo).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("contenuto")).toBeVisible();
  });

  it("alla prima apertura restano aperte solo le sezioni da fare; «solo da fare» e «apri tutto» le portano da una parte all'altra", () => {
    const mancanti: Record<string, number> = { opera: 0, impresa: 3, figure: 0 };
    const { result } = renderHook(() => useSezioniApertePos(["opera", "impresa", "figure"], (id) => mancanti[id] > 0));
    expect(["opera", "impresa", "figure"].map(result.current.aperta)).toEqual([false, true, false]);
    act(() => result.current.espandiTutto());
    expect(["opera", "impresa", "figure"].map(result.current.aperta)).toEqual([true, true, true]);
    act(() => result.current.comprimiComplete((id) => mancanti[id]));
    expect(["opera", "impresa", "figure"].map(result.current.aperta)).toEqual([false, true, false]);
    act(() => result.current.apri("opera"));
    expect(result.current.aperta("opera")).toBe(true);
    act(() => result.current.alterna("opera"));
    expect(result.current.aperta("opera")).toBe(false);
    // una sezione sconosciuta è aperta: nessuna sparisce per un id sbagliato
    expect(result.current.aperta("altra")).toBe(true);
  });
});

describe("menu e barra delle sezioni", () => {
  it("il menu di lato elenca le sezioni con lo stato e porta alla sezione scelta", () => {
    const onVai = vi.fn(), onComprimi = vi.fn(), onEspandi = vi.fn();
    render(<NavSezioniPos sezioni={SEZIONI} onVai={onVai} onComprimiComplete={onComprimi} onEspandiTutto={onEspandi} />);
    const menu = screen.getByRole("navigation", { name: "Sezioni del POS" });
    expect(within(menu).getByLabelText("completa")).toBeTruthy(); // Opera
    expect(within(menu).getByLabelText("2 da completare")).toBeTruthy(); // Formazione
    fireEvent.click(within(menu).getByRole("button", { name: /Formazione/ }));
    expect(onVai).toHaveBeenCalledWith("formazione");
    fireEvent.click(within(menu).getByRole("button", { name: /Solo da fare/ }));
    fireEvent.click(within(menu).getByRole("button", { name: /Apri tutto/ }));
    expect(onComprimi).toHaveBeenCalledTimes(1);
    expect(onEspandi).toHaveBeenCalledTimes(1);
  });

  it("la barra mostra avanzamento e voci mancanti, apre l'elenco delle sezioni e porta alla voce scelta", async () => {
    const onVai = vi.fn(), onMostra = vi.fn();
    render(<BarraSezioniPos sezioni={SEZIONI} onVai={onVai} onComprimiComplete={vi.fn()} onEspandiTutto={vi.fn()} percento={40} mancantiTotali={12} onMostraMancanti={onMostra} />);
    expect(screen.getByRole("progressbar", { name: "Completezza 40%" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "12 voci da completare: vedi quali" }));
    expect(onMostra).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /Sezioni/ }));
    const elenco = await screen.findByRole("dialog");
    fireEvent.click(within(elenco).getByRole("button", { name: /Formazione/ }));
    await waitFor(() => expect(onVai).toHaveBeenCalledWith("formazione"));
  });

  it("senza voci mancanti dice «Completo» invece del contatore", () => {
    render(<BarraSezioniPos sezioni={SEZIONI} onVai={vi.fn()} onComprimiComplete={vi.fn()} onEspandiTutto={vi.fn()} percento={100} mancantiTotali={0} onMostraMancanti={vi.fn()} />);
    expect(screen.getByText("Completo")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /voci da completare/ })).toBeNull();
  });
});

describe("«cosa manca»", () => {
  const prodotti = (id: string, gruppo: VoceMancante["gruppo"]): VoceMancante => ({ riferimento: "3.2.1 e)", sezione: "lavorazioni", testo: `Lavorazione «${id}»: ${gruppo}`, lavorazione_id: id, gruppo });
  const lavorazioni = ["a", "b", "c"].map((id) => ({ ...lavorazioneVuota(id), titolo: `Scheda ${id}` }));

  it("raggruppa le voci uguali ripetute per lavorazione e lascia stare quelle singole", () => {
    const voci: VoceMancante[] = [
      { riferimento: "3.2.1 a)", sezione: "impresa", testo: "Ragione sociale" },
      prodotti("a", "prodotti-riesame"), prodotti("b", "prodotti-riesame"), prodotti("c", "prodotti-riesame"),
      prodotti("a", "prodotti-identifica"), // una sola: resta una voce normale
      { riferimento: "3.2.1 f)", sezione: "rumore", testo: "Esito del rumore" },
    ];
    const e = raggruppaVoci(voci);
    expect(e.map((x) => x.tipo)).toEqual(["voce", "gruppo", "voce", "voce"]);
    const gruppo = e[1] as Extract<(typeof e)[number], { tipo: "gruppo" }>;
    expect(gruppo.voci.map((v) => v.lavorazione_id)).toEqual(["a", "b", "c"]);
  });

  it("un gruppo si legge in una riga sola, con le schede coinvolte", () => {
    render(<CosaManca voci={[prodotti("a", "prodotti-riesame"), prodotti("b", "prodotti-riesame")]} lavorazioni={lavorazioni} ro={false} onVai={vi.fn()} onConfermaProdotti={vi.fn()} />);
    expect(screen.getByText(/Elenco dei prodotti da riesaminare in 2 lavorazioni/)).toBeTruthy();
    expect(screen.getByText("«Scheda a», «Scheda b»")).toBeTruthy();
  });

  it("la conferma per tutte vuole una spunta esplicita e vale solo per le schede del gruppo", () => {
    const onConferma = vi.fn();
    render(<CosaManca voci={[prodotti("a", "prodotti-riesame"), prodotti("c", "prodotti-riesame")]} lavorazioni={lavorazioni} ro={false} onVai={vi.fn()} onConfermaProdotti={onConferma} />);
    const bottone = screen.getByRole("button", { name: "Conferma per tutte e 2" });
    expect(bottone).toBeDisabled();
    fireEvent.click(bottone);
    expect(onConferma).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(bottone);
    expect(onConferma).toHaveBeenCalledWith(["a", "c"]);
  });

  it("in sola lettura non si può confermare e le voci portano alla sezione", () => {
    const onVai = vi.fn();
    render(<CosaManca voci={[prodotti("a", "prodotti-riesame"), prodotti("b", "prodotti-riesame"), { riferimento: "3.2.1 a)", sezione: "impresa", testo: "Ragione sociale" }]} lavorazioni={lavorazioni} ro onVai={onVai} onConfermaProdotti={vi.fn()} />);
    expect(screen.queryByRole("checkbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Ragione sociale/ }));
    expect(onVai).toHaveBeenCalledWith("impresa");
    fireEvent.click(screen.getByRole("button", { name: "Apri le lavorazioni" }));
    expect(onVai).toHaveBeenCalledWith("lavorazioni");
  });

  it("le voci vere di un POS a cui mancano i prodotti si raggruppano (10 voci su 12 diventano due righe)", () => {
    const p: PosContenuto = posVuoto();
    p.versione_controlli = 2; p.versione_prodotti = 1;
    p.lavorazioni = ["a", "b", "c", "d", "e"].map((id) => ({ ...lavorazioneVuota(id), titolo: id, sostanze: "Collante da verificare" }));
    const voci = vociMancanti(p);
    const raggruppate = raggruppaVoci(voci);
    expect(raggruppate.filter((x) => x.tipo === "gruppo")).toHaveLength(2);
    expect(raggruppate.length).toBeLessThan(voci.length - 5);
  });
});

describe("funzioni avanzate delle lavorazioni", () => {
  it("sono un riquadro chiuso: si apre, si attiva un passo, le altre dipendono da quello", () => {
    function Prova({ ro = false }: { ro?: boolean }) {
      const [d, setD] = useState<PosContenuto>(posVuoto());
      return <><FunzioniAvanzatePos d={d} ro={ro} modifica={(fn) => setD((p) => { const c = structuredClone(p); fn(c); return c; })} /><output data-testid="d">{JSON.stringify({ t: d.versione_tecnica, f: d.versione_fonti_tecniche, m: d.versione_mezzi, r: d.versione_requisiti_addetti })}</output></>;
    }
    const { unmount } = render(<Prova />);
    const intestazione = screen.getByRole("button", { name: /Funzioni avanzate/ });
    expect(intestazione).toHaveAttribute("aria-expanded", "false");
    expect(intestazione.textContent).toContain("0 di 5 attive");
    expect(screen.queryByRole("button", { name: "Attiva collegamenti alle fonti tecniche" })).toBeNull(); // dipende dalle schede tecniche
    fireEvent.click(intestazione);
    fireEvent.click(screen.getByRole("button", { name: "Attiva schede tecniche" }));
    expect(JSON.parse(screen.getByTestId("d").textContent!)).toMatchObject({ t: 1 });
    expect(screen.getByRole("button", { name: /Funzioni avanzate/ }).textContent).toContain("1 di 5 attive");
    expect(screen.getByRole("button", { name: "Attiva collegamenti alle fonti tecniche" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Attiva identità e impiego attrezzature" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Attiva requisiti nominativi per lavorazione" }));
    expect(JSON.parse(screen.getByTestId("d").textContent!)).toMatchObject({ t: 1, r: 1 });
    unmount();
    render(<Prova ro />); // un POS approvato non offre attivazioni
    expect(screen.queryByRole("button", { name: /Funzioni avanzate/ })).toBeNull();
  });
});

describe("rischi, misure e DPI di una lavorazione", () => {
  const partenza = (extra: Partial<Lavorazione> = {}): Lavorazione => ({ ...lavorazioneVuota("l1"), titolo: "Cappotto", rischi: "Caduta dall'alto\nPolveri", misure: "Parapetti\nAspirazione", dpi: "Elmetto EN 397", ...extra });
  function Prova({ iniziale, ro = false }: { iniziale: Lavorazione; ro?: boolean }) {
    const [l, setL] = useState<Lavorazione>(iniziale);
    return <><RischiLavorazionePos l={l} n={0} ro={ro} cambia={(fn) => setL((p) => { const c = structuredClone(p); fn(c); return c; })} /><output data-testid="l">{JSON.stringify(l)}</output></>;
  }
  const lavorazione = (): Lavorazione => JSON.parse(screen.getByTestId("l").textContent!);

  it("con i tre elenchi di prima li mostra e propone la tabella; «Organizza per rischio» non perde nulla", () => {
    render(<Prova iniziale={partenza()} />);
    expect(screen.getByLabelText("Rischi")).toHaveValue("Caduta dall'alto\nPolveri");
    fireEvent.click(screen.getByRole("button", { name: "Organizza per rischio" }));
    expect(screen.getByLabelText("Rischio 1")).toHaveValue("Caduta dall'alto");
    expect(screen.getByLabelText("Rischio 2")).toHaveValue("Polveri");
    // le misure e i DPI già scritti restano «comuni» finché non li si assegna a un rischio
    expect(screen.getByLabelText("Misure valide per tutti i rischi")).toHaveValue("Parapetti\nAspirazione");
    expect(screen.getByLabelText("DPI per tutti i rischi")).toHaveValue("Elmetto EN 397");
    const l = lavorazione();
    expect(valutazioneAttiva(l)).not.toBeNull();
    expect(l.rischi).toBe("Caduta dall'alto\nPolveri");
    expect(l.misure).toBe("Parapetti\nAspirazione");
    expect(l.dpi).toBe("Elmetto EN 397");
  });

  it("modificare la tabella riscrive i tre elenchi, così controlli e DPI del cantiere li leggono", () => {
    const l0 = partenza(); applicaValutazione(l0, { righe: [{ rischio: "Caduta", misure: "Parapetti", dpi: "Imbracatura", residuo: "" }], misure_comuni: "", dpi_comuni: "" });
    render(<Prova iniziale={l0} />);
    fireEvent.change(screen.getByLabelText("Misure preventive e protettive (rischio 1)"), { target: { value: "Parapetti\nRete anticaduta" } });
    fireEvent.change(screen.getByLabelText("DPI (rischio 1)"), { target: { value: "Imbracatura EN 361" } });
    let l = lavorazione();
    expect(l.misure).toBe("Parapetti\nRete anticaduta");
    expect(l.dpi).toBe("Imbracatura EN 361");
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi un rischio" }));
    fireEvent.change(screen.getByLabelText("Rischio 2"), { target: { value: "Polveri" } });
    fireEvent.change(screen.getByLabelText("Misure preventive e protettive (rischio 2)"), { target: { value: "Aspirazione" } });
    l = lavorazione();
    expect(l.rischi).toBe("Caduta\nPolveri");
    expect(l.misure).toBe("Parapetti\nRete anticaduta\nAspirazione");
    expect(valutazioneAttiva(l)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Elimina il rischio 1" }));
    expect(lavorazione().rischi).toBe("Polveri");
    // l'ultima riga non si può togliere: ne resta una vuota da compilare
    fireEvent.click(screen.getByRole("button", { name: "Elimina il rischio 1" }));
    expect(lavorazione().valutazione!.righe).toEqual([{ rischio: "", misure: "", dpi: "", residuo: "" }]);
  });

  it("il rischio residuo si sceglie fra basso, medio e alto e si può lasciare non valutato", () => {
    const l0 = partenza(); applicaValutazione(l0, { righe: [{ rischio: "Caduta", misure: "Parapetti", dpi: "", residuo: "medio" }], misure_comuni: "", dpi_comuni: "" });
    render(<Prova iniziale={l0} />);
    expect(screen.getByRole("combobox", { name: "Rischio residuo" })).toHaveTextContent("Medio");
  });

  it("«Elenchi semplici» torna ai tre campi senza toccare il contenuto", () => {
    const l0 = partenza(); applicaValutazione(l0, { righe: [{ rischio: "Caduta", misure: "Parapetti", dpi: "Elmetto", residuo: "" }], misure_comuni: "", dpi_comuni: "" });
    render(<Prova iniziale={l0} />);
    fireEvent.click(screen.getByRole("button", { name: "Elenchi semplici" }));
    expect(screen.getByLabelText("Rischi")).toHaveValue("Caduta");
    expect(screen.getByLabelText("Misure preventive e protettive")).toHaveValue("Parapetti");
    expect(screen.getByLabelText("DPI")).toHaveValue("Elmetto");
    expect(lavorazione().valutazione).toBeUndefined();
  });

  it("se i tre elenchi sono stati cambiati da fuori (app vecchia) la tabella non vale e si vedono gli elenchi", () => {
    const l0 = partenza(); applicaValutazione(l0, { righe: [{ rischio: "Caduta", misure: "Parapetti", dpi: "Elmetto", residuo: "" }], misure_comuni: "", dpi_comuni: "" });
    render(<Prova iniziale={{ ...l0, misure: "Parapetti\nSegnaletica aggiunta altrove" }} />);
    expect(screen.queryByLabelText("Rischio 1")).toBeNull();
    expect(screen.getByLabelText("Misure preventive e protettive")).toHaveValue("Parapetti\nSegnaletica aggiunta altrove");
  });

  it("in sola lettura non ci sono né pulsanti né campi modificabili", () => {
    const l0 = partenza(); applicaValutazione(l0, { righe: [{ rischio: "Caduta", misure: "Parapetti", dpi: "Elmetto", residuo: "alto" }], misure_comuni: "", dpi_comuni: "" });
    render(<Prova iniziale={l0} ro />);
    expect(screen.queryByRole("button", { name: "Aggiungi un rischio" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Elimina il rischio/ })).toBeNull();
    expect(screen.getByLabelText("Rischio 1")).toBeDisabled();
    cleanup();
    render(<Prova iniziale={partenza()} ro />);
    expect(screen.queryByRole("button", { name: "Organizza per rischio" })).toBeNull();
  });
});
