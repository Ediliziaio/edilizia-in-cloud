/**
 * Serramenti: le foto del preventivo non si rifirmano a ogni lettura (24/11/2026).
 *
 * Una firma dura 7 giorni, ma `getProgetto` le rifaceva tutte a ogni rilettura: una richiesta in più ogni
 * pochi secondi, e un indirizzo nuovo per la stessa foto che faceva ridisegnare chi la mostrava.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const finto = vi.hoisted(() => ({ firma: vi.fn(), giro: 0 }));

vi.mock("@/integrations/supabase/client", () => {
  const righe: Record<string, unknown> = {
    sr_progetti: { id: "p1", company_id: "az" },
    sr_progetti_media: [
      { id: "m1", kind: "situazione", storage_path: "az/p1/photos/a.jpg", url: "vecchio-a" },
      { id: "m2", kind: "situazione", storage_path: "az/p1/photos/b.jpg", url: "vecchio-b" },
    ],
  };
  const catena = (tabella: string) => {
    const dati = () => {
      const valore = righe[tabella];
      // Righe nuove a ogni lettura, come dal database: getProgetto ci scrive sopra l'indirizzo firmato.
      return Array.isArray(valore) ? valore.map((r) => ({ ...(r as object) })) : valore ?? [];
    };
    const nodo: Record<string, unknown> = {
      maybeSingle: async (): Promise<{ data: unknown; error: null }> => ({ data: Array.isArray(righe[tabella]) ? null : righe[tabella] ?? null, error: null }),
      then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: dati(), error: null }).then(ok),
    };
    for (const metodo of ["select", "eq", "in", "order", "limit"]) nodo[metodo] = () => nodo;
    return nodo;
  };
  return { supabase: { from: catena, storage: { from: () => ({ createSignedUrls: finto.firma }) } } };
});

import { getProgetto } from "@/lib/serramenti/api";

beforeEach(() => {
  finto.giro = 0;
  type Firme = { data: Array<{ signedUrl: string; error: string | null }>; error: string | null };
  finto.firma.mockReset().mockImplementation(async (paths: string[]): Promise<Firme> => {
    finto.giro++;
    const data: Firme["data"] = paths.map((p) => ({ signedUrl: `https://db.example.com/${p}?token=giro${finto.giro}`, error: null as string | null }));
    return { data, error: null };
  });
});

describe("getProgetto: le firme delle foto", () => {
  it("la seconda lettura riusa le firme appena fatte: stessi indirizzi, nessuna richiesta", async () => {
    const prima = await getProgetto("p1");
    const seconda = await getProgetto("p1");
    expect(finto.firma).toHaveBeenCalledTimes(1);
    expect(prima.media.map((m) => m.url)).toEqual([
      "https://db.example.com/az/p1/photos/a.jpg?token=giro1",
      "https://db.example.com/az/p1/photos/b.jpg?token=giro1",
    ]);
    expect(seconda.media.map((m) => m.url)).toEqual(prima.media.map((m) => m.url));
  });

  it("passata un'ora si rifirma", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      await getProgetto("p1");
      vi.setSystemTime(Date.now() + 61 * 60 * 1000);
      const dopo = await getProgetto("p1");
      expect(finto.firma).toHaveBeenCalledTimes(2);
      expect(dopo.media[0].url).toContain("token=giro2");
    } finally {
      vi.useRealTimers();
    }
  });
});
