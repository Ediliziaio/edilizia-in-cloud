import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@testing-library/jest-dom/vitest";
import { oraSincronizzazione } from "@/components/fatturazione/GestionaleEsterno";

// Il dettaglio di una importata: impaginazione del dettaglio nativo, niente azioni che creano.
const riga = {
  id: "inv-1", company_id: "c1", origine: "importata", tipo: "fattura", numero: "FPR 12/26",
  data_emissione: "2026-09-01", data_scadenza: "2026-09-30", stato: "parzialmente_pagata",
  cliente_snapshot: { ragione_sociale: "Rossi Costruzioni", partita_iva: "01234567890" },
  imponibile_totale: 1000, iva_totale: 220, totale_documento: 1220, totale_da_pagare: 1220, importo_pagato: 200,
};
const fattura = {
  id: "inv-1", company_id: "c1", invoice_number: "FPR 12/26", document_type: "invoice", order_id: null as string | null,
  external_provider: "fattureincloud", external_sdi_id: "123", external_xml_url: "c1/x.xml",
  client_company_name: "Rossi Costruzioni", payment_method: "MP05", bank_iban: null as string | null,
  invoice_lines: [{ id: "l1", description: "Posa serramenti", quantity: 1, unit: "pz", unit_price: 1000, discount_percent: null as number | null, tax_rate: 22, tax_nature: null as string | null, line_net: 1000, line_tax: 220, line_gross: 1220, product_code: null as string | null, sort_order: 1 }],
};
vi.mock("@/integrations/supabase/client", () => {
  const catena = (dato: unknown) => {
    const c: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "not"]) c[m] = () => c;
    c.maybeSingle = async () => ({ data: dato, error: null as null });
    return c;
  };
  return { supabase: { from: (t: string) => catena(t === "invoices" ? fattura : riga), functions: { invoke: vi.fn() } } };
});
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "c1" } }) }));
vi.mock("@/hooks/useAnagraficaAzienda", () => ({ useAnagraficaAzienda: () => ({ data: null as null }) }));
vi.mock("@/components/fatturazione/PreviewFattura", () => ({
  PreviewFattura: ({ documento }: { documento: { righe: { descrizione: string }[] } }) => <p>Anteprima con {documento.righe.length} righe: {documento.righe[0]?.descrizione}</p>,
}));
vi.mock("@/components/fatturazione/CollegamentiEmessaImportata", () => ({ CollegamentiEmessaImportata: (): null => null }));
vi.mock("@/components/fatturazione/EmessaImportataDettaglio", () => ({ EmessaImportataDettaglio: (): null => null }));

import DettaglioFatturaImportata from "@/pages/azienda/fatturazione/DettaglioFatturaImportata";

afterEach(cleanup);

describe("Dettaglio di una fattura importata", () => {
  it("titolo, anteprima e pagamenti come il nativo; nessuna azione che crea o modifica", async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={["/azienda/documenti/importata/inv-1"]}>
          <Routes><Route path="/azienda/documenti/importata/:id" element={<DettaglioFatturaImportata />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("heading", { name: "Fattura numero FPR 12/26" })).toBeInTheDocument();
    expect(screen.getByText("Anteprima con 1 righe: Posa serramenti")).toBeInTheDocument();
    expect(screen.getByText("Informazioni")).toBeInTheDocument();
    expect(screen.getByText("Pagamenti")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Torna ai documenti/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Segna pagata/ })).toBeInTheDocument();
    for (const vietata of [/Modifica/, /Duplica/, /Emetti/, /Invia/, /Converti/]) {
      expect(screen.queryByRole("button", { name: vietata })).not.toBeInTheDocument();
    }
  });
});

describe("Ora dell'ultima sincronizzazione", () => {
  const adesso = new Date(2026, 9, 30, 16, 0);
  it("oggi, ieri, altrimenti il giorno", () => {
    expect(oraSincronizzazione(new Date(2026, 9, 30, 14, 32).toISOString(), adesso)).toBe("alle 14:32");
    expect(oraSincronizzazione(new Date(2026, 9, 29, 9, 5).toISOString(), adesso)).toBe("ieri alle 9:05");
    expect(oraSincronizzazione(new Date(2026, 9, 20, 18, 0).toISOString(), adesso)).toBe("il 20/10 alle 18:00");
  });
});
