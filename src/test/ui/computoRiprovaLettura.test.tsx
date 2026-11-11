/**
 * «Riprova la lettura» di un computo fallito (11/11/2026): rilancia computo-ai-extract
 * sullo stesso caricamento, senza un nuovo upload. Serve quando il blocco (carta,
 * abbonamento, crediti) è stato tolto.
 */
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const finto = vi.hoisted(() => ({
  invoke: vi.fn(),
  salvato: { extraction_status: "failed", extraction_error: "Extraction error: Abbonamento sospeso o scaduto" } as Record<string, unknown>,
}));

vi.mock("@/integrations/supabase/client", () => {
  const catena: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "range", "in", "is"]) catena[m] = () => catena;
  catena.single = async () => ({ data: finto.salvato, error: null as null });
  return { supabase: { functions: { invoke: finto.invoke }, from: () => catena } };
});

import { useRiprovaLetturaComputo } from "@/hooks/useComputoCommessa";

const involucro = () => {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

describe("useRiprovaLetturaComputo", () => {
  beforeEach(() => finto.invoke.mockReset());

  it("richiama computo-ai-extract sullo stesso computoUploadId", async () => {
    finto.invoke.mockResolvedValue({ data: { success: true }, error: null as null });
    const { result } = renderHook(() => useRiprovaLetturaComputo("ordine", "azienda"), { wrapper: involucro() });
    await act(async () => { await result.current.mutateAsync("computo-1"); });
    expect(finto.invoke).toHaveBeenCalledExactlyOnceWith("computo-ai-extract", { body: { computoUploadId: "computo-1" } });
  });

  it("se è ancora bloccato, l'errore è il motivo salvato sul computo", async () => {
    finto.invoke.mockResolvedValue({ data: null, error: new Error("Edge Function returned a non-2xx status code") });
    const { result } = renderHook(() => useRiprovaLetturaComputo("ordine", "azienda"), { wrapper: involucro() });
    act(() => { result.current.mutate("computo-1"); });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toContain("Abbonamento sospeso o scaduto");
  });
});

describe("il pulsante c'è dove si vede un computo fallito", () => {
  it.each([
    "src/components/computo/commessa/OrderComputoTab.tsx",
    "src/components/orders/materiali/GeneraMaterialiDialog.tsx",
  ])("%s", (file) => {
    const s = readFileSync(file, "utf8");
    expect(s).toContain("useRiprovaLetturaComputo(orderId, companyId)");
    expect(s).toContain("Riprova la lettura");
  });
  it("modale di caricamento: «Riprova la lettura» sullo stesso caricamento", () => {
    expect(readFileSync("src/components/computo/ComputoUploadModal.tsx", "utf8")).toContain("onRetryRead={computoId ? () => { void riprovaLettura(); } : undefined}");
    expect(readFileSync("src/hooks/useComputoExtract.ts", "utf8")).toMatch(/invoke\("computo-ai-extract", \{ body: \{ computoUploadId: computoId \} \}\)/);
  });
});
