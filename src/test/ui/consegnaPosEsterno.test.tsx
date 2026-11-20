import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import type { ConsegnaPosEsterno } from "@/hooks/useAvvioSicurezza";
import { PosDellaDitta } from "@/pages/campo/subappaltatore/PosDellaDitta";
import { PosEsternoImpresa } from "@/components/sicurezza/PosEsternoImpresa";

const mock = vi.hoisted(() => ({
  data: [] as ConsegnaPosEsterno[],
  errore: false,
  carica: vi.fn(),
  registra: vi.fn(),
}));
vi.mock("@/hooks/useAvvioSicurezza", () => ({
  useConsegnePosEsterno: () => ({ data: mock.data, isError: mock.errore, isLoading: false }),
  useAvanzaPosEsterno: () => ({ mutateAsync: mock.registra }),
  useRichiestaPosEsterno: () => ({ isPending: false }),
  caricaPosEsterno: mock.carica,
  STATI_POS_ESTERNO: { richiesto: "In attesa del POS", positivo: "Esito CSE positivo" },
}));
vi.mock("@/lib/storagePrivato", () => ({ apriFileRiservato: vi.fn() }));
beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});
afterEach(() => { cleanup(); mock.carica.mockReset(); mock.registra.mockReset(); mock.errore = false; });

const richiesta: ConsegnaPosEsterno = {
  id: "pos-ditta", company_id: "azienda", order_id: "commessa", subappaltatore_id: "ditta", nome_commessa: "Cantiere dimostrativo",
  stato: "richiesto", corrente: true, revisione: null, file_path: null, file_name: null,
  ricevuto_il: null, inoltrato_il: null, cse_ricevuto_il: null, esito_il: null,
  psc_comunicato: null, psc_comunicato_il: null, versione_avvio: null,
  pos_affidataria_id: null, pos_affidataria_revisione: null, nota: null, updated_at: "2026-11-20T10:00:00Z",
};

it("consegna il PDF sulla richiesta della commessa e riprova riutilizzando lo stesso caricamento", async () => {
  mock.data = [richiesta, { ...richiesta, id: "storico", nome_commessa: "Richiesta storica", corrente: false }];
  mock.carica.mockResolvedValue("azienda/pos-ditta/file.pdf");
  mock.registra.mockRejectedValueOnce(new Error("Connessione interrotta")).mockResolvedValue(richiesta);
  render(<PosDellaDitta companyId="azienda" userId="utente-ditta" />);
  expect(screen.queryByText("Richiesta storica")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Consegna POS" }));
  fireEvent.change(screen.getByLabelText("Revisione riportata sul documento"), { target: { value: "02" } });
  const file = new File(["%PDF-"], "POS.pdf", { type: "application/pdf" });
  fireEvent.change(screen.getByLabelText("File PDF"), { target: { files: [file] } });
  fireEvent.submit(screen.getByRole("button", { name: "Registra consegna" }).closest("form")!);
  await screen.findByText("Connessione interrotta");
  fireEvent.submit(screen.getByRole("button", { name: "Registra consegna" }).closest("form")!);
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(mock.carica).toHaveBeenCalledExactlyOnceWith(richiesta, file);
  expect(mock.registra).toHaveBeenLastCalledWith(expect.objectContaining({
    consegna: richiesta, azione: "ricevi", file: { path: "azienda/pos-ditta/file.pdf", nome: "POS.pdf", revisione: "02" },
  }));
});

it("se il PSC è cambiato non mostra l’esito precedente come conclusione corrente", () => {
  mock.data = [{ ...richiesta, stato: "positivo", revisione: "01", da_riesaminare: true }];
  render(<PosDellaDitta companyId="azienda" userId="utente-ditta" />);
  expect(screen.getByText(/Da riesaminare/)).toBeInTheDocument();
  expect(screen.queryByText(/Esito CSE positivo/)).not.toBeInTheDocument();
});

it("l'ufficio può chiedere subito una nuova copia di un POS ricevuto con il PSC precedente", () => {
  const vecchio = {
    id: "psc-1", company_id: "azienda", order_id: "commessa", archivio: "sicurezza_fascicolo" as const,
    titolo: "PSC demo", file_name: "psc-1.pdf", file_path: "azienda/psc-1.pdf", data_documento: "", revisione: "01", sha256: "a".repeat(64),
  };
  const nuovo = { ...vecchio, id: "psc-2", revisione: "02", sha256: "b".repeat(64) };
  render(<PosEsternoImpresa companyId="azienda" orderId="commessa" subId="ditta" solaLettura={false}
    avvio={{ stato: "previsto", psc: nuovo, versione: "v2", motivazione: null, updated_at: "" }}
    righe={[{ ...richiesta, stato: "ricevuto", file_path: "azienda/pos-ditta/file.pdf", psc_comunicato: nuovo, psc_alla_ricezione: vecchio }]}
    documenti={[]} />);
  expect(screen.getByText(/Alla ricezione era stato condiviso il PSC rev. 01/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Richiedi nuova revisione" })).toBeEnabled();
});
