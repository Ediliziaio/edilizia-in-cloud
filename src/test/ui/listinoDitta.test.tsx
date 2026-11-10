/**
 * Scheda subappaltatore → «Listino» (10/11/2026, lotto 2 del subappalto dal computo).
 * Le voci dell'azienda col prezzo della ditta; le voci proprie delle ALTRE ditte non si vedono;
 * un prezzo chiuso sta nella storia, non nella casella; si salva con listino_ditta_salva e solo
 * i prezzi cambiati; senza permesso sul listino si consulta e basta.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ListinoDitta } from "@/components/subappaltatori/ListinoDitta";

const finto = vi.hoisted(() => {
  const voci: Array<Record<string, unknown>> = [
    { id: "intonaco", nome: "Intonaco civile", codice: "INT", tipo: "manodopera", unita: "mq", unita_fatturazione: "mq", prezzo_costo: 15, costo_interno: 15, costo_default: 15, attivo: true, external_team_id: null, subappaltatore_id: null },
    { id: "rasatura", nome: "Rasatura", codice: null, tipo: "manodopera", unita: "mq", unita_fatturazione: "mq", prezzo_costo: 8, costo_interno: 8, costo_default: 8, attivo: true, external_team_id: null, subappaltatore_id: null },
    { id: "punto-luce", nome: "Punto luce", codice: null, tipo: "manodopera", unita: "pz", unita_fatturazione: "pz", prezzo_costo: 38, costo_interno: 38, costo_default: 38, attivo: true, external_team_id: null, subappaltatore_id: "rossi" },
    { id: "voce-bianchi", nome: "Voce di Bianchi", codice: null, tipo: "manodopera", unita: "pz", unita_fatturazione: "pz", prezzo_costo: 1, costo_interno: 1, costo_default: 1, attivo: true, external_team_id: null, subappaltatore_id: "bianchi" },
  ];
  const prezzi: Array<Record<string, unknown>> = [
    { id: "p1", tariffa_id: "intonaco", nome: "Rossi srl", costo: 14, is_default: false, attivo: true, sort_order: 0, valid_from: "2026-10-01", valid_to: null, created_at: "2026-10-01" },
    { id: "p0", tariffa_id: "intonaco", nome: "Rossi srl", costo: 13, is_default: false, attivo: true, sort_order: 0, valid_from: "2026-01-01", valid_to: "2026-09-30", created_at: "2026-01-01" },
    { id: "p2", tariffa_id: "punto-luce", nome: "Rossi srl", costo: 38, is_default: false, attivo: true, sort_order: 0, valid_from: "2026-10-01", valid_to: null, created_at: "2026-10-01" },
  ];
  const catena = (tabella: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = {};
    for (const m of ["select", "eq", "order", "range", "limit"]) c[m] = () => c;
    const righe = tabella === "tariffe_aziendali" ? voci : tabella === "tariffa_costi_varianti" ? prezzi : [];
    c.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve({ data: righe, error: null as null }).then(ok, ko);
    return c;
  };
  const rpc = vi.fn(async () => ({ data: { nuovi: 1, corretti: 0, chiusi: 0, uguali: 0 }, error: null as null }));
  return { catena, rpc, permessi: {} as Record<string, boolean> };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (t: string) => finto.catena(t), rpc: finto.rpc } }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => finto.permessi }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

afterEach(() => { cleanup(); finto.rpc.mockClear(); });

function apri(permessi: Record<string, boolean>) {
  finto.permessi = permessi;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><ListinoDitta companyId="az" anagraficaId="rossi" nomeDitta="Rossi srl" /></QueryClientProvider>);
}

describe("Listino della ditta", () => {
  it("mostra le voci dell'azienda e le sue, col suo prezzo di oggi; mai le voci delle altre ditte", async () => {
    apri({ canViewCosts: true, canEditSettingsPricing: true });
    expect(await screen.findByText("Intonaco civile")).toBeInTheDocument();
    expect(screen.getByText("Punto luce")).toBeInTheDocument();
    expect(screen.queryByText("Voce di Bianchi")).not.toBeInTheDocument();
    // Il prezzo valido oggi (14), non quello chiuso al 30/09 (13).
    expect(screen.getByLabelText("Prezzo di Rossi srl per Intonaco civile")).toHaveValue("14,00");
    expect(screen.getByLabelText("Prezzo di Rossi srl per Rasatura")).toHaveValue("");
    expect(screen.getByText("-6,7% sul nostro")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Prezzi passati \(1\)/ }));
    expect(screen.getByText(/dal 01\/01\/2026 al 30\/09\/2026/)).toBeInTheDocument();
  });

  it("salva solo i prezzi cambiati, dalla data scelta", async () => {
    apri({ canViewCosts: true, canEditSettingsPricing: true });
    const rasatura = await screen.findByLabelText("Prezzo di Rossi srl per Rasatura");
    fireEvent.change(rasatura, { target: { value: "7,50" } });
    // Riscrivere lo stesso prezzo non conta come modifica.
    fireEvent.change(screen.getByLabelText("Prezzo di Rossi srl per Intonaco civile"), { target: { value: "14,00" } });
    expect(screen.getByText("1 prezzo cambiato")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Valgono dal"), { target: { value: "2026-12-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva il listino" }));
    await waitFor(() => expect(finto.rpc).toHaveBeenCalledWith("listino_ditta_salva", {
      p_subappaltatore: "rossi", p_valido_dal: "2026-12-01", p_righe: [{ tariffa_id: "rasatura", costo: 7.5 }],
    }));
  });

  it("un numero che non si legge non si salva", async () => {
    apri({ canViewCosts: true, canEditSettingsPricing: true });
    fireEvent.change(await screen.findByLabelText("Prezzo di Rossi srl per Rasatura"), { target: { value: "7,5,3" } });
    expect(screen.getByText("Numero non valido")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salva il listino" })).toBeDisabled();
  });

  it("senza permesso sul listino si consulta, senza modificare", async () => {
    apri({ canViewCosts: true });
    expect(await screen.findByLabelText("Prezzo di Rossi srl per Intonaco civile")).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Voce sua/ })).not.toBeInTheDocument();
  });

  it("senza permesso sui costi non si vede nessun prezzo", () => {
    apri({ canEditSettingsPricing: true });
    expect(screen.getByText(/si vede con il permesso sui costi/)).toBeInTheDocument();
    expect(screen.queryByText("Intonaco civile")).not.toBeInTheDocument();
  });
});
