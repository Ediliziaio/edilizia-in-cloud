/**
 * Fase 5 del wizard Fotovoltaico: «Avanti» riscrive le righe del preventivo (componenti, manodopera,
 * servizi) cancellando le vecchie e inserendo le nuove. Se la cancellazione non riesce (permessi,
 * rete) e l'inserimento va avanti lo stesso, le righe vecchie restano e quelle nuove si aggiungono:
 * il prezzo del preventivo, che è la somma delle righe, sale, e la schermata dice «salvato».
 */
import type { ReactNode } from "react";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { banca } = vi.hoisted(() => ({
  banca: {
    chiamate: [] as string[],
    /** tabella:operazione → errore che la banca restituisce */
    guasti: {} as Record<string, { message: string; code: string } | undefined>,
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabella: string) => ({
      delete: () => ({
        eq: (colonna: string, valore: string) => {
          banca.chiamate.push(`${tabella}:delete:${colonna}=${valore}`);
          return Promise.resolve({ data: null, error: banca.guasti[`${tabella}:delete`] ?? null });
        },
      }),
      insert: (righe: unknown[]) => {
        banca.chiamate.push(`${tabella}:insert:${righe.length}`);
        return Promise.resolve({ data: null, error: banca.guasti[`${tabella}:insert`] ?? null });
      },
    }),
  },
}));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "c1" }));

import { useUpsertComponenti, useUpsertManodopera, useUpsertServizi } from "@/lib/fotovoltaico/queries";

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>{children}</QueryClientProvider>
);

const CASI = [
  { nome: "componenti", tabella: "fv_componenti_progetto", useHook: () => useUpsertComponenti(), riga: { categoria: "pannello", descrizione: "Pannello", quantita: 12 } },
  { nome: "manodopera", tabella: "fv_manodopera_progetto", useHook: () => useUpsertManodopera(), riga: { descrizione: "Posa", ore: 8 } },
  { nome: "servizi", tabella: "fv_servizi_progetto", useHook: () => useUpsertServizi(), riga: { descrizione: "Pratica", quantita: 1 } },
] as const;

beforeEach(() => {
  banca.chiamate = [];
  banca.guasti = {};
});

describe.each(CASI)("riscrittura delle righe ($nome)", ({ tabella, useHook, riga }) => {
  const input = (extra: { replace?: boolean; righe?: unknown[] } = {}) => ({ progetto_id: "p1", righe: [riga], replace: true, ...extra }) as never;

  it("cancella le vecchie righe e poi inserisce le nuove", async () => {
    const { result } = renderHook(() => useHook(), { wrapper });
    await result.current.mutateAsync(input());
    expect(banca.chiamate).toEqual([`${tabella}:delete:progetto_id=p1`, `${tabella}:insert:1`]);
  });

  it("se la cancellazione delle vecchie righe non riesce, si ferma con quell'errore e non inserisce le nuove (altrimenti si sommerebbero alle vecchie)", async () => {
    banca.guasti[`${tabella}:delete`] = { message: "permission denied for table", code: "42501" };
    const { result } = renderHook(() => useHook(), { wrapper });
    await expect(result.current.mutateAsync(input())).rejects.toMatchObject({ code: "42501" });
    expect(banca.chiamate).toEqual([`${tabella}:delete:progetto_id=p1`]);
  });

  it("senza «replace» non cancella niente, e con un elenco vuoto cancella soltanto", async () => {
    const { result } = renderHook(() => useHook(), { wrapper });
    await result.current.mutateAsync(input({ replace: false }));
    expect(banca.chiamate).toEqual([`${tabella}:insert:1`]);
    banca.chiamate = [];
    await result.current.mutateAsync(input({ righe: [] }));
    expect(banca.chiamate).toEqual([`${tabella}:delete:progetto_id=p1`]);
  });

  it("se l'inserimento fallisce l'errore arriva a chi ha chiamato (come prima)", async () => {
    banca.guasti[`${tabella}:insert`] = { message: "violates check constraint", code: "23514" };
    const { result } = renderHook(() => useHook(), { wrapper });
    await expect(result.current.mutateAsync(input())).rejects.toMatchObject({ code: "23514" });
  });
});
