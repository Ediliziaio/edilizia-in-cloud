import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { insiemeVoci, leggiPrezzo, leggiQuantita, totaleScelte, voceGiaPresente, type RigaScelta } from "@/lib/moduli/scegliVoci";

const TARIFFE = vi.hoisted(() => Array.from({ length: 60 }, (_, i) => ({
  id: `t${i}`, nome: i === 0 ? "Platea in cemento" : i === 1 ? "Tinteggiatura" : `Voce ${i}`, codice: `C${i}`, tipo: "posa", unita_fatturazione: "mq", prezzo_vendita: 10,
  gruppo: i === 0 ? "strutture" : i === 1 ? "tinteggiature" : "altro",
})));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "c1" }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/hooks/useProdottiListino", () => ({ useProdottiListino: () => ({ data: [{ id: "p1", nome: "Parquet rovere", modo: "mq", prezzo_vendita: 50, posa_vendita: 10, prezzo_acquisto: 20, posa_costo: 5, unita: "mq", immagine_url: null as string | null, descrizione: "Rovere" }], isFetching: false }) }));
const PREZZARIO = vi.hoisted(() => ({ voci: [] as unknown[] }));
vi.mock("@/lib/prezzario/queries", () => ({ usePrezzarioVociGlobalSearch: () => ({ data: PREZZARIO.voci, isFetching: false }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ order: () => ({ range: async (da: number) => ({ data: da === 0 ? TARIFFE : [], error: null as null }) }) }) }) }) }) }) } }));
import { ScegliVociListino, type FontiModulo } from "@/components/moduli/ScegliVociListino";

const fonti = {
  verticale: "ristrutturazione", mapUnita: (u: string) => u ?? "cad",
  useCapitoli: () => ({ data: [{ id: "cap1", nome: "Demolizioni" }] }),
  useVoci: (_t: string, c: string | null) => ({ data: c === "cap1" ? [{ id: "v1", descrizione: "Demolizione tramezzi", codice: "D1", unita_misura: "mq", prezzo_unitario: 30, costo_materiali: 0, costo_manodopera: 20, capitolo_nome: "Demolizioni" }] : ([] as unknown[]) }),
  useArticoli: () => ({ data: [] as unknown[] }),
} as unknown as FontiModulo;

const apri = (extra: Record<string, unknown> = {}) => {
  const onPick = vi.fn(); const onOpenChange = vi.fn();
  render(<QueryClientProvider client={new QueryClient()}><ScegliVociListino open onOpenChange={onOpenChange} onPick={onPick} fonti={fonti} targetCapitolo="Strutture" {...extra} /></QueryClientProvider>);
  return { onPick, onOpenChange };
};

describe("il calcolo della scelta", () => {
  const riga = (prezzo: number): RigaScelta => ({ chiave: "a", descrizione: "A", prezzo, unitaLabel: "", voce: { descrizione: "A", unita_misura: "mq", prezzo_unitario: prezzo, costo_materiali: 0, costo_manodopera: 0 } });
  it("capisce la virgola e rifiuta zero e testo", () => {
    expect(leggiQuantita("2,5")).toBe(2.5);
    expect(leggiQuantita("0")).toBeNull();
    expect(leggiQuantita("")).toBeNull();
    expect(leggiQuantita("tanti")).toBeNull();
    expect(leggiQuantita("0,001")).toBeNull();
    expect(leggiQuantita("1.500")).toBe(1500);
    expect(leggiQuantita("1.500,5")).toBe(1500.5);
    expect(leggiQuantita("1.5")).toBe(1.5);
  });
  it("somma le voci pronte e conta quelle senza quantità", () => {
    const c = totaleScelte([{ riga: riga(10), quantita: "3" }, { riga: riga(5), quantita: "" }]);
    expect(c.totale).toBe(30);
    expect(c.mancanti).toBe(1);
    expect(c.voci[0].quantita).toBe(3);
  });
  it("una voce senza unità resta da completare finché non si sceglie l'unità, che il modulo adatta", () => {
    const senza: RigaScelta = { ...riga(3.18), unitaDaScegliere: true, voce: { ...riga(3.18).voce, unita_misura: "cad" } };
    const prima = totaleScelte([{ riga: senza, quantita: "10" }]);
    expect(prima).toMatchObject({ mancanti: 1, unitaDaScegliere: 1, voci: [] });
    const dopo = totaleScelte([{ riga: senza, quantita: "10", unita: "mq" }], (u) => `modulo-${u}`);
    expect(dopo.mancanti).toBe(0);
    expect(dopo.voci[0]).toMatchObject({ unita_misura: "modulo-mq", unita_originale: "mq", sourceUnit: "mq", quantita: 10 });
    // Le voci con l'unità non cambiano.
    expect(totaleScelte([{ riga: riga(10), quantita: "1", unita: "mc" }]).voci[0].unita_misura).toBe("mq");
  });
  it("riconosce una voce già presente, anche con la descrizione estesa sotto", () => {
    expect(voceGiaPresente("Platea", insiemeVoci(["platea\ndettagli"]))).toBe(true);
    expect(voceGiaPresente("Platea", insiemeVoci(["Muro"]))).toBe(false);
  });
});

