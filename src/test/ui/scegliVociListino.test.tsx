import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { insiemeVoci, leggiQuantita, totaleScelte, voceGiaPresente, type RigaScelta } from "@/lib/moduli/scegliVoci";

const TARIFFE = vi.hoisted(() => Array.from({ length: 60 }, (_, i) => ({
  id: `t${i}`, nome: i === 0 ? "Platea in cemento" : i === 1 ? "Tinteggiatura" : `Voce ${i}`, codice: `C${i}`, tipo: "posa", unita_fatturazione: "mq", prezzo_vendita: 10,
  gruppo: i === 0 ? "strutture" : i === 1 ? "tinteggiature" : "altro",
})));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "c1" }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/hooks/useProdottiListino", () => ({ useProdottiListino: () => ({ data: [{ id: "p1", nome: "Parquet rovere", modo: "mq", prezzo_vendita: 50, posa_vendita: 10, prezzo_acquisto: 20, posa_costo: 5, unita: "mq", immagine_url: null as string | null, descrizione: "Rovere" }], isFetching: false }) }));
vi.mock("@/lib/prezzario/queries", () => ({ usePrezzarioVociGlobalSearch: () => ({ data: [] as unknown[], isFetching: false }) }));
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

describe("il codice della tariffa", () => {
  it("resta fuori dalla voce, come prima", async () => {
    const { onPick } = apri();
    await screen.findByText("Platea in cemento");
    fireEvent.click(screen.getByRole("checkbox", { name: "Scegli: Platea in cemento" }));
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi al computo" }));
    expect(onPick.mock.calls[0][0][0].codice_tariffa).toBeUndefined();
  });
});
