/**
 * Serramenti: il salvataggio automatico non rilegge l'intero preventivo (24/11/2026).
 *
 * Ogni salvataggio dei campi del preventivo faceva rileggere preventivo, posizioni, accessori, servizi, foto e
 * risparmio: 31 riletture complete in sei minuti di lavoro su un solo preventivo (registri del 23/11/2026).
 * Ora il salvataggio restituisce la riga salvata e la si mette nei dati aperti; si rilegge solo quando serve.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const finto = vi.hoisted(() => ({ aggiorna: vi.fn(), aggiornaRiga: vi.fn(), leggi: vi.fn() }));

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), dismiss: vi.fn() }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "c1" }));
vi.mock("@/lib/api/surveys", () => ({ markSurveyConverted: vi.fn() }));

import { SR_QK, useProgetto, useUpdateProgetto } from "@/lib/serramenti/queries";

interface PreventivoAperto {
  progetto: { id: string; cliente_nome: string; updated_at: string };
  serramenti: Array<{ id: string; quantita?: number; updated_at?: string }>;
  accessori: unknown[];
  media: unknown[];
  risparmio: null;
  servizi: unknown[];
}

const aperto = (): PreventivoAperto => ({
  progetto: { id: "p1", cliente_nome: "Anna", updated_at: "2026-11-23T11:30:00Z" },
  serramenti: [{ id: "s1" }],
  accessori: [],
  media: [],
  risparmio: null,
  servizi: [],
});

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
/** Il preventivo è aperto nel wizard: la sua lettura è attiva e i dati sono in memoria. */
const apriPreventivo = () => {
  client.setQueryData(SR_QK.progetto("p1"), aperto());
  return renderHook(() => ({ progetto: useProgetto("p1"), salva: useUpdateProgetto("p1") }), { wrapper });
};
const inMemoria = () => client.getQueryData<PreventivoAperto>(SR_QK.progetto("p1"))!;

beforeEach(() => {
  finto.aggiorna.mockReset();
  finto.aggiornaRiga.mockReset();
  finto.leggi.mockReset().mockImplementation(async () => aperto());
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 }, mutations: { retry: false } } });
});

describe("useUpdateProgetto: dopo il salvataggio", () => {
  it("la riga tornata dal database entra nei dati aperti, senza rileggere il preventivo", async () => {
    finto.aggiorna.mockResolvedValue({ id: "p1", cliente_nome: "Anna Maria", updated_at: "2026-11-23T11:30:02Z" });
    const { result } = apriPreventivo();
    await result.current.salva.mutateAsync({ cliente_nome: "Anna Maria" } as never);
    expect(inMemoria().progetto).toEqual({ id: "p1", cliente_nome: "Anna Maria", updated_at: "2026-11-23T11:30:02Z" });
    expect(inMemoria().serramenti).toEqual([{ id: "s1" }]);
    expect(finto.leggi).not.toHaveBeenCalled();
  });

  it("se la riga non torna indietro si rilegge, come prima", async () => {
    finto.aggiorna.mockResolvedValue(null);
    const { result } = apriPreventivo();
    await result.current.salva.mutateAsync({ cliente_nome: "Anna Maria" } as never);
    await vi.waitFor(() => expect(finto.leggi).toHaveBeenCalledTimes(1));
  });

  it("se il salvataggio fallisce si rilegge: a schermo non restano dati mai scritti", async () => {
    finto.aggiorna.mockRejectedValue(new TypeError("Failed to fetch"));
    const { result } = apriPreventivo();
    await expect(result.current.salva.mutateAsync({ cliente_nome: "Anna Maria" } as never)).rejects.toThrow();
    await vi.waitFor(() => expect(finto.leggi).toHaveBeenCalledTimes(1));
  });

  it("una risposta arrivata in ritardo, più vecchia dei dati aperti, non li riporta indietro", async () => {
    finto.aggiorna.mockResolvedValue({ id: "p1", cliente_nome: "Vecchio", updated_at: "2026-11-23T11:29:00Z" });
    const { result } = apriPreventivo();
    await result.current.salva.mutateAsync({ cliente_nome: "Vecchio" } as never);
    expect(inMemoria().progetto.cliente_nome).toBe("Anna");
    expect(finto.leggi).not.toHaveBeenCalled();
  });
});

// ── Posizioni e complementi ────────────────────────────────────────────────
vi.mock("@/lib/serramenti/api", () => ({
  updateProgetto: finto.aggiorna, getProgetto: finto.leggi,
  updateSerramento: finto.aggiornaRiga, updateAccessorio: finto.aggiornaRiga,
}));
import { useUpdateSerramento } from "@/lib/serramenti/queries";

describe("useUpdateSerramento: dopo il salvataggio di una posizione", () => {
  const apri = () => {
    client.setQueryData(SR_QK.progetto("p1"), aperto());
    return renderHook(() => ({ progetto: useProgetto("p1"), salva: useUpdateSerramento("p1") }), { wrapper });
  };

  it("la posizione tornata dal database sostituisce la sua riga, senza rileggere il preventivo", async () => {
    finto.aggiornaRiga.mockResolvedValue({ id: "s1", quantita: 3, updated_at: "2026-11-23T11:31:00Z" });
    const { result } = apri();
    await result.current.salva.mutateAsync({ id: "s1", patch: { quantita: 3 } as never });
    expect(inMemoria().serramenti).toEqual([{ id: "s1", quantita: 3, updated_at: "2026-11-23T11:31:00Z" }]);
    expect(finto.leggi).not.toHaveBeenCalled();
  });

  it("se il salvataggio fallisce si rilegge: la modifica mai scritta sparisce dallo schermo", async () => {
    finto.aggiornaRiga.mockRejectedValue(new Error("Modifica serramento fallita"));
    const { result } = apri();
    await expect(result.current.salva.mutateAsync({ id: "s1", patch: { quantita: 3 } as never })).rejects.toThrow();
    await vi.waitFor(() => expect(finto.leggi).toHaveBeenCalledTimes(1));
  });

  it("un salvataggio fallito mentre un altro è in corso: rilegge l'ultimo che finisce", async () => {
    let sblocca: (riga: unknown) => void = () => {};
    finto.aggiornaRiga
      .mockImplementationOnce(() => new Promise((ok) => { sblocca = ok; }))
      .mockRejectedValueOnce(new Error("Modifica serramento fallita"));
    const { result } = apri();
    const lento = result.current.salva.mutateAsync({ id: "s1", patch: { quantita: 3 } as never });
    await expect(result.current.salva.mutateAsync({ id: "s1", patch: { quantita: 4 } as never })).rejects.toThrow();
    expect(finto.leggi).not.toHaveBeenCalled();
    sblocca({ id: "s1", quantita: 3, updated_at: "2026-11-23T11:31:00Z" });
    await lento;
    await vi.waitFor(() => expect(finto.leggi).toHaveBeenCalledTimes(1));
  });
});
