import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { salvaConfigurazioneSessione } from "@/lib/render/salvaConfigurazioneSessione";
const mock = vi.hoisted(() => ({ from: vi.fn(), update: vi.fn(), eq: vi.fn(), select: vi.fn(), single: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mock.from } }));
const input = { tabella: "render_persiane_sessions" as const, sessionId: "render-demo", companyId: "azienda-demo", config: { colore: "bianco" } };
beforeEach(() => {
  vi.clearAllMocks();
  mock.from.mockReturnValue(mock); mock.update.mockReturnValue(mock); mock.eq.mockReturnValue(mock); mock.select.mockReturnValue(mock);
  mock.single.mockResolvedValue({ data: { id: "render-demo" }, error: null });
});
afterEach(() => vi.useRealTimers());
it("conferma l'aggiornamento della sessione nella propria azienda", async () => {
  expect(await salvaConfigurazioneSessione(input)).toEqual({ ok: true });
  expect(mock.eq).toHaveBeenCalledWith("company_id", "azienda-demo");
  expect(mock.eq).toHaveBeenCalledWith("id", "render-demo");
  expect(mock.select).toHaveBeenCalledWith("id");
  expect(mock.update).toHaveBeenCalledWith(expect.objectContaining({ config: { colore: "bianco" } }));
});
it.each([
  { data: null, error: { message: "permission denied" } },
  { data: null, error: null },
])("non autorizza l'avvio in caso di errore o aggiornamento vuoto", async risposta => {
  mock.single.mockResolvedValue(risposta);
  const result = await salvaConfigurazioneSessione(input);
  expect(result.ok).toBe(false);
  if (result.ok === false) expect(result.messaggio).toContain("non è stato avviato");
});
it("sblocca il percorso anche se la rete non risponde", async () => {
  vi.useFakeTimers();
  mock.single.mockReturnValue(new Promise(() => {}));
  const result = salvaConfigurazioneSessione(input);
  await vi.advanceTimersByTimeAsync(15001);
  expect((await result).ok).toBe(false);
});
it("non scrive senza azienda e gestisce il rifiuto di rete", async () => {
  expect((await salvaConfigurazioneSessione({ ...input, companyId: "" })).ok).toBe(false);
  expect(mock.from).not.toHaveBeenCalled();
  mock.single.mockRejectedValue(new Error("offline"));
  expect((await salvaConfigurazioneSessione(input)).ok).toBe(false);
});

it("anche le facciate richiedono salvataggio confermato prima della generazione", async () => {
  mock.single.mockResolvedValue({ data: null, error: { message: "denied" } });
  expect((await salvaConfigurazioneSessione({ ...input, tabella: "render_facciata_sessions" })).ok).toBe(false);
  expect(mock.from).toHaveBeenCalledWith("render_facciata_sessions");
  expect(mock.eq).toHaveBeenCalledWith("company_id", input.companyId);
});
