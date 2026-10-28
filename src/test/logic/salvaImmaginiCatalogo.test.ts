import { beforeEach, describe, expect, it, vi } from "vitest";
import { caricaImmaginiCatalogo } from "@/lib/listino/salvaImmaginiCatalogo";

const m = vi.hoisted(() => ({ upload: vi.fn(), remove: vi.fn(), publicUrl: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { storage: { from: () => ({ upload: m.upload, remove: m.remove, getPublicUrl: m.publicUrl }) } } }));
beforeEach(() => {
  vi.clearAllMocks(); m.upload.mockResolvedValue({ error: null }); m.remove.mockResolvedValue({ error: null });
  m.publicUrl.mockImplementation((path: string) => ({ data: { publicUrl: `https://example.test/${path}` } }));
});
const nuova = (id: string) => ({ id, url: "blob:preview", ruolo: "principale" as const, didascalia: "Profilo",
  file: new File(["image"], "profilo.jpg", { type: "image/jpeg" }) });
describe("Upload galleria", () => {
  it("usa percorsi nuovi e restituisce metadati persistibili senza File o blob", async () => {
    const result = await caricaImmaginiCatalogo("azienda", "linea", [nuova("a")]);
    expect(m.upload.mock.calls[0][0]).toMatch(/^azienda\/linee\/linea-.+\.jpg$/);
    expect(m.upload.mock.calls[0][2].upsert).toBe(false);
    expect(result.immagini[0].url).toMatch(/^https:/);
    expect(result.immagini[0]).not.toHaveProperty("file");
    expect(m.remove).not.toHaveBeenCalled();
  });
  it("annulla soltanto i nuovi file quando una parte del caricamento fallisce", async () => {
    m.upload.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { message: "Errore rete" } });
    await expect(caricaImmaginiCatalogo("azienda", "linea", [nuova("a"), { ...nuova("b"), ruolo: "sezione" }])).rejects.toThrow("Errore rete");
    expect(m.remove).toHaveBeenCalledTimes(1);
    expect(m.remove.mock.calls[0][0]).toHaveLength(1);
    expect(m.remove.mock.calls[0][0][0]).toBe(m.upload.mock.calls[0][0]);
  });
  it("non carica nuovamente immagini gia salvate e non le cancella al rollback", async () => {
    const result = await caricaImmaginiCatalogo("azienda", "linea", [{ id: "esistente", ruolo: "sezione", url: "https://example.test/vecchia.jpg", didascalia: "Sezione" }]);
    await result.annulla();
    expect(m.upload).not.toHaveBeenCalled();
    expect(m.remove).not.toHaveBeenCalled();
  });
  it("blocca un blob rimasto senza File prima di caricare", async () => {
    await expect(caricaImmaginiCatalogo("azienda", "linea", [{ id: "a", ruolo: "principale", url: "blob:perso", didascalia: "" }])).rejects.toThrow("nuovamente");
    expect(m.upload).not.toHaveBeenCalled();
  });
});
