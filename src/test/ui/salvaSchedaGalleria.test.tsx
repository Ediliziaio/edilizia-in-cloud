import React from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { comeSchedaLinea, useSalvaSchedaLinea, type SalvaSchedaLinea } from "@/hooks/useSchedeLinea";
import { leggiImmaginiCatalogo } from "@/lib/listino/immaginiCatalogo";

const m = vi.hoisted(() => ({ payload: null as Record<string, unknown> | null, error: null as null | { code: string; message: string },
  upload: vi.fn(), remove: vi.fn(), from: vi.fn() }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "azienda" }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: m.from,
  storage: { from: () => ({ upload: m.upload, remove: m.remove,
    getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage.test/${path}` } }) }) },
} }));
const old = { id: "scheda", company_id: "azienda", nome: "Linea QA", chiave: "linea qa", macrocategoria_id: null as string | null,
  immagine_url: "https://storage.test/vecchia.jpg" };
const input = (): SalvaSchedaLinea => ({ esistente: comeSchedaLinea(old), macrocategoriaId: null, nomeLinea: "Linea QA",
  foto: null, pdf: null, togliFoto: false, togliPdf: false, descrizione: "Descrizione aggiornata", profondita_mm: null,
  camere: null, guarnizioni: null, uw: null, immagini: leggiImmaginiCatalogo([], old.immagine_url) });
const setup = () => {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return renderHook(() => useSalvaSchedaLinea(), { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
};
beforeEach(() => {
  vi.clearAllMocks(); m.error = null; m.payload = null;
  m.upload.mockResolvedValue({ error: null }); m.remove.mockResolvedValue({ error: null });
  m.from.mockImplementation(() => {
    const builder = {
      update: (p: Record<string, unknown>) => { m.payload = p; return builder; },
      insert: (p: Record<string, unknown>) => { m.payload = p; return builder; },
      eq: () => builder, select: () => builder,
      single: async () => ({ data: { ...old, ...m.payload }, error: m.error }),
    };
    return builder;
  });
});
describe("Salvataggio scheda con galleria", () => {
  it("mantiene compatibile una modifica testuale della vecchia scheda", async () => {
    const { result } = setup();
    await act(async () => { await result.current.mutateAsync(input()); });
    expect(m.payload).not.toHaveProperty("immagini");
    expect(m.payload?.immagine_url).toBe(old.immagine_url);
    expect(m.upload).not.toHaveBeenCalled(); expect(m.remove).not.toHaveBeenCalled();
  });
  it("salva esclusione e didascalia senza cancellare la vecchia foto", async () => {
    const { result } = setup(); const v = input();
    v.immagini![0] = { ...v.immagini![0], ruolo: "esclusa", didascalia: "Solo uso interno" };
    await act(async () => { await result.current.mutateAsync(v); });
    expect(m.payload?.immagini).toEqual(v.immagini); expect(m.payload?.immagine_url).toBeNull();
    expect(m.remove).not.toHaveBeenCalled();
  });
  it("se il database rifiuta la galleria elimina solo il nuovo upload", async () => {
    const { result } = setup(); const v = input();
    v.immagini!.push({ id: "nuova", url: "blob:preview", ruolo: "sezione", didascalia: "Sezione", file: new File(["image"], "profilo.jpg", { type: "image/jpeg" }) });
    m.error = { code: "PGRST204", message: "Column immagini not found" };
    await act(async () => { await expect(result.current.mutateAsync(v)).rejects.toThrow("aggiornamento del database"); });
    expect(m.remove).toHaveBeenCalledWith([m.upload.mock.calls[0][0]]);
    expect(m.remove.mock.calls.flat(2)).not.toContain(old.immagine_url);
  });
  it("rifiuta una scheda di un'altra azienda prima di qualsiasi scrittura", async () => {
    const { result } = setup(); const v = input(); v.esistente!.company_id = "altra";
    await act(async () => { await expect(result.current.mutateAsync(v)).rejects.toThrow("altra azienda"); });
    expect(m.from).not.toHaveBeenCalled(); expect(m.upload).not.toHaveBeenCalled();
  });
});
