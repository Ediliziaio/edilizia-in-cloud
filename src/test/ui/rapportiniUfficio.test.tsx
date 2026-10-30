import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RapportiniUfficio } from "@/components/orders/RapportiniUfficio";

const stato = vi.hoisted(() => ({ rpc: vi.fn(async () => ({ data: 2, error: null })) }));
// Ditte e articoli della commessa: una ditta collegata a un subappaltatore, un articolo.
const db = vi.hoisted(() => {
  const righe = (t: string) => t === "order_external_teams"
    ? [{ team: { name: "Edil Savoca", subappaltatore_id: "sub9" } }]
    : [{ id: "i1", name: "Cemento", unita_misura: "q" }];
  const from = (t: string) => {
    const risposta = () => Promise.resolve({ data: righe(t), error: null });
    const q: Record<string, unknown> = {};
    Object.assign(q, { select: () => q, eq: () => q, order: () => q, limit: risposta, then: (ok: (v: unknown) => void) => risposta().then(ok) });
    return q;
  };
  return { from };
});
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: stato.rpc, from: db.from, storage: { from: () => ({}) } } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "c1" } }) }));
vi.mock("@/hooks/useMezzi", () => ({
  useMezzi: () => ({ data: [{ id: "m1", nome: "Betoniera", targa: null }, { id: "m2", nome: "Furgone", targa: "AB123CD" }] }),
  useMezziDellaCommessa: () => ({ data: [{ mezzo_id: "m1" }] }),
}));
vi.mock("@/hooks/useOrderWorkPhases", () => ({ useOrderWorkPhases: () => ({
  phases: [{ id: "f1", name: "Impianti", percentuale: 0, assignments: [{ employee_id: "e1" }] }],
  unassigned: [] as Array<{ employee_id: string }>,
  employees: [{ id: "e1", label: "Mario Rossi" }, { id: "e2", label: "Luca Bianchi" }],
}) }));
vi.mock("@/hooks/useSottofasi", () => ({ useSottofasi: () => ({ perFase: new Map([["f1", [{ id: "s1", name: "Tracce", peso: 1, fatta: false }, { id: "s2", name: "Cavi", peso: 1, fatta: false }]]]) }) }));
vi.mock("@/hooks/useAccessiCommessa", () => ({
  useAccessiCommessa: () => ({ data: [{ user_id: "u9", role_type: "employee", is_capocantiere: true, profile: { first_name: "Marco", last_name: "Operaio" } }] }),
  nomeAccesso: (a: { profile: { first_name: string; last_name: string } }) => `${a.profile.first_name} ${a.profile.last_name}`,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
afterEach(cleanup);

describe("Rapportini dall'ufficio", () => {
  it("due giorni con fasi e sottofasi, a nome del capocantiere: una sola chiamata", async () => {
    render(<QueryClientProvider client={new QueryClient()}><RapportiniUfficio orderId="o1" /></QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Scrivi rapportini" }));
    fireEvent.change(screen.getByLabelText("Giorno del rapportino 1"), { target: { value: "2026-10-27" } });
    fireEvent.change(screen.getByLabelText("A nome di, rapportino 1"), { target: { value: "u9" } });
    fireEvent.change(screen.getByLabelText("Cosa si è fatto, rapportino 1"), { target: { value: "Tracce al piano terra" } });
    fireEvent.click(screen.getByRole("button", { name: "Impianti" }));
    fireEvent.click(screen.getByRole("button", { name: "Tracce: finita" }));
    fireEvent.click(screen.getByRole("button", { name: "Cavi: lavorata" }));
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi un altro giorno" }));
    expect(screen.getByLabelText("Giorno del rapportino 2")).toHaveValue("2026-10-28");
    // Senza descrizione non parte e lo dice.
    fireEvent.click(screen.getByRole("button", { name: "Salva 2 rapportini" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Scrivi cosa si è fatto (giorno 2).");
    expect(stato.rpc).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Cosa si è fatto, rapportino 2"), { target: { value: "Cavi" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva 2 rapportini" }));
    await waitFor(() => expect(stato.rpc).toHaveBeenCalledTimes(1));
    const [nome, args] = stato.rpc.mock.calls[0] as unknown as [string, { p_order_id: string; p_rapportini: Array<Record<string, unknown>> }];
    expect(nome).toBe("ufficio_crea_rapportini");
    expect(args.p_rapportini).toHaveLength(2);
    expect(args.p_rapportini[0]).toMatchObject({ data_lavoro: "2026-10-27", autore: "u9", descrizione: "Tracce al piano terra",
      fasi_lavorate: [{ phase_id: "f1", percentuale: 50, sottofasi_fatte: ["s1"], sottofasi_lavorate: ["s2"] }] });
    expect(args.p_rapportini[1]).toMatchObject({ data_lavoro: "2026-10-28", autore: "u9", descrizione: "Cavi" });
  });

  it("come in cantiere: chi ha lavorato con le ore, mezzi usati, materiali, meteo", async () => {
    stato.rpc.mockClear();
    render(<QueryClientProvider client={new QueryClient()}><RapportiniUfficio orderId="o1" /></QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Scrivi rapportini" }));
    fireEvent.change(screen.getByLabelText("Cosa si è fatto, rapportino 1"), { target: { value: "Getto solaio" } });
    fireEvent.change(screen.getByLabelText("Meteo, rapportino 1"), { target: { value: "pioggia" } });
    // Chi è sulla commessa entra con 8 ore, poi si correggono.
    fireEvent.click(screen.getByRole("button", { name: /Tutti quelli della commessa/ }));
    fireEvent.change(screen.getByLabelText("Mario Rossi: ore"), { target: { value: "6,5" } });
    await waitFor(() => expect(screen.getByRole("option", { name: "Edil Savoca" })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Aggiungi persona"), { target: { value: "s:sub9" } });
    fireEvent.change(screen.getByLabelText("Aggiungi mezzo"), { target: { value: "m1" } });
    fireEvent.change(screen.getByLabelText("Betoniera: ore (facolt.)"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Aggiungi materiale"), { target: { value: "i1" } });
    fireEvent.change(screen.getByLabelText("Cemento: quantità"), { target: { value: "3" } });
    expect(screen.getByText("14,5 ore")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Salva il rapportino" }));
    await waitFor(() => expect(stato.rpc).toHaveBeenCalledTimes(1));
    const [, args] = stato.rpc.mock.calls[0] as unknown as [string, { p_rapportini: Array<Record<string, unknown>> }];
    expect(args.p_rapportini[0]).toMatchObject({
      meteo: "pioggia",
      presenze: [{ employee_id: "e1", nome: "Mario Rossi", ore: 6.5 }, { subappaltatore_id: "sub9", nome: "Edil Savoca", ore: 8 }],
      mezzi_usati: [{ mezzo_id: "m1", nome: "Betoniera", ore: 4 }],
      materiali_usati: [{ nome: "Cemento", quantita: 3, unita: "q", order_item_id: "i1" }],
    });
  });
});
