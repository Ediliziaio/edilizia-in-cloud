import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calcolaPianoEconomico, type RigaReale, type VocePiano } from "@/lib/orders/generali/pianoConti";
import type { VersionePiano } from "@/lib/orders/generali/pianoLettura";
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";

/**
 * Piano economico della commessa generale: cosa vede chi usa la scheda e il riquadro in
 * Panoramica. I conti sono in generalePianoConti.test.ts; qui i dati arrivano finti.
 */
const m = vi.hoisted(() => ({
  numeri: null as unknown,
  crea: vi.fn(),
  mutazione: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useGeneralePiano", () => ({
  useGeneralePianoNumeri: () => m.numeri,
  useNuovaVersionePiano: () => ({ mutate: m.crea, isPending: false }),
  useApprovaPiano: () => m.mutazione(),
  useEliminaBozzaPiano: () => m.mutazione(),
  useModificaVoce: () => m.mutazione(),
  useAggiungiVoci: () => m.mutazione(),
  useEliminaVoce: () => m.mutazione(),
  useFotografaOra: () => m.mutazione(),
  useFotografieGenerale: () => ({ data: [] as unknown[], isLoading: false, isError: false, refetch: vi.fn() }),
  messaggioPiano: (_e: unknown, cosa: string) => `errore ${cosa}`,
}));

import { PianoEconomico } from "@/components/orders/generali/piano/PianoEconomico";
import { RiquadroPiano } from "@/components/orders/generali/piano/RiquadroPiano";
import { totaliGenerale } from "@/lib/orders/commesseGenerali";

const riepilogo = (margini = true): RiepilogoGenerale => ({
  generale: { id: "G", codice: "C-020", nome: "Residenza Via Roma", cliente: null, clienteId: null, modello: "sviluppo", creataIl: null, valore: 2_400_000 },
  figlie: [
    { id: "f1", codice: "C-101", nome: "A1", stato: null, statoNome: null, statoColore: null, indirizzo: null, inizio: null, fine: null, avanzamento: 0,
      importo: 1_200_000, eseguito: 0, fatturato: 0, incassato: 0, costo: 40_000, margine: 1_160_000 },
  ],
  permessi: { importi: true, costi: true, margini },
});

const voce = (p: Partial<VocePiano> & Pick<VocePiano, "id">): VocePiano => ({
  tipo: "costo", categoria: "costruzione", descrizione: "Voce", importo: 0, mese: "2026-11", durataMesi: 1,
  figliaId: null, categorieCosto: [], aFinire: null, nota: null, ordine: 0, origineId: null, ...p,
});

const voci = [
  voce({ id: "v", tipo: "ricavo", categoria: "vendite", descrizione: "Vendita delle unità", importo: 2_400_000, mese: "2028-05", durataMesi: 8, ordine: 1 }),
  voce({ id: "t", categoria: "terreno", descrizione: "Terreno e notaio", importo: 350_000, ordine: 2 }),
  voce({ id: "c", categoria: "costruzione", descrizione: "Costruzione", importo: 1_200_000, mese: "2027-03", durataMesi: 16, ordine: 3 }),
];
const righe: RigaReale[] = [
  { id: "r1", fonte: "spesa", rifId: "s1", orderId: "G", data: "2026-10-12", tipo: "costo", chiave: "terreno", categoria: "notaio", descrizione: "Rogito · Studio Bianchi", importo: 352_000, voceId: "t" },
  { id: "r2", fonte: "oda", rifId: "o1", orderId: "f1", data: "2026-10-20", tipo: "costo", chiave: "materiali", categoria: null, descrizione: "OdA 12 · Edilferro", importo: 40_000, voceId: "c" },
  { id: "r3", fonte: "spesa", rifId: "s2", orderId: "G", data: "2026-10-02", tipo: "costo", chiave: "generali", categoria: "assicurazioni", descrizione: "Polizza CAR", importo: 4_000, voceId: null },
];

const versione = (stato: VersionePiano["stato"], numero = 1): VersionePiano => ({
  id: `ver-${numero}`, numero, stato, nota: null, approvataIl: stato === "approvata" ? "2026-10-15T09:00:00Z" : null, creataIl: null,
});

const numeri = (stato: VersionePiano["stato"] | null) => {
  const r = riepilogo();
  const v = stato ? versione(stato) : null;
  const piano = v ? calcolaPianoEconomico({ oggi: "2026-10-30", generaleId: "G", voci, righe, incassi: [], figlie: [{ id: "f1", nome: "C-101 · A1", importo: 1_200_000 }] }) : null;
  return {
    versioni: v ? [v] : [],
    inVista: v,
    approvata: stato === "approvata" ? v : null,
    bozza: stato === "bozza" ? v : null,
    voci: v ? voci : [],
    reale: v ? { oggi: "2026-10-30", permessi: { costi: true, importi: true }, righe, incassi: [] as unknown[], categorie: [] as unknown[] } : null,
    unita: null as unknown,
    piano,
    vuoto: v === null,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    riepilogo: r,
  };
};

