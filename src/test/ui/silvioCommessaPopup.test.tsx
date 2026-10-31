/**
 * Il popup «Crea con Silvio» (fase 1, lotto 1.5), con lettori e database finti: si apre
 * già al lavoro con un preventivo, le aree si riempiono man mano, la modifica e l'annulla
 * passano dalla storia, un conflitto ferma «Crea» finché non si sceglie, «Crea» chiama la RPC.
 */
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { Frammento } from "../../../shared/silvio-commessa/piano.ts";
import type { ServiziSilvioCommessa } from "@/components/silvio-commessa/servizi";
import type { EsitoLettura } from "@/lib/silvio-commessa/leggiDocumento";
import type { ClientBozze } from "@/lib/silvio-commessa/bozze";

vi.mock("@/hooks/useCompanyCustomers", () => ({
  useCompanyCustomers: () => ({ data: [{ id: "c0000000-0000-4000-a000-000000000001", first_name: "Mario", last_name: "Rossi", email: "mario@esempio.it" }] }),
}));
vi.mock("@/hooks/useVoiceInput", () => ({
  useVoiceInput: () => ({ recording: false, transcribing: false, recordingMs: 0, toggle: vi.fn() }),
}));
vi.mock("@/components/orders/CreateCustomerDialog", () => ({ CreateCustomerDialog: (): null => null }));

import CreaConSilvioDialog from "@/components/silvio-commessa/CreaConSilvioDialog";

const AZIENDA = "d2000000-0000-4000-a000-000000000002";
const UTENTE = "u0000000-0000-4000-a000-000000000001";
const PREVENTIVO = "q0000000-0000-4000-a000-000000000142";

const dalPreventivo: Frammento = {
  fonte: { tipo: "preventivo", id: PREVENTIVO, etichetta: "preventivo PR-0142" },
  aree: {
    identita: { "identita.description": { valore: "Rifacimento bagno", fiducia: 1, stato: "fatto" } },
    cliente: { "cliente.nome": { valore: { client_name: "Mario Rossi" }, fiducia: 1, stato: "fatto" } },
    economia: { "economia.total_amount": { valore: 48500, fiducia: 1, stato: "fatto" } },
    fasi: {
      "fasi.order_work_phases": {
        valore: [{ name: "Demolizioni", giorno_inizio: 1, giorni: 3 }, { name: "Impianti", giorno_inizio: 4, giorni: 5 }],
        fiducia: 0.6, stato: "proposta",
      },
    },
  },
};

const dalContratto: Frammento = {
  fonte: { tipo: "contratto", etichetta: "Contratto.pdf" },
  aree: {
    economia: {
      "economia.total_amount": {
        valore: 47900, fiducia: 0.9, stato: "fatto",
        fonte: { tipo: "contratto", etichetta: "Contratto.pdf", dove: "pagina 2", citazione: "importo di € 47.900,00" },
      },
    },
  },
  costoEur: 0.012,
};

function differita<T>() {
  let risolvi!: (v: T) => void;
  const promessa = new Promise<T>((r) => { risolvi = r; });
  return { promessa, risolvi };
}

/** Un client di Supabase finto: la bozza nasce con id «b1», le RPC rispondono. */
function dbFinto() {
  const rpc = vi.fn(async (nome: string, _args: Record<string, unknown>) => {
    if (nome === "commessa_crea_con_silvio") {
      return { data: { order_id: "o1", colonne: 4, fasi: 2, voci: 0, rate: 0, contratto: false, righe_registrate: 7 }, error: null };
    }
    return { data: 0, error: null };
  });
  const inserite: Record<string, unknown>[] = [];
  const query = () => {
    const q: Record<string, unknown> = {};
    const catena = (k: string) => (...a: unknown[]) => { if (k === "insert") inserite.push(a[0] as Record<string, unknown>); return q; };
    for (const k of ["select", "insert", "update", "eq", "neq", "gt", "order", "limit"]) q[k] = catena(k);
    const riga = async () => ({ data: { id: "b1", stato: "bozza", fonti: [] as unknown[], piano: {}, storia: [] as unknown[] }, error: null as unknown });
    q.single = riga;
    q.maybeSingle = riga;
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
    frammentiPreventivo: vi.fn(async () => [dalPreventivo]),
    frammentoComputo: vi.fn(async () => null),
    leggiFile: vi.fn(async (): Promise<EsitoLettura> => ({
      riconosciuto: { lettore: "silvio_commessa", fonte: "contratto", ai: true, immagine: false, motivo: "contratto" },
      frammenti: [dalContratto],
    })),
    leggiTesto: vi.fn(async (): Promise<EsitoLettura> => ({
      riconosciuto: { lettore: "silvio_commessa", fonte: "testo", ai: true, immagine: false, motivo: "testo" }, frammenti: [],
    })),
    registraCorrezioni: vi.fn(async () => {}),
    frammentiCommessa: vi.fn(async () => []),
    elencaAllegati: vi.fn(async () => []),
    scaricaAllegato: vi.fn(async () => new File([], "vuoto")),
    db: db as unknown as ClientBozze,
    ...over,
  };
  return { s, db };
}

