/**
 * Incassi dalla fattura (30/10/2026), con Supabase finto: lo storico, «Annulla»
 * su un incasso (storna_incasso_atomico, con conferma) e «Abbina al bonifico»
 * (riconcilia_bonifico_fattura, nuovo incasso o legame con uno già registrato).
 * Mai scritture dirette sulle tabelle.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentoFiscale } from "@/types/fatturazione";
import type { IncassoFattura } from "@/lib/fatturazione/abbinaBanca";

const rpc = vi.fn();
const from = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...a: unknown[]) => rpc(...a), from: (...a: unknown[]) => from(...a) },
}));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "azienda-1" }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { IncassiFattura, PannelloIncassi } from "@/components/fatturazione/IncassiFattura";
import { SceltaBonifico } from "@/components/fatturazione/AbbinaBonificoDialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";

const fattura = (x: Partial<DocumentoFiscale> = {}) => ({
  id: "doc-37", numero: "FT-2026-0037", numero_progressivo: 37, anno: 2026, tipo: "fattura",
  stato: "parzialmente_pagata", data_emissione: "2026-10-01",
  cliente_snapshot: { ragione_sociale: "Rossi Costruzioni Srl" },
  totale_da_pagare: 1000, importo_pagato: 400, metodo_pagamento_codice: "MP05", ...x,
}) as DocumentoFiscale;

const riga = (x: Partial<IncassoFattura> & { id: string }): IncassoFattura => ({
  data_movimento: "2026-10-10", importo: 400, metodo: "bonifico", riferimento: null, note: "Segnata pagata",
  created_at: "2026-10-10T09:00:00Z", parlante: false, riconciliazione_id: null, abbinamento: null,
  bonifico_id: null, bonifico_data: null, bonifico_importo: null, bonifico_descrizione: null, ...x,
});

let incassi: unknown[] = [];
let banca: unknown = { banca_collegata: true, movimenti: [] };

function monta(doc = fattura(), pagabile = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <IncassiFattura doc={doc} pagabile={pagabile} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
  incassi = [riga({ id: "m1" })];
  banca = { banca_collegata: true, movimenti: [] };
  rpc.mockImplementation(async (fn: string) => {
    if (fn === "incassi_fattura") return { data: incassi, error: null };
    if (fn === "movimenti_banca_per_fattura") return { data: banca, error: null };
    return { data: null, error: null };
  });
});

const chiamate = (fn: string) => rpc.mock.calls.filter((c) => c[0] === fn);

describe("lo storico degli incassi sulla fattura", () => {
  it("mostra ogni incasso, e quello col bonifico dice da quale", async () => {
    incassi = [
      riga({ id: "m2", importo: 300, bonifico_id: "tx-2", bonifico_data: "2026-10-12", abbinamento: "auto", riconciliazione_id: "rc-2" }),
      riga({ id: "m1" }),
    ];
    monta();
    expect(await screen.findByText("Abbinato al bonifico del 12/10 (automatico)")).toBeTruthy();
    expect(screen.getByText("Pagata in parte · abbinata al bonifico del 12/10")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Annulla incasso di/ })).toHaveLength(2);
  });

  it("un incasso con ritenuta non si annulla da qui: rimanda al registro", async () => {
    incassi = [riga({ id: "m3", parlante: true })];
    monta();
    expect(await screen.findByText("Bonifico con ritenuta")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Annulla incasso di/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Registro" }).getAttribute("href")).toBe("/azienda/documenti?tab=incassi");
  });
});

describe("«Annulla» un incasso", () => {
  it("chiede conferma, poi storna con storna_incasso_atomico", async () => {
    monta();
    fireEvent.click(await screen.findByRole("button", { name: /Annulla incasso di/ }));
    expect(await screen.findByText(/torna da incassare per questa cifra/)).toBeTruthy();
    expect(chiamate("storna_incasso_atomico")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Annulla incasso" }));
    await waitFor(() => expect(chiamate("storna_incasso_atomico")).toHaveLength(1));
    expect(rpc).toHaveBeenCalledWith("storna_incasso_atomico", { p_company_id: "azienda-1", p_movimento_id: "m1" });
    expect(from).not.toHaveBeenCalled();
  });

  it("su un incasso dal bonifico avvisa che il bonifico torna da abbinare", async () => {
    incassi = [riga({ id: "m2", bonifico_id: "tx-2", bonifico_data: "2026-10-12", riconciliazione_id: "rc-2" })];
    monta();
    fireEvent.click(await screen.findByRole("button", { name: /Annulla incasso di/ }));
    expect(await screen.findByText(/Il bonifico torna da abbinare in Tesoreria/)).toBeTruthy();
  });
});

describe("«Abbina al bonifico»", () => {
  it("senza banca collegata: lo dice e porta a Tesoreria", async () => {
    banca = { banca_collegata: false, movimenti: [] };
    monta();
    fireEvent.click(await screen.findByRole("button", { name: /Abbina al bonifico/ }));
    expect(await screen.findByText("Nessuna banca collegata")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Vai a Tesoreria/ }).getAttribute("href")).toBe("/azienda/tesoreria");
  });

  it("propone prima l'accredito uguale al residuo e registra l'incasso dal bonifico", async () => {
    incassi = [];
    banca = {
      banca_collegata: true,
      movimenti: [
        { id: "tx-a", data: "2026-10-25", importo: 50, descrizione: "Rimborso", controparte: null, riferimento: null, conto: "Conto" },
        { id: "tx-b", data: "2026-10-20", importo: 600, descrizione: "SALDO FATT 37/2026", controparte: "Rossi Costruzioni", riferimento: null, conto: "Conto" },
      ],
    };
    monta();
    fireEvent.click(await screen.findByRole("button", { name: /Abbina al bonifico/ }));
    const elenco = await screen.findByRole("list", { name: "Movimenti della banca" });
    const voci = within(elenco).getAllByRole("button");
    expect(voci[0].textContent).toContain("SALDO FATT 37/2026");
    expect(voci[0].textContent).toContain("Importo uguale al residuo");
    fireEvent.click(voci[0]);
    fireEvent.click(screen.getByRole("button", { name: "Abbina" }));
    await waitFor(() => expect(chiamate("riconcilia_bonifico_fattura")).toHaveLength(1));
    expect(rpc).toHaveBeenCalledWith("riconcilia_bonifico_fattura", {
      p_transaction_id: "tx-b",
      p_documento_id: "doc-37",
      p_match_type: "manual",
      p_match_score: 100,
      p_movimento_id: null,
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("già pagata a mano: il bonifico si abbina all'incasso esistente, senza contarlo due volte", async () => {
    incassi = [riga({ id: "m1", importo: 1000 })];
    banca = {
      banca_collegata: true,
      movimenti: [{ id: "tx-c", data: "2026-10-11", importo: 1000, descrizione: "Bonifico", controparte: null, riferimento: null, conto: null }],
    };
    monta(fattura({ stato: "pagata", importo_pagato: 1000 }), false);
    fireEvent.click(await screen.findByRole("button", { name: /Abbina al bonifico/ }));
    const elenco = await screen.findByRole("list", { name: "Movimenti della banca" });
    fireEvent.click(within(elenco).getAllByRole("button")[0]);
    // la strada «pagamento nuovo» non c'è: non resta niente da incassare
    expect((screen.getByRole("radio", { name: /pagamento nuovo/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("radio", { name: /incasso già registrato/ }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Abbina" }));
    await waitFor(() => expect(chiamate("riconcilia_bonifico_fattura")).toHaveLength(1));
    expect(chiamate("riconcilia_bonifico_fattura")[0][1]).toMatchObject({ p_transaction_id: "tx-c", p_movimento_id: "m1" });
  });

  it("fattura pagata con bonifico già abbinato e niente da incassare: nessun bottone per abbinare", async () => {
    incassi = [riga({ id: "m1", importo: 1000, bonifico_id: "tx-1", bonifico_data: "2026-10-11", riconciliazione_id: "rc-1" })];
    monta(fattura({ stato: "pagata", importo_pagato: 1000 }), false);
    expect(await screen.findByText("Pagata · abbinata al bonifico del 11/10")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Abbina al bonifico/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Segna pagata/ })).toBeNull();
  });
});

describe("lo stesso aspetto per una fattura importata (dati e azioni passati da fuori)", () => {
  it("il pannello mostra lo storico e chiama le azioni di chi lo usa, senza RPC proprie", async () => {
    const onAnnulla = vi.fn();
    const onAbbina = vi.fn();
    render(
      <MemoryRouter>
        <PannelloIncassi
          incassi={[riga({ id: "pag-1", importo: 250, bonifico_id: "tx-1", bonifico_data: "2026-10-05" })]}
          caricamento={false}
          errore={null}
          stato="parziale"
          puoSegnarePagata={false}
          puoAbbinare
          onSegnaPagata={vi.fn()}
          onAbbina={onAbbina}
          onAnnulla={onAnnulla}
          annullaInCorso={false}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("Pagata in parte · abbinata al bonifico del 05/10")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Abbina al bonifico/ }));
    expect(onAbbina).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Annulla incasso di/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Annulla incasso" }));
    expect(onAnnulla).toHaveBeenCalledWith(expect.objectContaining({ id: "pag-1" }));
    expect(rpc).not.toHaveBeenCalled();
  });

  it("la scelta del bonifico ordina e restituisce la scelta a chi la usa", () => {
    const onAbbina = vi.fn();
    render(
      <MemoryRouter>
        <Dialog open><DialogContent>
        <SceltaBonifico
          fattura={{ numero: "FIC-12", cliente: "Bianchi Spa", residuo: 800, data_emissione: "2026-10-01" }}
          incassi={[]}
          banca={{ isLoading: false, isError: false, error: null, data: { bancaCollegata: true, movimenti: [
            { id: "tx-x", data: "2026-10-03", importo: 90, descrizione: "Altro", controparte: null, riferimento: null, conto: null },
            { id: "tx-y", data: "2026-10-04", importo: 800, descrizione: "Saldo FIC-12", controparte: "Bianchi Spa", riferimento: null, conto: null },
          ] } }}
          inCorso={false}
          onAbbina={onAbbina}
          onChiudi={vi.fn()}
        />
        </DialogContent></Dialog>
      </MemoryRouter>,
    );
    const voci = within(screen.getByRole("list", { name: "Movimenti della banca" })).getAllByRole("button");
    fireEvent.click(voci[0]);
    fireEvent.click(screen.getByRole("button", { name: "Abbina" }));
    expect(onAbbina).toHaveBeenCalledWith({ transactionId: "tx-y", incassoId: null, punteggio: 100 });
    expect(rpc).not.toHaveBeenCalled();
  });
});
