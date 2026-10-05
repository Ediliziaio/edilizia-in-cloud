/**
 * L'indirizzo nel QR delle etichette (05/10/2026). Nell'app iOS/Android la
 * pagina gira su https://localhost: un'etichetta stampata da lì deve portare
 * comunque al sito vero, non a «localhost».
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => null }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/lib/campo/foto-compressor", () => ({ compressImage: vi.fn() }));

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("@/lib/mobile/platform");
});

async function indirizzo(nativo: boolean) {
  vi.doMock("@/lib/mobile/platform", () => ({ isNative: nativo }));
  const { indirizzoQr } = await import("@/hooks/useMezzi");
  return indirizzoQr("ATT-0012", "azienda-1");
}

describe("indirizzoQr", () => {
  it("nell'app nativa porta al sottodominio dei lavori", async () => {
    expect(await indirizzo(true)).toBe("https://lavori.ediliziaincloud.com/q/ATT-0012?c=azienda-1");
  });

  it("in locale (sviluppo) usa l'indirizzo della pagina", async () => {
    expect(await indirizzo(false)).toBe(`${window.location.origin}/q/ATT-0012?c=azienda-1`);
  });
});