function apri(s: ServiziSilvioCommessa, onCreata = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <CreaConSilvioDialog open onOpenChange={() => {}} companyId={AZIENDA} userId={UTENTE} servizi={s} onCreata={onCreata}
          iniziale={{ tipo: "preventivo", id: PREVENTIVO, etichetta: "preventivo PR-0142" }} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { onCreata };
}

const commessa = () => screen.getByRole("tabpanel", { name: "La commessa" });
const crea = () => screen.getByRole("button", { name: /^Crea/ });

describe("Popup «Crea con Silvio»", () => {
  it("si apre già al lavoro con il preventivo, e le aree si riempiono man mano", async () => {
    const lettura = differita<Frammento[]>();
    const { s } = servizi({ frammentiPreventivo: vi.fn(() => lettura.promessa) });
    apri(s);

    expect(s.frammentiPreventivo).toHaveBeenCalledWith(PREVENTIVO, null);
    const fonti = screen.getByRole("list", { name: "Fonti caricate" });
    expect(within(fonti).getByText("preventivo PR-0142")).toBeInTheDocument();
    expect(within(fonti).getByText(/sto leggendo/)).toBeInTheDocument();
    // Prima della lettura le aree mostrano solo cosa manca (❓).
    const prima = within(commessa()).getByRole("region", { name: "Economia" });
    expect(within(prima).getAllByText("manca").length).toBeGreaterThan(0);
    expect(within(prima).queryByText(/48\.500/)).not.toBeInTheDocument();
    expect(crea()).toBeDisabled();

    await act(async () => { lettura.risolvi([dalPreventivo]); });

    const economia = within(commessa()).getByRole("region", { name: "Economia" });
    expect(within(economia).getByText(/48\.500/)).toBeInTheDocument();
    expect(within(commessa()).getByText(/2 fasi/)).toBeInTheDocument();
    expect(within(fonti).getByText(/letta/)).toBeInTheDocument();
    // Silvio dice cosa ha preso, e chiede l'inizio con un pulsante.
    const chat = screen.getByRole("region", { name: "Messaggi di Silvio" });
    expect(within(chat).getByText(/Da preventivo PR-0142 ho preso/)).toBeInTheDocument();
    expect(within(chat).getByRole("button", { name: /^Inizio / })).toBeInTheDocument();
    expect(crea()).toBeEnabled();
  });

  it("la modifica passa da applica e Cmd+Z la annulla", async () => {
    const { s } = servizi();
    apri(s);
    const economia = await within(commessa()).findByRole("region", { name: "Economia" });

    fireEvent.click(within(economia).getByRole("button", { name: "Modifica «Importo»" }));
    fireEvent.change(within(economia).getByLabelText("Importo"), { target: { value: "50.000" } });
    fireEvent.click(within(economia).getByRole("button", { name: "Salva" }));
    expect(within(economia).getByText(/50\.000/)).toBeInTheDocument();
    expect(within(economia).queryByText(/48\.500/)).not.toBeInTheDocument();

    fireEvent.click(within(economia).getByRole("button", { name: "Da dove viene «Importo»" }));
    expect(within(economia).getByText(/modificato da te/)).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "z", metaKey: true });
    expect(within(economia).getByText(/48\.500/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Annulla/ })).toBeDisabled();
  });

  it("la data d'inizio data dalla chat mette le date alle fasi", async () => {
    const { s } = servizi();
    apri(s);
    const chat = screen.getByRole("region", { name: "Messaggi di Silvio" });
    fireEvent.click(await within(chat).findByRole("button", { name: /^Inizio / }));
    const fasi = within(commessa()).getByRole("region", { name: "Fasi e tempi" });
    expect(within(fasi).getByText(/2 fasi · \d+ \w+ → \d+ \w+/)).toBeInTheDocument();
    expect(within(fasi).getByText("Fine lavori")).toBeInTheDocument();
  });

  it("mostra il costo prima di leggere; un conflitto ferma «Crea» e si risolve con un tocco", async () => {
    const { s } = servizi();
    apri(s);
    await within(commessa()).findByRole("region", { name: "Economia" });

    const pdf = new File(["%PDF-1.4"], "Contratto.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("Scegli i file da far leggere a Silvio"), { target: { files: [pdf] } });
    const conferma = screen.getByRole("group", { name: "Letture da confermare" });
    expect(within(conferma).getByText(/circa 0,01 €/)).toBeInTheDocument();
    expect(s.leggiFile).not.toHaveBeenCalled();

    fireEvent.click(within(conferma).getByRole("button", { name: "Leggi il documento" }));
    const economia = within(commessa()).getByRole("region", { name: "Economia" });
    const scelta = await within(economia).findByRole("group", { name: "Scegli quale «Importo» tenere" });
    expect(within(scelta).getAllByText(/47\.900/)[0]).toBeInTheDocument();
    expect(within(scelta).getByText("«importo di € 47.900,00»")).toBeInTheDocument();
    expect(within(scelta).getByText(/48\.500/)).toBeInTheDocument();
    expect(within(scelta).getByText(/Contratto\.pdf, pagina 2/)).toBeInTheDocument();
    expect(crea()).toBeDisabled();
    expect(screen.getByText(/c'è un valore in conflitto da decidere/)).toBeInTheDocument();

    const preventivo = within(scelta).getByText(/preventivo PR-0142/).closest("div")!.parentElement!;
    fireEvent.click(within(preventivo).getByRole("button", { name: "Tieni questo" }));
    expect(within(economia).queryByRole("group", { name: /Scegli quale/ })).not.toBeInTheDocument();
    expect(within(economia).getByText(/48\.500/)).toBeInTheDocument();
    expect(crea()).toBeEnabled();
  });

  it("«Crea» salva la bozza, chiama la RPC, registra le correzioni e apre la commessa", async () => {
    const { s, db } = servizi();
    const { onCreata } = apri(s);
    const economia = await within(commessa()).findByRole("region", { name: "Economia" });
    fireEvent.click(within(economia).getByRole("button", { name: "Modifica «Importo»" }));
    fireEvent.change(within(economia).getByLabelText("Importo"), { target: { value: "49000" } });
    fireEvent.click(within(economia).getByRole("button", { name: "Salva" }));

    fireEvent.click(crea());
    await waitFor(() => expect(onCreata).toHaveBeenCalledWith("o1"));

    expect(db.inserite[0]).toMatchObject({ company_id: AZIENDA, modo: "crea" });
    expect(db.rpc).toHaveBeenCalledWith("commessa_crea_con_silvio", { p_bozza_id: "b1" });
    const correzioni = vi.mocked(s.registraCorrezioni).mock.calls[0][0];
    expect(correzioni.find((c) => c.chiave === "economia.total_amount")).toMatchObject({
      bozzaId: "b1", orderId: "o1", proposto: 48500, tenuto: 49000,
    });
  });
});

vi.mock("@/components/silvio-commessa/useCreaConSilvioAttivo", () => ({ useCreaConSilvioAttivo: () => true }));
import { StrisciaSilvioCommessa } from "@/components/silvio-commessa/StrisciaSilvioCommessa";

describe("Striscia «Silvio ha preparato N cose»", () => {
  it("conta le cose e dice in parole perché l'annullamento è rifiutato", async () => {
    const rpc = vi.fn(async (_nome: string, _args: unknown) => ({
      data: null as unknown, error: { code: "55000", message: "Non si può annullare: qualcuno ci ha già lavorato sopra (company_costs)." },
    }));
    const q: Record<string, unknown> = {};
    for (const k of ["select", "eq", "neq", "order", "limit"]) q[k] = () => q;
    q.maybeSingle = async () => ({ data: { id: "b1", modo: "crea", stato: "creata" }, error: null as unknown });
    q.then = (r: (x: unknown) => unknown) => Promise.resolve({ count: 12, error: null as unknown }).then(r);
    const db = { from: () => q, rpc, storage: { from: () => ({ remove: async () => ({ data: null as unknown, error: null as unknown }) }) } };

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter><StrisciaSilvioCommessa orderId="o1" companyId={AZIENDA} puoModificare db={db} /></MemoryRouter>
      </QueryClientProvider>,
    );
    const striscia = await screen.findByRole("region", { name: "Preparato da Silvio" });
    expect(within(striscia).getByText("12 cose")).toBeInTheDocument();

    fireEvent.click(within(striscia).getByRole("button", { name: "Annulla tutto" }));
    const conferma = await screen.findByRole("alertdialog");
    fireEvent.click(within(conferma).getByRole("button", { name: "Annulla tutto" }));
    expect(await within(conferma).findByRole("alert")).toHaveTextContent("qualcuno ha aggiunto un costo su questa commessa");
    expect(rpc).toHaveBeenCalledWith("commessa_annulla_silvio", { p_bozza_id: "b1" });
  });
});
