/**
 * «Completa con Silvio» e «Da completare» (fase 2, lotti 2.1 e 2.3), con commessa, documenti
 * e database finti: il popup parte dalla commessa, mostra chiuso quello che c'è, non lo fa
 * cambiare, legge un documento allegato solo su tocco, «Completa» chiama la RPC giusta;
 * la riga sulla commessa dice cosa manca e porta alle impostazioni di Silvio.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { Frammento } from "../../../shared/silvio-commessa/piano.ts";
import type { ServiziSilvioCommessa } from "@/components/silvio-commessa/servizi";
import type { EsitoLettura } from "@/lib/silvio-commessa/leggiDocumento";
import type { ClientBozze } from "@/lib/silvio-commessa/bozze";
import type { CommessaDaCompletare } from "@/lib/silvio-commessa/daCompletare";
import { frammentiPerCompletare } from "@/lib/silvio-commessa/lettori/commessa";

vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canViewOrderAmounts: true, canViewMargins: true, canViewCosts: true, canViewSettingsOrders: true }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u0000000-0000-4000-a000-000000000001" } }) }));
vi.mock("@/components/silvio-commessa/useCreaConSilvioAttivo", () => ({ useCreaConSilvioAttivo: () => true }));
vi.mock("@/hooks/useCompanyStaffUsers", () => ({ useCompanyStaffUsers: () => ({ data: [] as unknown[] }) }));
vi.mock("@/hooks/useCompanyCustomers", () => ({ useCompanyCustomers: () => ({ data: [] as unknown[] }) }));
vi.mock("@/hooks/useVoiceInput", () => ({
  useVoiceInput: () => ({ recording: false, transcribing: false, recordingMs: 0, toggle: vi.fn() }),
}));
vi.mock("@/components/orders/CreateCustomerDialog", () => ({ CreateCustomerDialog: (): null => null }));

import CreaConSilvioDialog from "@/components/silvio-commessa/CreaConSilvioDialog";
import { CompletaConSilvio } from "@/components/silvio-commessa/CompletaConSilvio";

const AZIENDA = "d2000000-0000-4000-a000-000000000002";
const UTENTE = "u0000000-0000-4000-a000-000000000001";
const ORDINE = "o0000000-0000-4000-a000-000000000001";

const commessa = (id = ORDINE, codice = "ORD-2026-034") => frammentiPerCompletare({
  order: {
    id, order_code: codice, description: "Rifacimento bagno 6 mq", customer_id: "c0000000-0000-4000-a000-000000000001",
    client_name: "Mario Rossi", client_address: "Via Prova 1, Monza", total_amount: 12000, vat_rate: 10, payment_type: "standard",
  },
});

const dalContratto: Frammento = {
  fonte: { tipo: "contratto", etichetta: "Contratto firmato.pdf" },
  aree: {
    economia: { "economia.total_amount": { valore: 15000, fiducia: 0.9, stato: "fatto" } },
    cantiere: { "cantiere.indirizzo": { valore: { indirizzo_lavori: "Via Cantiere 5, Lecco" }, fiducia: 0.9, stato: "fatto" } },
  },
  costoEur: 0.01,
};

/** Un client finto: la bozza nasce con id «b-…», la RPC di completamento risponde con la commessa. */
function dbFinto() {
  const inserite: Record<string, unknown>[] = [];
  const rpc = vi.fn(async (nome: string, args: Record<string, unknown>) => {
    void args;
    if (nome === "commessa_completa_con_silvio") {
      return { data: { order_id: ORDINE, colonne: 2, fasi: 5, voci: 0, rate: 0, contratto: false, righe_registrate: 8 }, error: null };
    }
    return { data: 0, error: null };
  });
  let n = 0;
  const query = () => {
    const q: Record<string, unknown> = {};
    const catena = (k: string) => (...a: unknown[]) => { if (k === "insert") inserite.push(a[0] as Record<string, unknown>); return q; };
    for (const k of ["select", "insert", "update", "eq", "neq", "gt", "order", "limit"]) q[k] = catena(k);
    const riga = async () => ({ data: { id: `b-${++n}`, stato: "bozza", fonti: [] as unknown[], piano: {}, storia: [] as unknown[] }, error: null as unknown });
    q.single = riga;
    q.maybeSingle = riga;
    // «Riprendi»: nessuna bozza aperta.
    q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
    return q;
  };
  return {
    rpc, inserite,
    from: () => query(),
    storage: { from: () => ({ download: async () => ({ data: null as unknown, error: { message: "no" } }), upload: async () => ({ data: null as unknown, error: null as unknown }), remove: async () => ({ data: null as unknown, error: null as unknown }) }) },
  };
}

