import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { CellaProtocolloCommessa, NumeraProtocolliCommesse, etichettaProtocolloCantiere, type FatturaPerProtocolloCommessa, type ProtocolliCommessa } from "@/components/fatturazione/ProtocolloCommessa";

const CANTIERI = [
  { id: "o1", codice: "O-0001", descrizione: "Cherubini — lotto Via Luigi Cherubini", sigla: "Che" },
  { id: "o2", codice: "O-0002", descrizione: "Via Callimaco 28", sigla: "Cal" },
];
const fattura: FatturaPerProtocolloCommessa = { id: "f1", numero_fattura: "53", cedente_ragione_sociale: "Fornitore Srl", stato: "letta" };

function finto(over: Partial<ProtocolliCommessa> = {}): ProtocolliCommessa {
  const base: ProtocolliCommessa = {
    cantieri: CANTIERI, sgSigla: "SG", attivo: true, visibile: true, puoScrivere: true,
    quante: () => 12, prossimo: () => 13, speseQuante: 0, speseProssimo: 1,
    etichetta: f => f.protocollo_spese_generali
      ? (f.protocollo_commessa_numero ? `SG${f.protocollo_commessa_numero}` : null)
      : etichettaProtocolloCantiere(CANTIERI.find(c => c.id === f.protocollo_commessa_id), f.protocollo_commessa_numero),
    nomeCantiere: f => {
      if (f && typeof f === "object" && f.protocollo_spese_generali) return "SG · Spese generali";
      const id = typeof f === "string" ? f : f?.protocollo_commessa_id;
      return CANTIERI.find(c => c.id === id)?.codice ?? null;
    },
    ricarica: vi.fn(async () => {}),
  };
  return { ...base, ...over };
}
const cella = (p: ProtocolliCommessa, f = fattura) =>
  render(<QueryClientProvider client={new QueryClient()}><CellaProtocolloCommessa fattura={f} protocolli={p} /></QueryClientProvider>);

