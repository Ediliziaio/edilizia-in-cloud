import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const stato = vi.hoisted(() => ({
  permessi: { canEditOrders: true, canValidateBom: false, canManagePurchasing: false, canViewCosts: true, isAdmin: false },
  fasi: [] as unknown[],
  cambia: vi.fn(),
  creaOrdini: vi.fn(),
  tabelle: {} as Record<string, unknown[]>,
  richieste: [] as unknown[],
  proposte: new Map<string, unknown>(),
  applica: vi.fn(),
  aggiorna: vi.fn(),
  allinea: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/usePrezziMateriali", () => ({
  usePrezziProposti: () => ({ proposte: stato.proposte, isLoading: false, isError: false }),
  useApplicaPrezziProposti: () => ({ mutate: stato.applica, isPending: false }),
}));
// La finestra dell'articolo è quella del vecchio elenco: qui si guarda solo cosa le si chiede.
vi.mock("@/components/orders/OrderItemsList", async (importOriginal) => {
  const vero = await importOriginal<typeof import("@/components/orders/OrderItemsList")>();
  return {
    ...vero,
    OrderItemsList: (p: { richiesta: unknown; soloFinestra?: boolean }) => {
      if (p.richiesta) stato.richieste.push(p.richiesta);
      return p.soloFinestra ? <div data-testid="finestra-articolo" /> : null;
    },
  };
});

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "azienda" }, user: { id: "utente" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => stato.permessi }));
vi.mock("@/hooks/useOperationalSuppliers", () => ({ useOperationalSuppliers: () => ({ suppliers: [{ id: "f1", name: "Elettroforniture Srl", is_active: true }] }) }));

vi.mock("@/hooks/useMaterialiPerFase", () => {
  const muta = (fn = vi.fn()) => ({ mutate: fn, isPending: false });
  return {
    useMaterialiPerFase: () => ({ fasi: stato.fasi, isLoading: false, isError: false, refetch: vi.fn() }),
    useAzioniMateriali: () => ({
      cambiaStato: muta(stato.cambia), aggiornaMateriale: muta(), spostaInFase: muta(), assegnaFornitore: muta(),
      richiediOfferta: muta(), creaOrdini: muta(stato.creaOrdini), elimina: muta(), allineaUnita: muta(stato.allinea),
    }),
    chiaviMateriali: { commessa: (id: string) => ["materiali-per-fase", id] },
  };
});

import { MaterialiPerFase } from "@/components/orders/materiali/MaterialiPerFase";

const materiale = (id: string, extra: Record<string, unknown> = {}) => ({
  id, order_id: "c1", name: `Materiale ${id}`, description: null as never, quantity: 37, status: "da_ordinare", supplier_id: null as never,
  purchase_price: 2, vat_rate: 22, phase_id: "fase-el", unita_misura: "pz", specifiche: null as never, origine_materiale: "computo",
  quantita_calcolata: 36.4, origini: [{ tipo: "computo", voce_id: "v", codice: "EL.05", descrizione: "Punto presa", quantita_voce: 37, unita_voce: "cad", quantita: 37 }],
  locale: null as never, supplier_rfq_item_id: null as never, stock_item_id: null as never, posizioni: null as never, stato: "da_ordinare", ordinabile: true, avviso: null as never, ...extra,
});