function servizi(over: Partial<ServiziSilvioCommessa> = {}) {
  const db = dbFinto();
  const s: ServiziSilvioCommessa = {
    elencaPreventivi: vi.fn(async () => []),
    elencaComputi: vi.fn(async () => []),
    frammentiPreventivo: vi.fn(async () => []),
    frammentoComputo: vi.fn(async () => null),
    leggiFile: vi.fn(async (): Promise<EsitoLettura> => ({
      riconosciuto: { lettore: "silvio_commessa", fonte: "contratto", ai: true, immagine: false, motivo: "contratto" },
      frammenti: [dalContratto], percorso: "az/u/commessa-1-contratto.pdf",
    })),
    leggiTesto: vi.fn(async (): Promise<EsitoLettura> => ({
      riconosciuto: { lettore: "silvio_commessa", fonte: "testo", ai: true, immagine: false, motivo: "testo" }, frammenti: [],
    })),
    registraCorrezioni: vi.fn(async () => {}),
    frammentiCommessa: vi.fn(async (id: string) => commessa(id, id === ORDINE ? "ORD-2026-034" : id)),
    elencaAllegati: vi.fn(async () => [
      { id: "a1", nome: "Contratto firmato.pdf", path: `orders/${ORDINE}/1-contratto.pdf`, mime: "application/pdf", dimensione: 200_000 },
      { id: "a2", nome: "Pianta.dwg", path: `orders/${ORDINE}/2-pianta.dwg`, mime: null, dimensione: 1000 },
    ]),
    scaricaAllegato: vi.fn(async (a) => new File(["%PDF"], a.nome, { type: a.mime ?? "" })),
    // Fase 3: qui non servono.
    leggiRemoto: vi.fn(async (): Promise<EsitoLettura> => ({
      riconosciuto: { lettore: "silvio_commessa", fonte: "documento", ai: true, immagine: false, motivo: "documento" }, frammenti: [],
    })),
    frammentoContratto: vi.fn(async (): Promise<Frammento> => ({ fonte: { tipo: "contratto", etichetta: "contratto" }, aree: {} })),
    scaricaCaricato: vi.fn(async () => new File([], "vuoto")),
    apriDocumento: vi.fn(async () => ""),
    chat: vi.fn(async () => ({ testo: "", strumenti: [], costoEur: 0 })),
    saldoAI: vi.fn(async () => ({ saldoEur: null, bloccato: false })),
    trascrivi: vi.fn(async () => ""),
    // Fase 4: senza dati dell'azienda non si propone niente.
    contestoRisorse: vi.fn(async () => { throw new Error("non in questo test"); }),
    richiesteOfferta: vi.fn(async () => []),
    leggiOfferta: vi.fn(async () => ({ offerta: {}, quantita: {} })),
    db: db as unknown as ClientBozze,
    ...over,
  };
  return { s, db };
}

const conClient = (ui: React.ReactNode) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);
};

