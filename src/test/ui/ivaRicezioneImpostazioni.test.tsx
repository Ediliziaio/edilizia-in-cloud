// Liquidazione IVA, fasi 0 e 1.1: il pannello della data di ricezione nel
// registro acquisti e la scheda delle impostazioni IVA.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// Lo Switch di Radix misura la sua dimensione: jsdom non ha ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const state = vi.hoisted(() => ({
  rpc: [] as { fn: string; args: Record<string, unknown> }[],
  upsert: [] as Record<string, unknown>[],
  admin: true,
  impostazioni: null as Record<string, unknown> | null,
}));

vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "company-a" }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ isAdmin: state.admin, isLoading: false, solaLettura: false }),
}));
vi.mock("@/hooks/useAnagraficaAzienda", () => ({ useAnagraficaAzienda: () => ({ data: { codice_fiscale: "09876543210" }, isLoading: false }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => {
      state.rpc.push({ fn, args });
      return Promise.resolve({ data: { aggiornate: 1, saltate: 0 }, error: null });
    },
    from: () => {
      const chain: Record<string, unknown> = {};
      for (const k of ["select", "eq", "abortSignal"]) chain[k] = () => chain;
      chain.maybeSingle = () => Promise.resolve({ data: state.impostazioni, error: null });
      chain.upsert = (row: Record<string, unknown>) => {
        state.upsert.push(row);
        return Promise.resolve({ error: null });
      };
      return chain;
    },
  },
}));

import { RicezioneAcquisti } from "@/components/fatturazione/RicezioneAcquisti";
import { ImpostazioniIVA } from "@/components/contabilita/ImpostazioniIVA";
import { fiscalRows, fiscalReceivedLabel, type FiscalDocument } from "@/lib/fatturazione/fiscalWorkspace";

const wrap = (ui: ReactNode) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

const doc = (id: string, origine: FiscalDocument["ricezione_origine"], extra: Partial<FiscalDocument> = {}): FiscalDocument => ({
  id,
  numero_fattura: `F-${id}`,
  cedente_ragione_sociale: "Fornitore",
  data_fattura: "2026-12-29",
  imponibile_totale: 100,
  iva_totale: 22,
  totale_documento: 122,
  riepilogo_iva: [{ aliquota: "22", imponibile: "100", imposta: "22" }],
  ricezione_origine: origine,
  ...extra,
});

beforeEach(() => {
  state.rpc = [];
  state.upsert = [];
  state.admin = true;
  state.impostazioni = null;
});
afterEach(cleanup);