describe("Materiali per fase nella commessa", () => {
  beforeEach(() => {
    stato.cambia.mockReset();
    stato.creaOrdini.mockReset();
    stato.permessi = { canEditOrders: true, canValidateBom: false, canManagePurchasing: false, canViewCosts: true, isAdmin: false };
  });

  async function disegna() {
    return render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter><MaterialiPerFase orderId="c1" orderCode="C-001" /></MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("fase in bozza: pillola, conteggi, provenienza dal computo, «Invia al tecnico» per chi prepara", async () => {
    stato.fasi = [{ id: "fase-el", nome: "Impianto elettrico", posizione: 1, validazione: { stato: "bozza", note_validazione: null, validata_il: null, inviata_il: null },
      materiali: [materiale("a"), materiale("b", { stato: "ordinato" })] }];
    await disegna();
    const fase = screen.getByRole("rowgroup", { name: "Fase Impianto elettrico" });
    expect(within(fase).getByText("Bozza")).toBeInTheDocument();
    expect(within(fase).getByText(/2 materiali/)).toHaveTextContent("2 materiali · 1 da ordinare · 1 ordinato");
    expect(within(fase).getAllByText("Computo · EL.05")).toHaveLength(2);
    expect(within(fase).getAllByText("calcolata 36,4")).toHaveLength(2);
    fireEvent.click(within(fase).getByRole("button", { name: /Invia al tecnico/ }));
    expect(stato.cambia).toHaveBeenCalledWith({ phaseId: "fase-el", azione: "invia_validazione" });
    expect(within(fase).getByRole("columnheader", { name: /Impianto elettrico/ })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Materiale" })).toBeInTheDocument();
  });

  it("dal tecnico: valida o rimanda con nota; chi prepara non ha pulsanti e non ordina", async () => {
    stato.fasi = [{ id: "fase-el", nome: "Impianto elettrico", posizione: 1, validazione: { stato: "da_validare", note_validazione: null, validata_il: null, inviata_il: null },
      materiali: [materiale("a")] }];
    stato.permessi = { ...stato.permessi, canEditOrders: false, canValidateBom: true };
    await disegna();
    expect(screen.getByText("Da validare")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Valida$/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Rimanda indietro/ }));
    const dialogo = await screen.findByRole("dialog");
    const conferma = within(dialogo).getByRole("button", { name: "Rimanda indietro" });
    expect(conferma).toBeDisabled();
    fireEvent.change(within(dialogo).getByLabelText(/Nota/), { target: { value: "Mancano le cassette" } });
    fireEvent.click(conferma);
    expect(stato.cambia).toHaveBeenCalledWith({ phaseId: "fase-el", azione: "rimanda", nota: "Mancano le cassette" }, expect.anything());
  });

  it("selezione: i materiali di una fase non validata non si ordinano", async () => {
    stato.fasi = [{ id: "fase-el", nome: "Impianto elettrico", posizione: 1, validazione: { stato: "da_validare", note_validazione: null, validata_il: null, inviata_il: null },
      materiali: [materiale("a")] }];
    await disegna();
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleziona Materiale a" }));
    expect(screen.getByText("1 selezionati")).toBeInTheDocument();
    expect(screen.getByText(/di fasi non validate/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Crea ordine/ })).toBeDisabled();
  });

  it("fase validata: «Ordina» seleziona i materiali da ordinare, poi si crea l'ordine", async () => {
    stato.fasi = [{ id: "fase-el", nome: "Impianto elettrico", posizione: 1, validazione: { stato: "validata", note_validazione: null, validata_il: "2026-10-22", inviata_il: null },
      materiali: [materiale("a", { supplier_id: "f1" }), materiale("b", { supplier_id: "f1", stato: "ordinato" })] }];
    await disegna();
    expect(screen.getByText("Validata")).toBeInTheDocument();
    expect(screen.getAllByText("Elettroforniture Srl").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Invia al tecnico/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Ordina$/ }));
    expect(screen.getByText("1 selezionati")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Crea ordine/ }));
    expect(stato.creaOrdini).toHaveBeenCalledWith({ materiali: [expect.objectContaining({ id: "a" })] }, expect.anything());
  });

  it("tutto ordinato o arrivato: nessun pulsante principale, la fase completa parte chiusa", async () => {
    stato.fasi = [
      { id: "fase-el", nome: "Impianto elettrico", posizione: 1, validazione: null,
        materiali: [materiale("a", { stato: "ordinato" }), materiale("b", { stato: "in_bozza_oda" })] },
      { id: "fase-pav", nome: "Pavimenti", posizione: 2, validazione: null,
        materiali: [materiale("c", { phase_id: "fase-pav", stato: "consegnato" }), materiale("d", { phase_id: "fase-pav", stato: "consegnato", status: "installato" })] },
      { id: "fase-vuota", nome: "Tinteggiature", posizione: 3, validazione: null, materiali: [] },
    ];
    await disegna();
    expect(screen.queryByRole("button", { name: /Invia al tecnico|^Ordina$/ })).not.toBeInTheDocument();
    // La fase completa è chiusa: le righe non si vedono finché non la si apre.
    const pav = screen.getByRole("rowgroup", { name: "Fase Pavimenti" });
    expect(within(pav).queryByText("Materiale c")).not.toBeInTheDocument();
    fireEvent.click(within(pav).getByRole("button", { name: "Apri la fase Pavimenti" }));
    expect(within(pav).getByText("Materiale c")).toBeInTheDocument();
    expect(within(pav).getByText("Installato")).toBeInTheDocument();
    fireEvent.click(within(pav).getByRole("button", { name: "Chiudi la fase Pavimenti" }));
    expect(within(pav).queryByText("Materiale c")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Apri tutte" }));
    expect(screen.getByText("Materiale c")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Chiudi tutte" }));
    expect(screen.queryByText("Materiale a")).not.toBeInTheDocument();
    // Le fasi senza materiali stanno dietro un pulsante.
    expect(screen.queryByRole("rowgroup", { name: "Fase Tinteggiature" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mostra fasi senza materiali (1)" }));
    expect(screen.getByRole("rowgroup", { name: "Fase Tinteggiature" })).toBeInTheDocument();
  });

  it("numeri coerenti: la testata conta come le fasi e le righe, e i contatori filtrano", async () => {
    stato.fasi = [
      { id: "fase-el", nome: "Impianto elettrico", posizione: 1, validazione: null,
        // La riga dice ancora «da ordinare», ma l'ordine in bozza c'è: vale la scala unica.
        materiali: [materiale("a", { stato: "in_bozza_oda" }), materiale("b", { stato: "in_bozza_oda" }), materiale("c")] },
      { id: "fase-pav", nome: "Pavimenti", posizione: 2, validazione: null,
        materiali: [materiale("d", { phase_id: "fase-pav", stato: "ordinato" })] },
    ];
    await disegna();
    const filtri = screen.getByRole("group", { name: "Filtra per stato" });
    expect(within(filtri).getByRole("button", { name: "4 materiali" })).toHaveAttribute("aria-pressed", "true");
    expect(within(filtri).getByRole("button", { name: "1 Da ordinare" })).toBeInTheDocument();
    expect(within(filtri).getByRole("button", { name: "2 In bozza d'ordine" })).toBeInTheDocument();
    expect(within(filtri).getByRole("button", { name: "1 Ordinato" })).toBeInTheDocument();
    expect(within(filtri).queryByRole("button", { name: /Consegnato/ })).not.toBeInTheDocument();
    const el = screen.getByRole("rowgroup", { name: "Fase Impianto elettrico" });
    expect(within(el).getByText(/3 materiali/)).toHaveTextContent("1 da ordinare · 2 in bozza d'ordine");
    expect(within(el).getAllByText("In bozza d'ordine")).toHaveLength(2);
    fireEvent.click(within(filtri).getByRole("button", { name: "2 In bozza d'ordine" }));
    expect(screen.queryByText("Materiale c")).not.toBeInTheDocument();
    expect(screen.getByText("Materiale a")).toBeInTheDocument();
    // La fase senza righe col filtro sparisce.
    expect(screen.queryByRole("rowgroup", { name: "Fase Pavimenti" })).not.toBeInTheDocument();
    fireEvent.click(within(filtri).getByRole("button", { name: "4 materiali" }));
    expect(screen.getByText("Materiale c")).toBeInTheDocument();
  });

  it("unità dell'ordine da verificare: un solo riepilogo in alto, dettaglio a richiesta, «Allinea le unità» dove è sicuro", async () => {
    const scala = (allineaA: string | null, unitaRiga = "pz") => ({
      stato: "consegnato", dettaglio: null, ordini: [{ numero: "ODA-7", stato: "ricevuto", data: "2026-10-01", arrivo: null, arrivato: true }],
      unitaDaVerificare: { unitaRiga, unitaOrdine: ["corpo"] }, allineaA,
    });
    stato.fasi = [{ id: "fase-el", nome: "Impianto elettrico", posizione: 1, validazione: null,
      materiali: [
        materiale("a", { quantity: 1, unita_misura: null, scala: scala("corpo") }),
        materiale("b", { quantity: 4, unita_misura: "m", scala: scala(null, "m") }),
        materiale("c", { avviso: "La distinta non coincide con la quantità prevista" }),
      ] }];
    await disegna();
    expect(screen.getByRole("status")).toHaveTextContent("2 righe con l'unità dell'ordine da verificare");
    expect(screen.queryByText(/Unità di misura dell/)).not.toBeInTheDocument();
    // Gli altri avvisi restano sulla riga, piccoli.
    expect(screen.getAllByText("Da verificare")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Quali sono" }));
    expect(screen.getByText(/Materiale a: riga in «pz», ODA-7 in «corpo»/)).toHaveTextContent("si allinea");
    expect(screen.getByText(/Materiale b: riga in «m»/)).toHaveTextContent("da correggere a mano");
    fireEvent.click(screen.getByRole("button", { name: "Allinea le unità (1)" }));
    expect(stato.allinea).toHaveBeenCalledWith([{ id: "a", unita: "corpo" }]);
    // La riga 1 pezzo ordinata a corpo si legge «a corpo».
    expect(screen.getAllByText("a corpo").length).toBeGreaterThan(0);
  });

  it("righe pulite: niente etichette tecniche, descrizione solo se dice altro", async () => {
    stato.fasi = [{ id: "fase-el", nome: "Impianto elettrico", posizione: 1, validazione: null,
      materiali: [
        materiale("a", { description: "[DEMO HISTORY 2026 v1]" }),
        materiale("b", { description: "[DEMO HISTORY 2026 v1] Scatola da incasso 503" }),
      ] }];
    await disegna();
    expect(screen.queryByText(/DEMO HISTORY/)).not.toBeInTheDocument();
    expect(screen.getByText("Scatola da incasso 503")).toBeInTheDocument();
  });

  it("commessa senza materiali: spiega cosa fare e offre la generazione", async () => {
    stato.fasi = [];
    await disegna();
    expect(screen.getByText("Nessun articolo ancora")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Genera dal computo/ })).toBeInTheDocument();
  });
});

describe("Un solo elenco: tutti gli articoli per fase", () => {
  const editor = (items: { id: string; name: string }[]) => ({
    items: items.map((i, n) => ({ ...i, quantity: 1, status: "da_ordinare" as const, position: n })),
    onItemsChange: vi.fn(), onItemUpdate: stato.aggiorna, companyId: "azienda",
  });
  function disegna(conEditor = true) {
    return render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <MaterialiPerFase orderId="c1" orderCode="C-001" editor={conEditor ? editor([{ id: "a", name: "Materiale a" }, { id: "s", name: "Materiale s" }]) : undefined} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }
  beforeEach(() => {
    stato.richieste = [];
    stato.proposte = new Map();
    stato.applica.mockReset();
    stato.permessi = { canEditOrders: true, canValidateBom: false, canManagePurchasing: false, canViewCosts: true, isAdmin: false };
    stato.fasi = [
      { id: "fase-el", nome: "Impianto elettrico", posizione: 1, validazione: null,
        materiali: [materiale("a"), materiale("l", { name: "Posa canaline", natura_riga: "lavorazione", origine_materiale: null, origini: null })] },
      { id: null, nome: "Senza fase", posizione: 1e9, validazione: null,
        materiali: [materiale("s", { phase_id: null, origine_materiale: null, origini: null, purchase_price: 0, stock_item_id: "giac" })] },
    ];
  });

  it("gruppi per fase e «Senza fase»; le lavorazioni stanno nell'elenco ma non contano come materiali", () => {
    disegna();
    const fase = screen.getByRole("rowgroup", { name: "Fase Impianto elettrico" });
    expect(within(fase).getByText("Posa canaline")).toBeInTheDocument();
    expect(within(fase).getByText("Lavorazione")).toBeInTheDocument();
    expect(within(fase).getByText(/1 materiale · 1 altra riga/)).toBeInTheDocument();
    const senza = screen.getByRole("rowgroup", { name: "Fase Senza fase" });
    expect(within(senza).getByText("Materiale s")).toBeInTheDocument();
    expect(within(senza).getByText("Da giacenza")).toBeInTheDocument();
    expect(screen.getByTestId("finestra-articolo")).toBeInTheDocument();
  });

  it("aggiunta manuale: dall'intestazione nasce senza fase, dalla fase nasce in quella fase", () => {
    disegna();
    fireEvent.click(screen.getByRole("button", { name: /Aggiungi articolo/ }));
    expect(stato.richieste.at(-1)).toMatchObject({ tipo: "nuovo", phaseId: null });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi un articolo in Impianto elettrico" }));
    expect(stato.richieste.at(-1)).toMatchObject({ tipo: "nuovo", phaseId: "fase-el" });
  });

  it("filtro «Da giacenza» e prezzo proposto con la fonte, da scrivere con un clic", () => {
    stato.proposte = new Map([["s", { prezzo: 1.5, fonte: "ultimo_acquisto", dettaglio: "ODA-1" }]]);
    disegna();
    expect(screen.getByLabelText("Prezzo: Ultimo acquisto (proposto)")).toBeInTheDocument();
    expect(screen.getAllByText(/55,50/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /Usa i prezzi proposti \(1\)/ }));
    expect(stato.applica).toHaveBeenCalledWith([{ id: "s", prezzo: expect.objectContaining({ prezzo: 1.5 }) }]);
    fireEvent.click(screen.getByRole("button", { name: "Da giacenza" }));
    expect(screen.queryByText("Materiale a")).not.toBeInTheDocument();
    expect(screen.getByText("Materiale s")).toBeInTheDocument();
  });

  it("senza permesso di modifica né costi: niente aggiunta, niente prezzi", () => {
    stato.permessi = { ...stato.permessi, canEditOrders: false, canViewCosts: false };
    stato.proposte = new Map([["s", { prezzo: 1.5, fonte: "ultimo_acquisto", dettaglio: null }]]);
    disegna();
    expect(screen.queryByRole("button", { name: /Aggiungi articolo/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/proposto/)).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Importo" })).not.toBeInTheDocument();
  });
});