describe("Il popup in modo «Completa»", () => {
  it("parte dalla commessa: titolo e pulsante dicono Completa, quello che c'è è chiuso", async () => {
    const { s } = servizi();
    conClient(<CreaConSilvioDialog open onOpenChange={() => {}} companyId={AZIENDA} userId={UTENTE} servizi={s}
      orderId={ORDINE} etichettaCommessa="ORD-2026-034" />);
    expect(screen.getByRole("heading", { name: /Completa la commessa ORD-2026-034 con Silvio/ })).toBeInTheDocument();
    await waitFor(() => expect(s.frammentiCommessa).toHaveBeenCalledWith(ORDINE));
    const area = await screen.findByRole("region", { name: "Economia" });
    const importo = within(area).getByText("Importo").closest("li")!;
    expect(within(importo).getByText(/già nella commessa/)).toBeInTheDocument();
    expect(within(importo).queryByRole("button", { name: /Modifica «Importo»/ })).toBeNull();
    // Quello che manca si può scrivere.
    expect(screen.getByRole("button", { name: /Modifica «Inizio lavori»/ })).toBeInTheDocument();
    // Le fasi vengono dal modello del bagno; «Completa» c'è, «Crea» no.
    expect(await screen.findAllByText(/te le propongo dal modello «bagno» \(6 mq\)/)).not.toHaveLength(0);
    expect(screen.getByRole("button", { name: /^Completa ▸$/ })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /Crea ▸/ })).toBeNull();
  });

  it("un'area che la commessa ha già tutta si raccoglie in una riga, e si riapre", async () => {
    const piena = frammentiPerCompletare({ order: {
      id: ORDINE, order_code: "ORD-2026-034", description: "Rifacimento bagno 6 mq", customer_id: "c0000000-0000-4000-a000-000000000001",
      client_name: "Mario Rossi", client_email: "mario@example.invalid", client_address: "Via Prova 1, Monza", total_amount: 12000,
    } });
    const { s } = servizi({ frammentiCommessa: vi.fn(async () => piena) });
    conClient(<CreaConSilvioDialog open onOpenChange={() => {}} companyId={AZIENDA} userId={UTENTE} servizi={s} orderId={ORDINE} />);
    const cliente = await screen.findByRole("region", { name: "Cliente" });
    expect(within(cliente).getByText("già nella commessa")).toBeInTheDocument();
    expect(within(cliente).queryByText("Mario Rossi")).toBeNull();
    fireEvent.click(within(cliente).getByRole("button", { name: "Mostra cliente" }));
    expect(within(screen.getByRole("region", { name: "Cliente" })).getByText("Mario Rossi")).toBeInTheDocument();
  });

  it("un documento della commessa si legge solo su tocco, e non cambia l'importo che c'è", async () => {
    const { s } = servizi();
    conClient(<CreaConSilvioDialog open onOpenChange={() => {}} companyId={AZIENDA} userId={UTENTE} servizi={s}
      orderId={ORDINE} etichettaCommessa="ORD-2026-034" />);
    const documenti = await screen.findByRole("region", { name: "Documenti della commessa" });
    // Il disegno non si legge: non compare.
    expect(within(documenti).queryByText("Pianta.dwg")).toBeNull();
    expect(s.leggiFile).not.toHaveBeenCalled();
    fireEvent.click(within(documenti).getByRole("button", { name: /Leggi Contratto firmato\.pdf, circa 0,01 €/ }));
    await waitFor(() => expect(s.leggiFile).toHaveBeenCalledTimes(1));
    expect(s.scaricaAllegato).toHaveBeenCalledWith(expect.objectContaining({ id: "a1" }));
    await screen.findAllByText(/Da Contratto firmato\.pdf ho preso indirizzo del cantiere/);
    const importo = within(screen.getByRole("region", { name: "Economia" })).getByText("Importo").closest("li")!;
    expect(within(importo).getByText("12.000 €")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /Scegli quale «Importo» tenere/ })).toBeNull();
    expect(within(documenti).getByRole("button", { name: /già tra le fonti/ })).toBeDisabled();
  });

  it("«Completa» salva la bozza sulla commessa e chiama la RPC di completamento", async () => {
    const { s, db } = servizi();
    const onCompletata = vi.fn();
    conClient(<CreaConSilvioDialog open onOpenChange={() => {}} companyId={AZIENDA} userId={UTENTE} servizi={s}
      orderId={ORDINE} etichettaCommessa="ORD-2026-034" onCompletata={onCompletata} />);
    await screen.findAllByText(/te le propongo dal modello/);
    fireEvent.click(screen.getByRole("button", { name: /^Completa ▸$/ }));
    await waitFor(() => expect(onCompletata).toHaveBeenCalledWith(ORDINE));
    expect(db.inserite[0]).toMatchObject({ modo: "completa", order_id: ORDINE, company_id: AZIENDA });
    expect(db.rpc).toHaveBeenCalledWith("commessa_completa_con_silvio", { p_bozza_id: "b-1" });
    expect(db.rpc).not.toHaveBeenCalledWith("commessa_crea_con_silvio", expect.anything());
    // Nella scrittura salvata non c'è niente di quello che la commessa aveva già.
    const scrittura = db.inserite[0].scrittura as { ordine: Record<string, unknown>; fasi: unknown[] };
    expect(scrittura.ordine).not.toHaveProperty("total_amount");
    expect(scrittura.ordine).not.toHaveProperty("client_name");
    expect(scrittura.fasi.length).toBeGreaterThan(0);
  });
});

const riga = (id: string, extra: Partial<CommessaDaCompletare> = {}): CommessaDaCompletare => ({
  order_id: id, order_code: id, titolo: `Lavoro ${id}`, cliente: "Cliente", inizio: null, consegna: null, importo: 10000,
  punteggio: 33, mancano: ["fasi.order_work_phases", "pagamenti.rate", "fasi.work_start_date"], totale: 6, ...extra,
});

describe("La riga sulla commessa", () => {
  it("dice cosa manca e porta alle impostazioni di Silvio", async () => {
    conClient(<CompletaConSilvio orderId={ORDINE} companyId={AZIENDA} puoModificare leggi={async () => [riga(ORDINE, { mancano: ["cliente.customer_id"] })]} />);
    expect(await screen.findByText(/manca: cliente in anagrafica/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Cosa fa Silvio da solo/ })).toHaveAttribute("href", "/azienda/impostazioni/silvio-commesse");
  });
});
