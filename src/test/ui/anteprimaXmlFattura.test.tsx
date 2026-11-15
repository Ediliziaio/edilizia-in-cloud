/**
 * L'anteprima del file XML nell'editor (15/11/2026): mostra i dati del file che parte
 * allo SDI, si aggiorna quando il documento cambia e dice chiaro che è quella fiscale.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { AnteprimaXmlFattura } from "@/components/fatturazione/AnteprimaXmlFattura";
import type { EditorState } from "@/pages/azienda/fatturazione/editor/useEditorState";

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

afterEach(cleanup);

describe("Anteprima del file XML", () => {
  it("mostra i dati del file: ufficio, contratto, CIG, riga e split payment", () => {
    render(<AnteprimaXmlFattura documento={fattura} azienda={azienda} />);
    const vista = screen.getByTestId("anteprima-xml");
    expect(within(vista).getByText(/file che parte allo SDI/)).toBeTruthy();
    expect(within(vista).getByText("Codice destinatario")).toBeTruthy();
    expect(within(vista).getAllByText("UFXYZ1").length).toBeGreaterThan(0);
    expect(within(vista).getByText("Contratto")).toBeTruthy();
    expect(within(vista).getByText("Rep. 9/2026")).toBeTruthy();
    expect(within(vista).getByText("1234567ABC")).toBeTruthy();
    expect(within(vista).getByText(/scissione dei pagamenti/)).toBeTruthy();
    expect(within(vista).getByText("1.220,00 €")).toBeTruthy();
  });

  it("cambiando il documento cambia anche l'XML letto", () => {
    const { rerender } = render(<AnteprimaXmlFattura documento={fattura} azienda={azienda} />);
    expect(screen.getByText("FT 13/26")).toBeTruthy();
    const righe = [{ ...(fattura.righe as never[])[0] as Record<string, unknown>, descrizione: "Opere murarie", prezzo_unitario: 2000, imponibile: 2000, imposta: 440, totale_riga: 2440 }];
    rerender(<AnteprimaXmlFattura documento={{ ...fattura, numero: "FT 14/26", righe, totale_documento: 2440 } as unknown as EditorState} azienda={azienda} />);
    expect(screen.getByText("FT 14/26")).toBeTruthy();
    expect(screen.getByText("Opere murarie")).toBeTruthy();
    expect(screen.getByText("2.440,00 €")).toBeTruthy();
  });

  it("senza anagrafica dell'azienda lo dice invece di mostrare un file sbagliato", () => {
    render(<AnteprimaXmlFattura documento={fattura} azienda={null} />);
    expect(screen.getByRole("alert").textContent).toContain("non sono ancora caricati");
  });
});