describe("protocollo di cantiere delle fatture ricevute", () => {
  beforeEach(() => rpc.mockReset());

  it("il numero si legge sigla+numero, e senza sigla col codice della commessa", () => {
    expect(etichettaProtocolloCantiere({ sigla: "Che", codice: "O-0001" }, 12)).toBe("Che12");
    expect(etichettaProtocolloCantiere({ sigla: null, codice: "O-0003" }, 4)).toBe("O-00034");
    expect(etichettaProtocolloCantiere({ sigla: "Che", codice: "O-0001" }, null)).toBeNull();
  });

  it("senza protocollo assegna il prossimo del cantiere collegato alla fattura", async () => {
    rpc.mockResolvedValue({ data: { sigla: "Che", numero: 13 }, error: null });
    cella(finto());
    fireEvent.click(screen.getByRole("button", { name: "Assegna" }));
    // Nessun cantiere scelto a mano: lo decide il server dal collegamento della fattura.
    fireEvent.click(screen.getByRole("button", { name: "Assegna il prossimo" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("fattura_ricevuta_protocolla_commessa",
      { p_fattura: "f1", p_commessa: null, p_numero: null }));
  });

  it("si può scegliere il cantiere e il numero", async () => {
    rpc.mockResolvedValue({ data: { sigla: "Cal", numero: 20 }, error: null });
    cella(finto());
    fireEvent.click(screen.getByRole("button", { name: "Assegna" }));
    // UniformSelect mette l'id sul suo pulsante: il <select> vero è quello che porta gli eventi.
    const scelta = document.querySelector("select") as HTMLSelectElement;
    fireEvent.change(scelta, { target: { value: "o2" } });
    expect(screen.getByPlaceholderText("13 (il prossimo)")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Numero"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "Assegna 20" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("fattura_ricevuta_protocolla_commessa",
      { p_fattura: "f1", p_commessa: "o2", p_numero: 20 }));
  });

  it("col protocollo mostra «Che12» e lo sa togliere", async () => {
    rpc.mockResolvedValue({ data: {}, error: null });
    cella(finto(), { ...fattura, protocollo_commessa_id: "o1", protocollo_commessa_numero: 12 });
    fireEvent.click(screen.getByRole("button", { name: "Che12" }));
    fireEvent.click(screen.getByRole("button", { name: "Togli il protocollo" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("fattura_ricevuta_sprotocolla_commessa", { p_fattura: "f1" }));
  });

  it("chi non scrive la contabilità non vede «Assegna», e una rifiutata non si protocolla", () => {
    cella(finto({ puoScrivere: false }));
    expect(screen.queryByRole("button", { name: "Assegna" })).toBeNull();
    cella(finto(), { ...fattura, id: "f2", stato: "rifiutata" });
    expect(screen.queryByRole("button", { name: "Assegna" })).toBeNull();
  });

  it("la sigla si salva sulla commessa e la numerazione parte cantiere per cantiere", async () => {
    rpc.mockResolvedValue({ data: { cantieri: [{ codice: "O-0001", sigla: "Che", quante: 12, primo: 1, ultimo: 12 }], senza_cantiere: 9 }, error: null });
    render(<QueryClientProvider client={new QueryClient()}><NumeraProtocolliCommesse companyId="az1" protocolli={finto()} /></QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Protocolli di cantiere" }));
    const sigla = screen.getByLabelText("Sigla", { selector: "#sigla-o2" }) as HTMLInputElement;
    expect(sigla.value).toBe("Cal");
    fireEvent.change(sigla, { target: { value: "Call" } });
    fireEvent.blur(sigla);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("commessa_sigla_protocollo", { p_commessa: "o2", p_sigla: "Call" }));
    fireEvent.click(screen.getByRole("button", { name: "Numera i cantieri" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("fatture_ricevute_protocolla_cantieri", { p_company: "az1" }));
  });

  it("si può mettere una fattura nelle spese generali", async () => {
    rpc.mockResolvedValue({ data: { spese_generali: true, sigla: "SG", numero: 7 }, error: null });
    cella(finto());
    fireEvent.click(screen.getByRole("button", { name: "Assegna" }));
    const scelta = document.querySelector("select") as HTMLSelectElement;
    fireEvent.change(scelta, { target: { value: "__spese_generali__" } });
    // Il prossimo numero delle spese generali, non del cantiere.
    expect(screen.getByPlaceholderText("1 (il prossimo)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Assegna il prossimo" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("fattura_ricevuta_protocolla_spese_generali",
      { p_fattura: "f1", p_numero: null }));
  });

  it("col protocollo spese generali mostra «SG7»", () => {
    cella(finto(), { ...fattura, protocollo_spese_generali: true, protocollo_commessa_numero: 7 });
    expect(screen.getByRole("button", { name: "SG7" })).toBeTruthy();
  });

  it("la sigla e la numerazione delle spese generali partono dal loro pulsante", async () => {
    rpc.mockResolvedValue({ data: { sigla: "SG", quante: 9, primo: 1, ultimo: 9 }, error: null });
    render(<QueryClientProvider client={new QueryClient()}><NumeraProtocolliCommesse companyId="az1" protocolli={finto()} /></QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Protocolli di cantiere" }));
    const sigla = screen.getByLabelText("Sigla", { selector: "#sigla-spese-generali" }) as HTMLInputElement;
    expect(sigla.value).toBe("SG");
    fireEvent.change(sigla, { target: { value: "SPG" } });
    fireEvent.blur(sigla);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("company_sigla_spese_generali", { p_company: "az1", p_sigla: "SPG" }));
    fireEvent.click(screen.getByRole("button", { name: "Numera le spese generali" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("fatture_ricevute_protocolla_spese_generali_blocco", { p_company: "az1", p_primo: null }));
  });

  it("dove i cantieri non ci sono, il pulsante non compare", () => {
    render(<QueryClientProvider client={new QueryClient()}><NumeraProtocolliCommesse companyId="az1" protocolli={finto({ cantieri: [], attivo: false })} /></QueryClientProvider>);
    expect(screen.queryByRole("button", { name: /Protocolli/ })).toBeNull();
  });

  it("la lista delle ricevute ha la colonna e il pulsante", () => {
    const pagina = readFileSync("src/pages/azienda/fatturazione/FattureRicevutePage.tsx", "utf8");
    expect(pagina).toContain('protocolliCantiere.visibile && colonne.has("protocollo_cantiere")');
    expect(pagina).toContain("<CellaProtocolloCommessa fattura={f}");
    expect(pagina).toContain("<NumeraProtocolliCommesse");
    // Le colonne del protocollo vanno chieste per nome: la lista non fa select("*").
    expect(pagina).toMatch(/protocollo_commessa_id, protocollo_commessa_numero, protocollo_spese_generali" as never/);
  });
});