describe("data di ricezione degli acquisti", () => {
  it("conta le origini e preseleziona solo quelle da verificare", async () => {
    wrap(
      <RicezioneAcquisti
        company="company-a"
        acquisti={[
          doc("a", "sdi", { data_ricezione_sdi: "2026-12-30T10:00:00Z" }),
          doc("b", "presunta", { data_fattura: "2026-12-05" }),
          doc("c", "da_verificare"),
        ]}
      />,
    );
    expect(screen.getByText(/1 dallo SDI · 0 dichiarate · 1 presunte/)).toBeInTheDocument();
    expect(screen.getByText(/1 di fine dicembre da verificare/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dichiara data di ricezione" }));
    // Quella con data SDI non è nell'elenco.
    expect(screen.queryByText(/F-a/)).not.toBeInTheDocument();
    expect(screen.getByText(/Vale per le 1 selezionate/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Arrivata il"), { target: { value: "2027-01-03" } });
    fireEvent.click(screen.getByRole("button", { name: "Conferma data" }));
    await waitFor(() => expect(state.rpc).toHaveLength(1));
    expect(state.rpc[0]).toEqual({
      fn: "fiscalita_dichiara_ricezione",
      args: { p_company: "company-a", p_ids: ["c"], p_data: "2027-01-03" },
    });
  });

  it("senza permesso di modifica mostra i conti ma non l'azione", () => {
    state.admin = false;
    wrap(<RicezioneAcquisti company="company-a" acquisti={[doc("c", "da_verificare")]} />);
    expect(screen.getByText(/Data di ricezione degli acquisti/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dichiara data di ricezione" })).not.toBeInTheDocument();
  });

  it("la riga del registro dice da dove viene la data, e la presunta non è un errore", () => {
    const [presunta] = fiscalRows([], [doc("p", "presunta", { data_fattura: "2026-10-05" })]);
    expect(fiscalReceivedLabel(presunta)).toBe("Ricezione non nota · presunta alla data della fattura");
    expect(presunta.issues.join(" ")).not.toMatch(/Ricezione/);

    const [verifica] = fiscalRows([], [doc("v", "da_verificare")]);
    expect(verifica.issues.join(" ")).toMatch(/fine dicembre/);

    const [dichiarata] = fiscalRows([], [doc("d", "dichiarata", { ricezione_dichiarata_il: "2027-01-03" })]);
    expect(dichiarata.received).toBe("2027-01-03");
    expect(fiscalReceivedLabel(dichiarata)).toBe("Ricezione 03/01/2027 · dichiarata");
  });
});

describe("registro: stesse regole del prospetto", () => {
  it("riga negativa in una fattura resta negativa; nota di credito positiva si sottrae, negativa no", () => {
    const righe = fiscalRows([], [
      doc("f", "sdi", { tipo_documento: "TD01", totale_documento: 1098, riepilogo_iva: [
        { aliquota: "22", imponibile: "1000", imposta: "220" }, { aliquota: "22", imponibile: "-100", imposta: "-22" }] }),
      doc("n", "sdi", { tipo_documento: "TD04", totale_documento: 122, riepilogo_iva: [{ aliquota: "22", imponibile: "100", imposta: "22" }] }),
      doc("m", "sdi", { tipo_documento: "TD04", totale_documento: -61, riepilogo_iva: [{ aliquota: "22", imponibile: "-50", imposta: "-11" }] }),
    ]);
    const iva = (id: string) => righe.filter((r) => r.documentId === id && !r.synthetic).reduce((t, r) => t + (r.tax ?? 0), 0);
    expect(iva("f")).toBe(19800);
    expect(iva("n")).toBe(-2200);
    expect(iva("m")).toBe(-1100);
  });

  it("integrazione ricevuta: proiezione anche sul registro vendite", () => {
    const righe = fiscalRows([], [doc("t", "sdi", { tipo_documento: "TD18", integrazione: true })]);
    const vendite = righe.filter((r) => r.side === "vendite");
    expect(vendite).toHaveLength(1);
    expect(vendite[0]).toMatchObject({ synthetic: true, tax: 2200, base: 0 });
    expect(vendite[0].nature).toMatch(/IVA anche a debito/);
  });
});

describe("impostazioni IVA", () => {
  it("senza riga dice cosa manca e salva le scelte dell'anno", async () => {
    wrap(<ImpostazioniIVA anno={2026} />);
    expect(await screen.findByText(/Impostazioni IVA dell'anno non compilate/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Liquidazione"), { target: { value: "mensile" } });
    expect(screen.getByLabelText("Codice fiscale dell'azienda")).toHaveValue("09876543210");
    fireEvent.change(screen.getByLabelText("Codice fiscale dell'azienda"), { target: { value: "01234567890" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva impostazioni" }));
    await waitFor(() => expect(state.upsert).toHaveLength(1));
    expect(state.upsert[0]).toMatchObject({
      company_id: "company-a",
      anno: 2026,
      periodicita: "mensile",
      cf_contribuente: "01234567890",
      regime: "ordinario",
    });
  });

  it("con la riga salvata segnala i dati del frontespizio ancora mancanti", async () => {
    state.impostazioni = {
      periodicita: "trimestrale", regime: "ordinario", iva_per_cassa: false, pro_rata_percentuale: null,
      attivita_separate: false, credito_anno_precedente: "1200.50", metodo_acconto: "storico",
      cf_contribuente: "01234567890", cf_dichiarante: null, codice_carica: "1", cf_intermediario: null,
      note: null, aggiornato_il: "2026-11-07T10:00:00Z",
    };
    wrap(<ImpostazioniIVA anno={2026} />);
    expect(await screen.findByText(/Codice fiscale di chi firma la comunicazione/)).toBeInTheDocument();
    expect(screen.getByLabelText("Credito IVA dell'anno precedente (€)")).toHaveValue(1200.5);
    expect(screen.getByRole("button", { name: "Aggiorna impostazioni" })).toBeInTheDocument();
  });
});
