import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { CellaProtocolloRicevuta, type ProtocolliRicevute } from "@/components/fatturazione/ProtocolloRicevuta";

const fattura = { id: "f1", numero_fattura: "53", cedente_ragione_sociale: "Fornitore Srl", data_fattura: "2026-11-05", data_ricezione_sdi: "2026-11-06T10:00:00Z", stato: "letta" };
const protocollo = { id: "p1", sezionale_id: "s1", documento_id: "f1", lato: "acquisti" as const, anno: 2026, numero: 12, data_registrazione: "2026-11-06" };

function finto(over: Partial<ProtocolliRicevute> = {}): ProtocolliRicevute {
  return {
    registri: { ricarica: vi.fn(async () => {}) } as unknown as ProtocolliRicevute["registri"],
    visibile: true, puoScrivere: true,
    di: () => undefined, etichetta: p => `${p.numero}/${p.anno}`, prossimo: () => 13,
    ...over,
  };
}
const monta = (p: ProtocolliRicevute) => render(<QueryClientProvider client={new QueryClient()}><CellaProtocolloRicevuta fattura={fattura} protocolli={p} /></QueryClientProvider>);

describe("protocollo interno delle fatture ricevute", () => {
  beforeEach(() => rpc.mockReset());

  it("senza protocollo propone il prossimo numero e lo assegna", async () => {
    rpc.mockResolvedValue({ data: { numero: 13, anno: 2026 }, error: null });
    monta(finto());
    fireEvent.click(screen.getByRole("button", { name: "Assegna" }));
    expect(screen.getByPlaceholderText("13 (il prossimo)")).toBeTruthy();
    expect((screen.getByLabelText("Registrata il") as HTMLInputElement).value).toBe("2026-11-06");
    fireEvent.click(screen.getByRole("button", { name: "Assegna il prossimo" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("fattura_ricevuta_protocolla", { p_fattura: "f1", p_numero: null, p_data: null, p_motivo: null }));
  });

  it("con protocollo mostra il numero; per cambiarlo chiede il motivo", async () => {
    rpc.mockResolvedValue({ data: { numero: 20, anno: 2026 }, error: null });
    monta(finto({ di: () => protocollo }));
    fireEvent.click(screen.getByRole("button", { name: "12/2026" }));
    fireEvent.change(screen.getByLabelText("Numero"), { target: { value: "20" } });
    const cambia = screen.getByRole("button", { name: "Cambia protocollo" });
    expect((cambia as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Perché lo cambi"), { target: { value: "numero sbagliato" } });
    fireEvent.click(cambia);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("fattura_ricevuta_protocolla", { p_fattura: "f1", p_numero: 20, p_data: null, p_motivo: "numero sbagliato" }));
  });

  it("chi non scrive la contabilità vede solo il numero, non «Assegna»", () => {
    monta(finto({ puoScrivere: false }));
    expect(screen.queryByRole("button", { name: "Assegna" })).toBeNull();
  });

  it("la lista mostra la colonna accanto al numero e il pulsante per numerare l'anno", () => {
    const pagina = readFileSync("src/pages/azienda/fatturazione/FattureRicevutePage.tsx", "utf8");
    // I testi possono essere letterali o tradotti: <TableHead>{t("Numero")}</TableHead>.
    const testo = (frase: string) => String.raw`(?:${frase}|\{(?:t|tr|tTesto)\("${frase}"\)\})`;
    expect(pagina).toMatch(new RegExp(
      `<TableHead>${testo("Numero")}</TableHead>\\s*\\{protocolli\\.visibile && <TableHead[^>]*>${testo("Prot\\.")}</TableHead>\\}`,
    ));
    expect(pagina).toContain("<NumeraProtocolliRicevute");
  });
});
