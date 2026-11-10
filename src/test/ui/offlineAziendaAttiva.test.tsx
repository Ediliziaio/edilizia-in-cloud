import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  auth: { user: { id: "utente" }, profile: { company_id: "principale" } },
  getAll: vi.fn(),
  retry: vi.fn(),
  process: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => m.auth }));
vi.mock("@/lib/campo/network-status", () => ({
  isOnline: () => false,
  onNetworkChange: () => () => {},
}));
vi.mock("@/lib/campo/offlineProcessor", () => ({
  processCampoOffline: vi.fn(),
}));
vi.mock("@/lib/campo/sync-queue", () => ({
  syncQueue: {
    getAll: m.getAll,
    retryFailed: m.retry,
    processQueue: m.process,
    registerProcessor: vi.fn(),
    on: () => () => {},
  },
  syncItemScope: (i: any) => ({
    owner: i.user,
    companyId: i.company,
    legacyAudio: false,
  }),
}));
import { useOfflineSync } from "@/hooks/campo/useOfflineSync";
const principale = {
  id: "a",
  user: "utente",
  company: "principale",
  status: "failed",
  lastError: "errore A",
};
const seconda = {
  id: "b",
  user: "utente",
  company: "seconda",
  status: "failed",
  lastError: "errore B",
};
beforeEach(() => {
  m.auth.user.id = "utente";
  m.getAll.mockReset().mockResolvedValue([principale, seconda]);
  m.retry.mockReset().mockResolvedValue(undefined);
  m.process.mockReset().mockResolvedValue(undefined);
});
it("il desktop mostra e ritenta gli invii dell'azienda selezionata, non solo di quella principale", async () => {
  const { result } = renderHook(() => useOfflineSync({ companyId: "seconda" }));
  await waitFor(() => expect(result.current.lastError).toBe("errore B"));
  await act(() => result.current.retry());
  const filtro = m.retry.mock.calls[0][0];
  expect(filtro(seconda)).toBe(true);
  expect(filtro(principale)).toBe(false);
  expect(filtro({ ...seconda, user: "collega" })).toBe(false);
});
it("al cambio azienda non mostra contatori o errori della sessione precedente", async () => {
  const { result, rerender } = renderHook(
    ({ companyId }) => useOfflineSync({ companyId }),
    { initialProps: { companyId: "principale" } },
  );
  await waitFor(() => expect(result.current.lastError).toBe("errore A"));
  m.getAll.mockImplementation(() => new Promise(() => {}));
  rerender({ companyId: "seconda" });
  expect(result.current.queueCount).toBe(0);
  expect(result.current.lastError).toBeNull();
});
it("l'app Campo senza opzioni conserva l'ambito della propria azienda", async () => {
  const { result } = renderHook(() => useOfflineSync());
  await waitFor(() => expect(result.current.lastError).toBe("errore A"));
  expect(result.current.queueCount).toBe(1);
});
