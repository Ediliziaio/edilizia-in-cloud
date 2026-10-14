import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRapportinoVocale, type RapportinoVocaleDraft } from "@/hooks/campo/useRapportinoVocale";
const state = vi.hoisted(() => ({ online: true, upload: vi.fn(), invoke: vi.fn(), from: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "worker" }, profile: { company_id: "company" } }) }));
vi.mock("@/lib/campo/network-status", () => ({ isOnline: () => state.online }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: state.from, functions: { invoke: state.invoke }, storage: { from: () => ({ upload: state.upload, getPublicUrl: () => ({ data: { publicUrl: "https://test.invalid/audio" } }) }) },
} }));
beforeEach(() => { vi.clearAllMocks(); state.online = true; state.upload.mockResolvedValue({ error: null }); state.invoke.mockResolvedValue({ data: { trascrizione: "Ho fatto intonaco", dati_estratti: { lavorazione: "Intonaco", ore_lavorate: 3 } }, error: null }); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-24T15:00:00+02:00")); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe("La voce propone, il giornaliero conferma", () => {
  it("mantiene il giorno scelto senza scrivere ore o un giornaliero", async () => {
    const { result } = renderHook(() => useRapportinoVocale());
    let captured: RapportinoVocaleDraft | null = null;
    await act(async () => { captured = await result.current.processAudio(new Blob(["test"]), 10, "audio/webm", "site", "2026-09-23"); });
    expect(captured?.data_lavoro).toBe("2026-09-23"); expect(state.from).not.toHaveBeenCalled(); expect(result.current).not.toHaveProperty("confirmRapportino");
  });
  it("senza cantiere non genera una nota orfana", async () => {
    const { result } = renderHook(() => useRapportinoVocale());
    await act(async () => { expect(await result.current.processAudio(new Blob(["test"]), 10, "audio/webm")).toBeNull(); });
    expect(state.upload).not.toHaveBeenCalled(); expect(state.invoke).not.toHaveBeenCalled();
  });
  it("offline non inventa una trascrizione e non promette un invio", async () => {
    state.online = false; const { result } = renderHook(() => useRapportinoVocale());
    await act(async () => { expect(await result.current.processAudio(new Blob(["test"]), 10, "audio/webm", "site")).toBeNull(); });
    expect(result.current.error).toContain("richiede internet"); expect(state.upload).not.toHaveBeenCalled();
  });
  it("un upload fallito sblocca i controlli e non invoca AI", async () => {
    state.upload.mockResolvedValueOnce({ error: { message: "rete" } }); const { result } = renderHook(() => useRapportinoVocale());
    await act(async () => { expect(await result.current.processAudio(new Blob(["test"]), 10, "audio/webm", "site")).toBeNull(); });
    expect(result.current.uploading).toBe(false); expect(result.current.transcribing).toBe(false); expect(state.invoke).not.toHaveBeenCalled();
  });
  it("ritentando la stessa registrazione non ricarica il file", async () => {
    state.invoke.mockResolvedValueOnce({ error: { message: "rete" }, data: null }); const { result } = renderHook(() => useRapportinoVocale()); const b = new Blob(["test"]);
    await act(async () => { await result.current.processAudio(b, 10, "audio/webm", "site"); });
    await act(async () => { await result.current.processAudio(b, 10, "audio/webm", "site"); });
    expect(state.upload).toHaveBeenCalledTimes(1); expect(result.current.error).toBeNull(); expect(result.current.draft).not.toBeNull();
  });
  it("due tocchi non avviano due trascrizioni", async () => {
    let done!: (value: unknown) => void; state.upload.mockImplementationOnce(() => new Promise(r => { done = r; })); const { result } = renderHook(() => useRapportinoVocale());
    await act(async () => {
      const first = result.current.processAudio(new Blob(["test"]), 10, "audio/webm", "site");
      expect(await result.current.processAudio(new Blob(["test"]), 10, "audio/webm", "site")).toBeNull(); done({ error: null }); await first;
    });
    expect(state.upload).toHaveBeenCalledTimes(1); expect(state.invoke).toHaveBeenCalledTimes(1);
  });
});
