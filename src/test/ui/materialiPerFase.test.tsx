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
      richiediOfferta: muta(), creaOrdini: muta(stato.creaOrdini), elimina: muta(),
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

  it("fase in bozza: avanzamento, provenienza dal computo, «Invia al tecnico» per chi prepara", async () => {
    stato.fasi = [{ id: "fase-el", nome: "Impianto elettrico", posizione: 1, validazione: { stato: "bozza", note_validazione: null, validata_il: null, inviata_il: null },
      materiali: [materiale("a"), materiale("b", { stato: "ordinato" })] }];
    await disegna();
    const fase = screen.getByRole("region", { name: "Fase Impianto elettrico" });
    expect(within(fase).getByText("In preparazione")).toBeInTheDocument();
    expect(within(fase).getByText(/2 materiali · 1 da ordinare · 1 ordinati · 0 consegnati/)).toBeInTheDocument();
    expect(within(fase).getAllByText("Computo · EL.05")).toHaveLength(2);
    expect(within(fase).getAllByText("calcolata 36,4")).toHaveLength(2);
    fireEvent.click(within(fase).getByRole("button", { name: /Invia al tecnico/ }));
    expect(stato.cambia).toHaveBeenCalledWith({ phaseId: "fase-el", azione: "invia_validazione" });
  });

  it("dal tecnico: valida o rimanda con nota; chi prepara non ha pulsanti e non ordina", async () => {
    stato.fasi = [{ id: "fase-el", nome: "Impianto elettrico", posizione: 1, validazione: { stato: "da_validare", note_validazione: null, validata_il: null, inviata_il: null },
      materiali: [materiale("a")] }];
    stato.permessi = { ...stato.permessi, canEditOrders: false, canValidateBom: true };
    await disegna();
    expect(screen.getByRole("button", { name: /Valida i materiali della fase/ })).toBeInTheDocument();
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

  it("fase validata: si ordina la selezione", async () => {
    stato.fasi = [{ id: "fase-el", nome: "Impianto elettrico", posizione: 1, validazione: { stato: "validata", note_validazione: null, validata_il: "2026-10-22", inviata_il: null },
      materiali: [materiale("a", { supplier_id: "f1" })] }];
    await disegna();
    expect(screen.getByText("Elettroforniture Srl")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleziona tutte le righe di Impianto elettrico" }));
    fireEvent.click(screen.getByRole("button", { name: /Crea ordine/ }));
    expect(stato.creaOrdini).toHaveBeenCalledWith({ materiali: [expect.objectContaining({ id: "a" })] }, expect.anything());
  });

  it("commessa senza materiali: spiega cosa fare e offre la generazione", async () => {
    stato.fasi = [];
    await disegna();
    expect(screen.getByText("Nessun articolo ancora")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Genera dal computo e dalle tavole/ })).toBeInTheDocument();
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
    const fase = screen.getByRole("region", { name: "Fase Impianto elettrico" });
    expect(within(fase).getByText("Posa canaline")).toBeInTheDocument();
    expect(within(fase).getByText("Lavorazione")).toBeInTheDocument();
    expect(within(fase).getByText(/1 materiali · 1 altre righe/)).toBeInTheDocument();
    const senza = screen.getByRole("region", { name: "Fase Senza fase" });
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
    expect(screen.getByText(/1,50.*Ultimo acquisto \(proposto\)/)).toBeInTheDocument();
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
    expect(screen.queryByText(/proposto/)).not.toBeInTheDocument();
  });
});
