/**
 * L'anteprima del file XML nell'editor (15/11/2026): mostra i dati del file che parte
 * allo SDI, si aggiorna quando il documento cambia e dice chiaro che è quella fiscale.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { download } = vi.hoisted(() => ({ download: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { storage: { from: () => ({ download }) } } }));

import { AnteprimaXmlFattura } from "@/components/fatturazione/AnteprimaXmlFattura";
import { generateFatturaPAXML } from "@/lib/fatturazione/generateXML";
import type { EditorState } from "@/pages/azienda/fatturazione/editor/useEditorState";
import type { AnagraficaAzienda, DocumentoFiscale } from "@/types/fatturazione";

const azienda = {
  ragione_sociale: "Demo Azienda 2 S.r.l.", partita_iva: "99999999999", codice_fiscale: "99999999999",
  indirizzo_via: "Via dei Cantieri", indirizzo_cap: "20099", indirizzo_comune: "Sesto San Giovanni",
  indirizzo_provincia: "MI", indirizzo_nazione: "IT", regime_fiscale: "RF01",
} as never;

const fattura = {
  tipo: "fattura_pa", numero: "FT 13/26", data_emissione: "2026-11-15", stato: "bozza",
  cliente_snapshot: {
    tipo_cliente: "PA", ragione_sociale: "Comune di Prova", codice_fiscale: "80012345676", codice_sdi: "UFXYZ1",
    indirizzo_via: "Piazza del Municipio 1", indirizzo_cap: "00100", indirizzo_comune: "Prova", indirizzo_provincia: "RM", indirizzo_nazione: "IT",
  },
  righe: [{ id: "r1", numero_linea: 1, descrizione: "Lavori", quantita: 1, unita_misura: "corpo", prezzo_unitario: 1000, aliquota_iva: "22", imponibile: 1000, imposta: 220, totale_riga: 1220 }],
  riepilogo_iva: [{ aliquota: "22", imponibile: 1000, imposta: 220, esigibilita: "S" }],
  esigibilita_iva: "S", imponibile_totale: 1000, iva_totale: 220, totale_documento: 1220, totale_da_pagare: 1000,
  riferimenti_pa: [{ chiave: "k1", tipo: "contratto", numero: "Rep. 9/2026", data: "2026-03-02", cig: "1234567ABC", righe_id: [], numeri_linea: [], origine: "manuale", cig_non_dovuto: false, cup_non_dovuto: false }],
} as unknown as EditorState;

const mostra = (documento: EditorState, anagrafica: AnagraficaAzienda | null = azienda) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const vista = render(<AnteprimaXmlFattura documento={documento} azienda={anagrafica} />, {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
  return vista;
};

afterEach(() => {
  cleanup();
  download.mockReset();
});

describe("Anteprima del file XML", () => {
  it("mostra i dati del file: ufficio, contratto, CIG, riga e split payment", () => {
    mostra(fattura);
    const vista = screen.getByTestId("anteprima-xml");
    expect(within(vista).getByText(/file XML per lo SDI/)).toBeTruthy();
    const iframe = within(vista).getByTitle("Fattura elettronica FT 13/26");
    expect(iframe).toHaveAttribute("sandbox", "");
    for (const valore of ["Rep. 9/2026", "1234567ABC", "UFXYZ1", "1.220,00 €"]) {
      expect(iframe.getAttribute("srcdoc")).toContain(valore);
    }
    expect(within(vista).getByText("Struttura XML")).toBeTruthy();
    expect(within(vista).getByText("Codice destinatario")).toBeTruthy();
    expect(within(vista).getAllByText("UFXYZ1").length).toBeGreaterThan(0);
    expect(within(vista).getByText("Contratto")).toBeTruthy();
    expect(within(vista).getByText("Rep. 9/2026")).toBeTruthy();
    expect(within(vista).getByText("1234567ABC")).toBeTruthy();
    expect(within(vista).getByText(/scissione dei pagamenti/)).toBeTruthy();
    expect(within(vista).getByText("1.220,00 €")).toBeTruthy();
  });

  it("cambiando il documento cambia anche l'XML letto", () => {
    const { rerender } = mostra(fattura);
    expect(screen.getByText("FT 13/26")).toBeTruthy();
    const righe = [{ ...(fattura.righe as never[])[0] as Record<string, unknown>, descrizione: "Opere murarie", prezzo_unitario: 2000, imponibile: 2000, imposta: 440, totale_riga: 2440 }];
    rerender(<AnteprimaXmlFattura documento={{ ...fattura, numero: "FT 14/26", righe, totale_documento: 2440 } as unknown as EditorState} azienda={azienda} />);
    expect(screen.getByText("FT 14/26")).toBeTruthy();
    expect(screen.getByText("Opere murarie")).toBeTruthy();
    expect(screen.getByText("2.440,00 €")).toBeTruthy();
    expect(screen.getByTitle("Fattura elettronica FT 14/26").getAttribute("srcdoc")).toContain("Opere murarie");
  });

  it("per una fattura trasmessa mostra l’XML archiviato", async () => {
    const xml = generateFatturaPAXML({ ...fattura, numero: "XML-ARCHIVIATO" } as DocumentoFiscale, azienda);
    download.mockResolvedValue({ data: { text: async () => xml }, error: null });
    mostra({ ...fattura, stato: "inviata_sdi", sdi_id_trasmissione: "7788", sdi_file_xml_url: "test/archivio.xml" }, null);
    const foglio = await screen.findByTitle("Fattura elettronica XML-ARCHIVIATO");
    expect(foglio.getAttribute("srcdoc")).not.toContain("FT 13/26");
    expect(download).toHaveBeenCalledWith("test/archivio.xml");
  });

  it("senza anagrafica dell'azienda lo dice invece di mostrare un file sbagliato", () => {
    mostra(fattura, null);
    expect(screen.getByRole("alert").textContent).toContain("non sono ancora caricati");
  });
});