describe("la schermata", () => {
  it("mostra tutto il listino, non i primi 40, e i gruppi con il numero di voci", async () => {
    apri();
    expect(await screen.findByText("Voce 45")).toBeTruthy();
    const nav = screen.getByRole("navigation", { name: "Gruppi del listino" });
    expect(within(nav).getByText("Strutture")).toBeTruthy();
    expect(within(nav).getByText("58")).toBeTruthy();
    expect(within(nav).getByText("Demolizioni")).toBeTruthy();
  });
  it("cliccando un gruppo si vedono solo le sue voci", async () => {
    apri();
    await screen.findByText("Voce 45");
    fireEvent.click(within(screen.getByRole("navigation", { name: "Gruppi del listino" })).getByText("Strutture"));
    expect(screen.getByText("Platea in cemento")).toBeTruthy();
    expect(screen.queryByText("Voce 45")).toBeNull();
  });
  it("si spuntano più voci con la quantità e si aggiungono tutte insieme; prima non parte niente", async () => {
    const { onPick, onOpenChange } = apri();
    await screen.findByText("Platea in cemento");
    fireEvent.click(screen.getByRole("checkbox", { name: "Scegli: Platea in cemento" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Scegli: Tinteggiatura" }));
    expect(onPick).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Quantità: Platea in cemento"), { target: { value: "12,5" } });
    expect(screen.getByText(/135,00/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi al computo" }));
    expect(onPick).toHaveBeenCalledTimes(1);
    const voci = onPick.mock.calls[0][0];
    expect(voci.map((v: { descrizione: string; quantita: number }) => [v.descrizione, v.quantita])).toEqual([["Platea in cemento", 12.5], ["Tinteggiatura", 1]]);
    expect(voci[0].capitolo_nome).toBe("Strutture");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
  it("la scelta resta cambiando gruppo", async () => {
    const { onPick } = apri();
    await screen.findByText("Platea in cemento");
    fireEvent.click(screen.getByRole("checkbox", { name: "Scegli: Platea in cemento" }));
    fireEvent.click(within(screen.getByRole("navigation", { name: "Gruppi del listino" })).getByText("Tinteggiature"));
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi al computo" }));
    expect(onPick.mock.calls[0][0]).toHaveLength(1);
  });
  it("le voci scelte si rivedono, si cambiano e si tolgono da «Le tue scelte»", async () => {
    apri();
    await screen.findByText("Platea in cemento");
    fireEvent.click(screen.getByRole("checkbox", { name: "Scegli: Platea in cemento" }));
    const nav = screen.getByRole("navigation", { name: "Gruppi del listino" });
    fireEvent.click(within(nav).getByText("Tinteggiature"));
    expect(screen.queryByText("Platea in cemento")).toBeNull();
    fireEvent.click(within(nav).getByText("Le tue scelte"));
    expect(screen.getByText("Platea in cemento")).toBeTruthy();
    expect(screen.queryByText("Tinteggiatura")).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Scegli: Platea in cemento" }));
    expect(screen.getByText("Non hai ancora scelto nessuna voce.")).toBeTruthy();
  });
  it("chi scrive cerca in tutto il listino, anche da dentro un gruppo", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    apri();
    await screen.findByText("Tinteggiatura");
    fireEvent.click(within(screen.getByRole("navigation", { name: "Gruppi del listino" })).getByText("Strutture"));
    expect(screen.queryByText("Tinteggiatura")).toBeNull();
    fireEvent.change(screen.getByLabelText("Cerca una voce"), { target: { value: "tinteg" } });
    expect(await screen.findByText("Tinteggiatura")).toBeTruthy();
    vi.useRealTimers();
  });
  it("se chi riceve rifiuta le voci, il popup resta aperto con la scelta", async () => {
    const onPick = vi.fn(() => false as const); const onOpenChange = vi.fn();
    render(<QueryClientProvider client={new QueryClient()}><ScegliVociListino open onOpenChange={onOpenChange} onPick={onPick} fonti={fonti} /></QueryClientProvider>);
    await screen.findByText("Platea in cemento");
    fireEvent.click(screen.getByRole("checkbox", { name: "Scegli: Platea in cemento" }));
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi al computo" }));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: "Scegli: Platea in cemento" })).toBeTruthy();
  });
  it("porta l'unità della fonte, per i controlli dei moduli", async () => {
    const { onPick } = apri();
    await screen.findByText("Parquet rovere");
    fireEvent.click(screen.getByRole("checkbox", { name: "Scegli: Parquet rovere" }));
    fireEvent.change(screen.getByLabelText("Quantità: Parquet rovere"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi al computo" }));
    expect(onPick.mock.calls[0][0][0].sourceUnit).toBe("mq");
  });
  it("frecce: dalla ricerca alla prima spunta e fra le spunte", async () => {
    apri();
    await screen.findByText("Platea in cemento");
    const cerca = screen.getByLabelText("Cerca una voce");
    cerca.focus();
    fireEvent.keyDown(cerca, { key: "ArrowDown" });
    const spunte = screen.getAllByRole("checkbox");
    expect(document.activeElement).toBe(spunte[0]);
    fireEvent.keyDown(spunte[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(spunte[1]);
  });
  it("un prodotto al metro quadro aspetta la superficie", async () => {
    const { onPick } = apri();
    await screen.findByText("Parquet rovere");
    fireEvent.click(screen.getByRole("checkbox", { name: "Scegli: Parquet rovere" }));
    const aggiungi = screen.getByRole("button", { name: "Aggiungi al computo" }) as HTMLButtonElement;
    expect(aggiungi.disabled).toBe(true);
    expect(screen.getByText("scrivi la quantità")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Quantità: Parquet rovere"), { target: { value: "20" } });
    fireEvent.click(aggiungi);
    expect(onPick.mock.calls[0][0][0]).toMatchObject({ quantita: 20, prezzo_unitario: 60, costo_manodopera: 5 });
  });
  it("una descrizione lunga non riempie la schermata", async () => {
    apri();
    const nome = await screen.findByText("Platea in cemento");
    expect(nome.className).toContain("line-clamp-2");
    expect(nome.className).not.toMatch(/\bblock\b/);
    expect(nome.getAttribute("title")).toBe("Platea in cemento");
  });
  it("dice se una voce è già nel computo", async () => {
    apri({ vociPresenti: ["Platea in cemento"] });
    await screen.findByText("Platea in cemento");
    expect(screen.getByText("Già nel computo")).toBeTruthy();
  });
  it("la voce libera è una scelta a parte, non la prima riga", async () => {
    const { onPick } = apri();
    await screen.findByText("Platea in cemento");
    fireEvent.change(screen.getByLabelText("Cerca una voce"), { target: { value: "Opera speciale" } });
    fireEvent.click(screen.getByRole("button", { name: /Voce libera/ }));
    expect(onPick.mock.calls[0][0][0]).toMatchObject({ descrizione: "Opera speciale", prezzo_unitario: 0 });
  });
});

describe("le aggiunte al popup delle voci", () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);
  const spunta = (nome: string) => fireEvent.click(screen.getByRole("checkbox", { name: `Scegli: ${nome}` }));
  const aggiungi = () => fireEvent.click(screen.getByRole("button", { name: "Aggiungi al computo" }));

  it("il prezzo si cambia sulla riga: vale solo qui, e il totale lo segue", async () => {
    const { onPick } = apri();
    await screen.findByRole("checkbox", { name: "Scegli: Platea in cemento" });
    spunta("Platea in cemento");
    fireEvent.change(screen.getByLabelText("Quantità: Platea in cemento"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Prezzo: Platea in cemento"), { target: { value: "12,5" } });
    expect(screen.getByRole("button", { name: /1 voce/ }).textContent).toContain("25,00");
    aggiungi();
    expect(onPick.mock.calls[0][0][0]).toMatchObject({ quantita: 2, prezzo_unitario: 12.5 });
  });

  it("un prezzo non valido ferma l'aggiunta e lo dice", async () => {
    const { onPick } = apri();
    await screen.findByRole("checkbox", { name: "Scegli: Platea in cemento" });
    spunta("Platea in cemento");
    fireEvent.change(screen.getByLabelText("Prezzo: Platea in cemento"), { target: { value: "abc" } });
    expect(screen.getByText("controlla il prezzo")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Aggiungi al computo" }) as HTMLButtonElement).disabled).toBe(true);
    expect(onPick).not.toHaveBeenCalled();
  });

  it("le voci usate tornano in «Usate di recente» alla prossima apertura, senza il vecchio capitolo", async () => {
    const primo = apri({ targetCapitolo: "Bagno" });
    await screen.findByRole("checkbox", { name: "Scegli: Platea in cemento" });
    expect(screen.queryByRole("button", { name: /Usate di recente/ })).toBeNull();
    spunta("Platea in cemento");
    aggiungi();
    expect(primo.onPick).toHaveBeenCalled();
    cleanup();
    const secondo = apri();
    fireEvent.click(await screen.findByRole("button", { name: /Usate di recente/ }));
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    spunta("Platea in cemento");
    aggiungi();
    expect(secondo.onPick.mock.calls[0][0][0].capitolo_nome).not.toBe("Bagno");
  });

  it("dal pulsante generale si sceglie il capitolo; da un capitolo la scelta non c'è", async () => {
    const { onPick } = apri({ capitoliComputo: ["Bagno", "Bagno", "Cucina"], targetCapitolo: undefined });
    await screen.findByRole("checkbox", { name: "Scegli: Platea in cemento" });
    const select = screen.getByRole("combobox", { name: "Capitolo in cui mettere le voci" });
    expect(within(select).getAllByRole("option")).toHaveLength(3);
    fireEvent.change(select, { target: { value: "Cucina" } });
    spunta("Platea in cemento");
    aggiungi();
    expect(onPick.mock.calls[0][0][0].capitolo_nome).toBe("Cucina");
    cleanup();
    apri({ capitoliComputo: ["Bagno"], targetCapitolo: "Bagno" });
    expect(screen.queryByRole("combobox", { name: "Capitolo in cui mettere le voci" })).toBeNull();
  });

  it("oltre le prime voci se ne mostrano altre, e nessuna resta irraggiungibile", async () => {
    const molte = { ...fonti, useVoci: () => ({ data: Array.from({ length: 350 }, (_, i) => ({ id: `m${i}`, descrizione: `Lavoro ${i}`, codice: null as string | null, unita_misura: "mq", prezzo_unitario: 1, costo_materiali: 0, costo_manodopera: 0 })) }) };
    apri({ fonti: molte });
    fireEvent.click(await screen.findByRole("button", { name: /Mostra altre voci/ }));
    expect(await screen.findByRole("checkbox", { name: "Scegli: Lavoro 349" })).toBeTruthy();
  });

  it("la descrizione lunga si legge tutta sulla riga", async () => {
    const lungo = `Fornitura e posa ${"di materiale ".repeat(12)}fine`;
    const conLunga = { ...fonti, useVoci: () => ({ data: [{ id: "l1", descrizione: lungo, codice: null as string | null, unita_misura: "mq", prezzo_unitario: 1, costo_materiali: 0, costo_manodopera: 0 }] }) };
    apri({ fonti: conLunga });
    const riga = (await screen.findByRole("checkbox", { name: `Scegli: ${lungo}` })).closest("li") as HTMLElement;
    fireEvent.click(within(riga).getByRole("button", { name: "Leggi tutta la descrizione" }));
    expect(within(riga).getByRole("button", { name: "Riduci la descrizione" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("le voci recenti si rileggono: prezzo nuovo, voci tolte sparite, niente costi nel browser", async () => {
    const voce = (id: string, descrizione: string, prezzo_unitario: number) => ({ id, descrizione, codice: null as string | null, unita_misura: "mq", prezzo_unitario, costo_materiali: 7, costo_manodopera: 3 });
    const prima = { ...fonti, useVoci: () => ({ data: [voce("a", "Massetto", 50), voce("b", "Vespaio", 20)] }) };
    apri({ fonti: prima });
    await screen.findByRole("checkbox", { name: "Scegli: Massetto" });
    spunta("Massetto");
    spunta("Vespaio");
    aggiungi();
    expect(JSON.stringify({ ...localStorage })).not.toMatch(/costo_|prezzo/);
    cleanup();
    const dopo = { ...fonti, useVoci: () => ({ data: [voce("a", "Massetto", 60)] }) };
    apri({ fonti: dopo });
    fireEvent.click(await screen.findByRole("button", { name: /Usate di recente/ }));
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    expect(screen.getByRole("checkbox", { name: "Scegli: Massetto" }).closest("li")?.textContent).toContain("60,00");
  });

  it("il codice del listino segue la voce nel computo, da ogni fonte", async () => {
    const conArticolo = { ...fonti, useArticoli: () => ({ data: [{ id: "a1", name: "Silicone", sku: "SIL-9", marca: null as string | null, unita: "pz", prezzo_vendita: 8, costo: 4 }] }) };
    const { onPick } = apri({ fonti: conArticolo });
    await screen.findByRole("checkbox", { name: "Scegli: Platea in cemento" });
    spunta("Platea in cemento");
    spunta("Silicone");
    aggiungi();
    const voci = onPick.mock.calls[0][0] as { descrizione: string; codice_tariffa?: string }[];
    expect(voci.find((v) => v.descrizione === "Platea in cemento")?.codice_tariffa).toBe("C0");
    expect(voci.find((v) => v.descrizione === "Silicone")?.codice_tariffa).toBe("SIL-9");
  });

  it("una voce del prezzario senza unità non diventa «cad»: si sceglie leggendo come si misura", async () => {
    const descrizione = "Demolizione di solaio misto. La misurazione sarà eseguita al m² per ogni cm di spessore del solaio.";
    PREZZARIO.voci = [{ id: "pz1", descrizione, codice: "02.03.017*", unita_misura: null, prezzo: 3.18, incidenza_manodopera_pct: null, fonteLabel: "Prezzario Regione Marche 2025" }];
    const modulo = { ...fonti, mapUnita: (u: string) => (u === "mq" ? "mq-modulo" : "cad") };
    const { onPick } = apri({ fonti: modulo });
    fireEvent.click(screen.getByRole("button", { name: /prezzario regionale/i }));
    fireEvent.change(screen.getByLabelText("Cerca una voce"), { target: { value: "demolizione" } });
    const spunta = await screen.findByRole("checkbox", { name: `Scegli: ${descrizione}` });
    expect(screen.getByText("unità non indicata")).toBeTruthy();
    fireEvent.click(spunta);
    expect(screen.getByText("scegli l'unità")).toBeTruthy();
    expect(screen.getByText("Come si misura: «La misurazione sarà eseguita al m² per ogni cm di spessore del solaio.»")).toBeTruthy();
    const conferma = screen.getByRole("button", { name: "Aggiungi al computo" }) as HTMLButtonElement;
    expect(conferma.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(`Unità: ${descrizione}`), { target: { value: "mq" } });
    expect(conferma.disabled).toBe(false);
    fireEvent.click(conferma);
    expect(onPick.mock.calls[0][0][0]).toMatchObject({ unita_misura: "mq-modulo", unita_originale: "mq", sourceUnit: "mq", prezzo_unitario: 3.18, codice_tariffa: "02.03.017*" });
    PREZZARIO.voci = [];
  });

  it("il prezzo: «0.500» è mezzo euro e «0,125» resta tale", () => {
    expect(leggiPrezzo("0.500")).toBe(0.5);
    expect(leggiPrezzo("0,125")).toBe(0.125);
    expect(leggiQuantita("0.500")).toBe(0.5);
    expect(leggiQuantita("1.500")).toBe(1500);
  });

  it("il prezzo: zero è ammesso, vuoto e negativo no", () => {
    expect(leggiPrezzo("0")).toBe(0);
    expect(leggiPrezzo("0,00")).toBe(0);
    expect(leggiPrezzo("1.500,5")).toBe(1500.5);
    expect(leggiPrezzo("")).toBeNull();
    expect(leggiPrezzo("-3")).toBeNull();
  });
});
