/**
 * Il salvataggio all'uscita col salvataggio VERO dei preventivi (06/10/2026): `useUpsertProgetto`
 * di Climatizzazione, un QueryClient vero e un database finto che registra cosa viene scritto.
 * Chiamato quando la pagina è già smontata, `mutateAsync` deve comunque arrivare al database e
 * aggiornare le liste (i callback stanno sulla mutazione, non sul componente).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { scritture } = vi.hoisted(() => ({ scritture: [] as Array<{ tabella: string; operazione: string; dati: unknown }> }));

vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "c1" }));
vi.mock("@/integrations/supabase/client", () => {
  const catena = (tabella: string): unknown => {
    let operazione = "select";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p: any = new Proxy({}, {
      get: (_t, nome) => {
        if (nome === "then") {
          return (ok: (v: unknown) => unknown) => {
            const ultimo = scritture[scritture.length - 1]?.dati as object | undefined;
            const data: unknown = operazione === "select" ? [] : { id: "p1", ...(ultimo ?? {}) };
            return Promise.resolve({ data, error: null as null }).then(ok);
          };
        }
        if (nome === "update" || nome === "insert") {
          return (dati: unknown) => { operazione = String(nome); scritture.push({ tabella, operazione, dati }); return p; };
        }
        return () => p;
      },
    });
    return p;
  };
  return { supabase: { from: (t: string) => catena(t), rpc: () => Promise.resolve({ data: null as null, error: null as null }) } };
});

import { useUpsertProgetto } from "@/hooks/useClimatizzazioneProgetto";
import { useSalvaUscendo } from "@/hooks/useSalvaUscendo";

beforeEach(() => { scritture.length = 0; });

describe("useSalvaUscendo con useUpsertProgetto vero", () => {
  it("dopo lo smontaggio la modifica arriva al database e le liste si aggiornano", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const invalida = vi.spyOn(qc, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { unmount } = renderHook(() => {
      const salvataggio = useUpsertProgetto();
      useSalvaUscendo({ id: "p1", dirty: true, form: { cliente_nome: "Luigi", sconto_pct: 5 }, salva: salvataggio.mutateAsync });
      return salvataggio;
    }, { wrapper });
    expect(scritture).toHaveLength(0);
    unmount();
    await vi.waitFor(() => expect(scritture.some((s) => s.tabella === "clm_progetti" && s.operazione === "update")).toBe(true));
    const aggiornamento = scritture.filter((s) => s.tabella === "clm_progetti" && s.operazione === "update").pop()?.dati as Record<string, unknown>;
    expect(aggiornamento).toMatchObject({ cliente_nome: "Luigi", sconto_pct: 5 });
    // Lo sconto è cambiato: i totali salvati si ricalcolano come nel salvataggio di sempre.
    expect(aggiornamento).toHaveProperty("totale");
    // Le liste dei preventivi si ricaricano anche se la pagina non c'è più.
    await vi.waitFor(() => expect(invalida).toHaveBeenCalled());
  });
});
