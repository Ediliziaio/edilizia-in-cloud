import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
const s = vi.hoisted(() => ({ rpc: vi.fn(), readonly: false, allowed: true }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: s.rpc } }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    solaLettura: s.readonly,
    canViewSicurezzaCantiere: s.allowed,
  }),
}));
import {
  leggiSdsAziendali,
  useCollegaRevisioneSds,
} from "@/hooks/useSdsAziendali";
const fonte = () => ({
  id: "d",
  company_id: "az",
  tipo: "sds",
  order_id: null as null,
  subappaltatore_id: null as null,
  operaio_id: null as null,
  incarico_id: null as null,
  fase_id: null as null,
  impronta: "hash",
  successive: [] as never[],
  impieghi: [] as never[],
});
const input = {
  documentoId: "nuova",
  precedenteId: "prima",
  improntaDocumento: "h2",
  improntaPrecedente: "h1",
};
const setup = () => {
  const c = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return renderHook(() => useCollegaRevisioneSds("az"), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={c}>{children}</QueryClientProvider>
    ),
  });
};
beforeEach(() => {
  s.readonly = false;
  s.allowed = true;
  s.rpc.mockReset();
});
describe("RPC SDS aziendali", () => {
  it("richiede solo il quadro della propria azienda", async () => {
    s.rpc.mockResolvedValue({ data: [fonte()], error: null });
    expect(await leggiSdsAziendali("az")).toHaveLength(1);
    expect(s.rpc).toHaveBeenCalledWith("sds_aziendali_quadro", {
      _company: "az",
    });
  });
  it.each([
    { company_id: "altra" },
    { order_id: "commessa" },
    { subappaltatore_id: "sub" },
    { operaio_id: "operaio" },
    { incarico_id: "ruolo" },
    { fase_id: "fase" },
    { tipo: "durc" },
    { impronta: null },
    { impieghi: null },
  ])("non accetta una risposta fuori ambito: %j", async (extra) => {
    s.rpc.mockResolvedValue({ data: [{ ...fonte(), ...extra }], error: null });
    await expect(leggiSdsAziendali("az")).rejects.toThrow("non disponibile");
  });
  it("errore di lettura non viene convertito in archivio vuoto", async () => {
    s.rpc.mockResolvedValue({
      data: null,
      error: { message: "Non autorizzato" },
    });
    await expect(leggiSdsAziendali("az")).rejects.toThrow("Non autorizzato");
  });
  it("invia le due versioni attese all’unico endpoint pubblico", async () => {
    s.rpc.mockResolvedValue({
      data: { documento_id: "nuova", precedente_id: "prima", company_id: "az" },
      error: null,
    });
    const h = setup();
    await act(async () => {
      await h.result.current.mutateAsync(input);
    });
    expect(s.rpc).toHaveBeenCalledWith("sds_collega_revisione", {
      _company: "az",
      _documento: "nuova",
      _precedente: "prima",
      _impronta_documento: "h2",
      _impronta_precedente: "h1",
    });
  });
  it("non conferma una risposta riferita a un’altra azienda", async () => {
    s.rpc.mockResolvedValue({
      data: {
        documento_id: "nuova",
        precedente_id: "prima",
        company_id: "altra",
      },
      error: null,
    });
    const h = setup();
    await act(async () => {
      await expect(h.result.current.mutateAsync(input)).rejects.toThrow(
        "non confermato",
      );
    });
  });
  it.each(["readonly", "denied"])(
    "nega scrittura client %s prima della RPC",
    async (mode) => {
      s.readonly = mode === "readonly";
      s.allowed = mode !== "denied";
      const h = setup();
      await act(async () => {
        await expect(h.result.current.mutateAsync(input)).rejects.toThrow(
          "Non puoi",
        );
      });
      expect(s.rpc).not.toHaveBeenCalled();
    },
  );
});
