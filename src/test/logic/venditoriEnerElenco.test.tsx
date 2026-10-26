/**
 * Il menu «Venditore» di Ener Italia (26/10/2026): con le nove persone che la funzione del database restituisce
 * (tre amministratori, sei con il ruolo venditore) il menu le deve elencare tutte; un elenco vuoto non resta in memoria.
 */
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc, from: vi.fn() } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "00000000-0000-4000-a000-000000000001" } }) }));

import { useCompanySalespeople, useCompanyStaff } from "@/hooks/useOpportunitiesData";

const persona = (first_name: string, last_name: string, roles: string[]) => ({ id: `${first_name}-${last_name}`, first_name, last_name, email: null as string | null, avatar_url: null as string | null, roles });
const ENER = [
  persona("Brando", "Conte", ["call_center", "company_staff", "salesperson"]),
  persona("Stefano", "Da Dalt", ["company_staff", "salesperson"]),
  persona("Alice", "Ener", ["company_admin", "employee"]),
  persona("Elena", "Ener", ["call_center", "company_admin"]),
  persona("Riccardo", "Lai", ["company_staff", "salesperson"]),
  persona("Stefano", "Mezzalira", ["company_admin", "salesperson"]),
  persona("Gabriele", "Parpagiola", ["company_staff", "employee", "salesperson"]),
  persona("Mauro", "Targhetta", ["company_staff", "salesperson"]),
  persona("Giancarlo", "Turchetto", ["company_admin"]),
];

const cliente = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const involucro = (qc: QueryClient) => ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;

describe("elenco dei venditori di Ener", () => {
  it("il menu «Venditore» ha le nove persone: i sei venditori e i tre amministratori", async () => {
    rpc.mockResolvedValue({ data: ENER, error: null });
    const { result } = renderHook(() => useCompanySalespeople("629d91e0-9d56-4736-a030-1e3833cba2ea"), { wrapper: involucro(cliente()) });
    await waitFor(() => expect(result.current.data.length).toBeGreaterThan(0));
    expect(result.current.data.map((p) => p.name).sort()).toEqual(
      ["Alice Ener", "Brando Conte", "Elena Ener", "Gabriele Parpagiola", "Giancarlo Turchetto", "Mauro Targhetta", "Riccardo Lai", "Stefano Da Dalt", "Stefano Mezzalira"],
    );
  });

  it("anche «Follower» (tutto lo staff) ha le nove persone", async () => {
    rpc.mockResolvedValue({ data: ENER, error: null });
    const { result } = renderHook(() => useCompanyStaff("629d91e0-9d56-4736-a030-1e3833cba2ea"), { wrapper: involucro(cliente()) });
    await waitFor(() => expect(result.current.data.length).toBe(9));
  });

  it("la scheda di un'opportunità di Ener aperta da un'altra azienda mostra i venditori di Ener, non quelli dell'azienda in uso", async () => {
    rpc.mockReset();
    rpc.mockResolvedValue({ data: ENER, error: null });
    const { result } = renderHook(() => useCompanySalespeople("629d91e0-9d56-4736-a030-1e3833cba2ea"), { wrapper: involucro(cliente()) });
    await waitFor(() => expect(result.current.data.length).toBe(9));
    expect(rpc).toHaveBeenCalledWith("get_internal_chat_profiles", { p_company_id: "629d91e0-9d56-4736-a030-1e3833cba2ea" });
  });

  it("senza l'azienda dell'opportunità vale l'azienda in uso, come prima", async () => {
    rpc.mockReset();
    rpc.mockResolvedValue({ data: ENER, error: null });
    renderHook(() => useCompanySalespeople(), { wrapper: involucro(cliente()) });
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(rpc).toHaveBeenCalledWith("get_internal_chat_profiles", { p_company_id: "00000000-0000-4000-a000-000000000001" });
  });

  it("un elenco vuoto (lettura partita prima che la sessione fosse pronta) non resta: alla lettura dopo arrivano i nomi", async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    const qc = cliente();
    const prima = renderHook(() => useCompanySalespeople("629d91e0-9d56-4736-a030-1e3833cba2ea"), { wrapper: involucro(qc) });
    await waitFor(() => expect(prima.result.current.isSuccess).toBe(true));
    expect(prima.result.current.data).toEqual([]);
    prima.unmount();
    rpc.mockResolvedValue({ data: ENER, error: null });
    const dopo = renderHook(() => useCompanySalespeople("629d91e0-9d56-4736-a030-1e3833cba2ea"), { wrapper: involucro(qc) });
    await waitFor(() => expect(dopo.result.current.data.length).toBe(9));
  });
});