const disegna = (puoModificare = true, r = riepilogo()) =>
  render(
    <MemoryRouter>
      <PianoEconomico riepilogo={r} totali={totaliGenerale(r)} puoModificare={puoModificare} />
    </MemoryRouter>,
  );

beforeEach(() => {
  m.crea.mockReset();
});
afterEach(cleanup);

describe("la scheda del piano economico", () => {
  it("senza il permesso dei margini non mostra numeri", () => {
    m.numeri = numeri("bozza");
    disegna(true, riepilogo(false));
    expect(screen.getByText(/lo vede chi ha il permesso di vedere i margini/)).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("senza piano: il prossimo passo con le voci tipiche del modello", () => {
    m.numeri = numeri(null);
    disegna();
    expect(screen.getByRole("heading", { name: "Scrivi il business plan" })).toBeVisible();
    expect(screen.getByText("Terreno, notaio e imposte d'acquisto")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Parti con queste voci/ }));
    const [vociPassate] = m.crea.mock.calls[0];
    expect(vociPassate).toHaveLength(9);
    expect(vociPassate[0]).toMatchObject({ tipo: "ricavo", categoria: "vendite", importo: 2_400_000 });
  });

  it("chi non può modificare vede il prossimo passo ma nessun bottone", () => {
    m.numeri = numeri(null);
    disegna(false);
    expect(screen.queryByRole("button", { name: /Parti con queste voci/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Il piano lo scrive chi può modificare le commesse/)).toBeVisible();
  });

  it("una bozza: celle modificabili, totali, reale fuori piano e Approva", () => {
    m.numeri = numeri("bozza");
    disegna();
    expect(screen.getByRole("button", { name: /Approva/ })).toBeEnabled();
    expect(screen.getByLabelText("Previsto di Costruzione")).toBeInTheDocument();
    expect(screen.getByLabelText("Descrizione di Terreno e notaio")).toHaveValue("Terreno e notaio");
    expect(screen.getByText("Fuori piano · Spese generali")).toBeVisible();
    const totaleCosti = screen.getByText("Totale costi").closest("tr")!;
    // previsto 1.550.000 · reale 396.000 · a finire 1.160.000 · stima 1.556.000
    expect(within(totaleCosti).getByText("1.550.000 €")).toBeVisible();
    expect(within(totaleCosti).getByText("396.000 €")).toBeVisible();
    expect(within(totaleCosti).getByText("1.556.000 €")).toBeVisible();
    expect(screen.getByText(/non ha una voce nel piano/)).toBeVisible();
  });

  it("ogni numero del reale apre le righe da cui viene", () => {
    m.numeri = numeri("bozza");
    disegna();
    fireEvent.click(screen.getByRole("button", { name: /352\.000/ }));
    const dialogo = screen.getByRole("dialog");
    expect(within(dialogo).getByText("Rogito · Studio Bianchi")).toBeVisible();
    expect(within(dialogo).getByText("Generale (costo comune)")).toBeVisible();
  });

  it("una versione approvata è bloccata: si scrive solo l'a finire, e si apre una revisione", () => {
    m.numeri = numeri("approvata");
    disegna();
    expect(screen.getByText("bloccata")).toBeVisible();
    expect(screen.queryByLabelText("Previsto di Costruzione")).not.toBeInTheDocument();
    expect(screen.getByLabelText("A finire di Costruzione")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Nuova revisione/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Approva/ })).not.toBeInTheDocument();
  });
});

describe("il riquadro in Panoramica", () => {
  const riquadro = (r = riepilogo()) =>
    render(<MemoryRouter><RiquadroPiano riepilogo={r} totali={totaliGenerale(r)} puoModificare /></MemoryRouter>);

  it("margine previsto contro margine a finire e capitale", () => {
    m.numeri = numeri("approvata");
    riquadro();
    expect(screen.getByText("Margine previsto")).toBeVisible();
    expect(screen.getByText("850.000 €")).toBeVisible();
    expect(screen.getByText("Margine a finire (stima)")).toBeVisible();
    expect(screen.getByText("844.000 €")).toBeVisible();
    expect(screen.getByText("Capitale investito a oggi")).toBeVisible();
    expect(screen.getByText(/sotto il previsto di 6\.?000/)).toBeVisible();
  });

  it("senza piano dice il prossimo passo; senza margini non c'è", () => {
    m.numeri = numeri(null);
    riquadro();
    expect(screen.getByText(/Scrivi il business plan per vedere qui il margine a finire/)).toBeVisible();
    cleanup();
    riquadro(riepilogo(false));
    expect(screen.queryByText("Piano economico")).not.toBeInTheDocument();
  });
});
