import { describe, it, expect, vi, beforeEach } from "vitest";
const s = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
  sicurezza: vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({
  useMutation: (config: unknown) => config,
  useQuery: vi.fn(),
  useQueryClient: () => ({ invalidateQueries: s.invalidateQueries }),
}));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({
  useEffectiveCompanyId: () => "az",
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({}) }));
vi.mock("@/lib/sicurezza/invalidaFontiMezzi", () => ({
  invalidaFontiSicurezzaMezzi: s.sicurezza,
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import {
  useSalvaDocumentoMezzo,
  useSalvaManutenzioneMezzo,
  useMontaQuantita,
  useInviaSegnalazione,
} from "@/hooks/useMezzi";
beforeEach(() => vi.clearAllMocks());
const successo = (hook: unknown) =>
  (hook as { onSuccess: (data?: unknown, input?: unknown) => void }).onSuccess;
describe("Scritture inventario riallineano Sicurezza e POS", () => {
  it.each([
    ["documento", () => useSalvaDocumentoMezzo("m1")],
    ["manutenzione", () => useSalvaManutenzioneMezzo("m1")],
    ["allocazione", () => useMontaQuantita("m1")],
  ] as const)(
    "%s aggiorna le proiezioni della stessa azienda",
    (_nome, hook) => {
      successo(hook())(undefined, { order_id: "c1" });
      expect(s.sicurezza).toHaveBeenCalledWith(
        expect.objectContaining({ invalidateQueries: s.invalidateQueries }),
        "az",
      );
    },
  );
  it("una segnalazione dal campo usa l’azienda esplicita del mezzo, anche se diversa da quella attiva", () => {
    successo(useInviaSegnalazione("m1", "azienda-mezzo"))(undefined, {
      tipo: "guasto",
    });
    expect(s.sicurezza).toHaveBeenCalledWith(
      expect.anything(),
      "azienda-mezzo",
    );
  });
});
