/**
 * Serramenti: il salvataggio del preventivo che non riesce, dalla mutation vera (07/10/2026).
 *
 * `useUpdateProgetto` scriveva nel toast `String(e)`: «TypeError: Failed to fetch». Ora il motivo è in italiano e l'avviso ha un
 * id fisso, lo stesso che usa la freccia «Esci» per sostituirlo con la versione che offre «Esci comunque»: un avviso solo.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

const finto = vi.hoisted(() => ({ aggiorna: vi.fn() }));

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), dismiss: vi.fn() }) }));
vi.mock("@/lib/serramenti/api", () => ({ updateProgetto: finto.aggiorna }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "c1" }));
vi.mock("@/lib/api/surveys", () => ({ markSurveyConverted: vi.fn() }));

import { useUpdateProgetto } from "@/lib/serramenti/queries";
import { ID_AVVISO_SALVATAGGIO_FALLITO } from "@/lib/preventivatore/salvataggioFallito";

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>{children}</QueryClientProvider>
);

beforeEach(() => { finto.aggiorna.mockReset(); vi.mocked(toast.error).mockClear(); });

describe("useUpdateProgetto: l'avviso quando il salvataggio non riesce", () => {
  it.each([
    ["senza rete", new TypeError("Failed to fetch"), "Connessione persa. Controlla la rete e riprova."],
    ["permesso tolto", new Error('new row violates row-level security policy for table "sr_progetti"'), "Non hai i permessi per questa operazione. Contatta l'amministratore."],
    ["sessione scaduta", new Error("JWT expired"), "Sessione scaduta. Accedi di nuovo per continuare."],
  ])("%s: «Salvataggio fallito» col motivo in italiano e l'id fisso", async (_nome, errore, frase) => {
    finto.aggiorna.mockRejectedValue(errore);
    const { result } = renderHook(() => useUpdateProgetto("p1"), { wrapper });
    await expect(result.current.mutateAsync({ cliente_nome: "Anna" })).rejects.toBe(errore);
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith("Salvataggio fallito", { id: ID_AVVISO_SALVATAGGIO_FALLITO, description: frase });
  });

  it("il testo tecnico non arriva a chi lavora", async () => {
    finto.aggiorna.mockRejectedValue(new TypeError("Cannot read properties of undefined (reading 'id')"));
    const { result } = renderHook(() => useUpdateProgetto("p1"), { wrapper });
    await expect(result.current.mutateAsync({ cliente_nome: "Anna" })).rejects.toThrow();
    const descrizione = (vi.mocked(toast.error).mock.calls[0][1] as { description: string }).description;
    expect(descrizione).toBe("Il salvataggio non è andato a buon fine.");
  });
});
