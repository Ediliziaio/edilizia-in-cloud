/**
 * Cartelle documenti: se il database rifiuta il salvataggio di una cartella, la pagina mostra una frase italiana
 * (la legge dal messaggio dell'errore del gancio): il nome già usato e il permesso mancante hanno la loro frase, tutto
 * il resto passa dal traduttore di errori e non arriva mai col testo del database («violates check constraint…»).
 */
import type { ReactNode } from "react";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ errore: null as unknown }));

vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "azienda-1" }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {
        update: () => b,
        insert: () => b,
        eq: () => b,
        select: () => b,
        single: () => b,
        then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve({ data: null as unknown, error: state.errore }).then(ok, ko),
      };
      return b;
    },
  },
}));

import { useSalvaCartella } from "@/hooks/useCartelleDocumenti";

const involucro = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

/** Prova a salvare una cartella nuova e restituisce il messaggio con cui la mutazione fallisce. */
async function salvaEMessaggio(errore: unknown): Promise<string> {
  state.errore = errore;
  const { result } = renderHook(() => useSalvaCartella(), { wrapper: involucro });
  act(() => { result.current.mutate({ nome: "Contratti" }); });
  await waitFor(() => expect(result.current.isError).toBe(true));
  return (result.current.error as Error).message;
}

beforeEach(() => { state.errore = null; });

describe("Cartelle documenti: errori del salvataggio", () => {
  it("un nome già usato lo dice con il nome", async () => {
    expect(await salvaEMessaggio({ code: "23505", message: "duplicate key value violates unique constraint" })).toBe("Esiste già una cartella «Contratti»");
  });

  it("un permesso mancante lo dice", async () => {
    expect(await salvaEMessaggio({ code: "42501", message: "new row violates row-level security policy" })).toBe("Non hai il permesso di modificare le cartelle");
  });

  it("un altro rifiuto del database arriva in italiano, senza il testo tecnico", async () => {
    const messaggio = await salvaEMessaggio({ code: "23514", message: 'new row for relation "order_document_folders" violates check constraint "nome_non_vuoto"' });
    expect(messaggio).toBe("Alcuni dati non sono validi. Controlla i valori inseriti.");
    expect(messaggio).not.toMatch(/violates|relation|constraint/);
  });

  it("un errore sconosciuto dice di riprovare", async () => {
    expect(await salvaEMessaggio({ code: "XX000", message: "connection reset by peer" })).toBe("Operazione non riuscita. Riprova tra poco.");
  });

  it("la rete persa lo dice a parole", async () => {
    expect(await salvaEMessaggio({ message: "Failed to fetch" })).toBe("Connessione persa. Controlla la rete e riprova.");
  });
});
