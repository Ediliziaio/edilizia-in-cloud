import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRapportinoVocale, type RapportinoVocaleDraft } from "@/hooks/campo/useRapportinoVocale";
const state = vi.hoisted(() => ({ writes: [] as { table: string; payload: unknown }[], online: true, existing: false, enqueue: vi.fn(), from: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "worker" }, profile: { company_id: "company" } }) }));
vi.mock("@/hooks/useIsCampo", () => ({ useIsCampo: () => ({ isSubappaltatore: false }) }));
vi.mock("@/hooks/campo/useOfflineSync", () => ({ useOfflineSync: () => ({ enqueue: state.enqueue }) }));
vi.mock("@/lib/campo/network-status", () => ({ isOnline: () => state.online }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (table: string) => {
    state.from(table);
    const response = { data: table === "campo_rapportini" && state.existing ? [{ id: "existing" }] : [], error: null as null };
    const q = { select: () => q, eq: () => q, limit: () => q,
      insert: (payload: unknown) => { state.writes.push({ table, payload }); return q; },
      update: (payload: unknown) => { state.writes.push({ table, payload }); return q; },
      single: async () => ({ data: { id: "new-report" }, error: null as null }),
      then: Promise.resolve(response).then.bind(Promise.resolve(response)) };
    return q;
  },
  functions: { invoke: async () => ({ data: { dati_estratti: { lavorazione: "Intonaco" } }, error: null as null }) },
  storage: { from: () => ({ upload: async () => ({ error: null as null }), getPublicUrl: () => ({ data: { publicUrl: "https://test.invalid/audio" } }) }) },
} }));
beforeEach(() => { vi.clearAllMocks(); state.writes = []; state.existing = false; state.online = true; vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-24T15:00:00+02:00")); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
const draft = (day: string): RapportinoVocaleDraft => ({ data_lavoro: day, trascrizione: "Intonaco", dati_estratti: { ore_lavorate: 3 }, audio_duration_sec: 10 });

describe("Vocale: stessa giornata e scadenza del rapportino scritto", () => {
  it("mantiene la data della registrazione quando viene confermato domani", async () => {
    const { result } = renderHook(() => useRapportinoVocale());
    let captured: RapportinoVocaleDraft | null = null;
    await act(async () => { captured = await result.current.processAudio(new Blob(["test"]), 10, "audio/webm", "site"); });
    expect(captured?.data_lavoro).toBe("2026-09-24");
    vi.setSystemTime(new Date("2026-09-25T09:00:00+02:00"));
    await act(async () => { expect(await result.current.confirmRapportino(captured!, "site")).toBe(true); });
    expect(state.writes.find(w => w.table === "campo_rapportini")?.payload).toEqual(expect.objectContaining({ data_lavoro: "2026-09-24" }));
  });
  it.each(["2026-09-22", "2026-09-25", ""])("non salva né accoda una giornata non consentita %s", async day => {
    const { result } = renderHook(() => useRapportinoVocale());
    await act(async () => { expect(await result.current.confirmRapportino(draft(day), "site")).toBe(false); });
    expect(state.from).not.toHaveBeenCalled(); expect(state.enqueue).not.toHaveBeenCalled();
    expect(result.current.error).toContain("giorno successivo");
  });
  it("non sovrascrive un rapportino giornaliero già presente", async () => {
    state.existing = true; const { result } = renderHook(() => useRapportinoVocale());
    await act(async () => { expect(await result.current.confirmRapportino(draft("2026-09-24"), "site")).toBe(false); });
    expect(state.writes).toHaveLength(0); expect(result.current.error).toContain("già un rapportino");
  });
  it("la nota offline conserva il giorno, senza fingere un report di commessa inviato", async () => {
    state.online = false; const { result } = renderHook(() => useRapportinoVocale());
    await act(async () => { expect(await result.current.confirmRapportino(draft("2026-09-23"), "site")).toBe(true); });
    expect(state.enqueue).toHaveBeenCalledWith("rapportino_vocale", expect.objectContaining({ dati_estratti: expect.objectContaining({ data_lavoro: "2026-09-23" }) }));
    expect(state.writes).toHaveLength(0);
  });
});
