/**
 * Il PDF vero a destra si rifà a ogni modifica (07/11/2026): ogni giro non deve richiedere di nuovo al server
 * le stesse cose. Qui le tre memorie che lo evitano — i link firmati delle foto, l'archivio delle condizioni e
 * le miniature delle voci — e il fatto che si svuotino quando serve.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const firme = vi.hoisted(() => ({ chiamate: 0 }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({
        createSignedUrls: async (paths: string[]) => {
          firme.chiamate++;
          return { data: paths.map((p) => ({ signedUrl: `https://firmato/${p}?t=${firme.chiamate}` })), error: null as unknown };
        },
      }),
    },
  },
}));

const archivio = vi.hoisted(() => ({ letture: 0 }));
vi.mock("../../../supabase/functions/_shared/condizioniArchivio", async (orig) => ({
  ...(await orig<typeof import("../../../supabase/functions/_shared/condizioniArchivio")>()),
  caricaArchivioDelDocumento: async () => {
    archivio.letture++;
    return { associato: null as unknown, predefinito: null as unknown, fissate: null as unknown } as never;
  },
}));

const conversioni = vi.hoisted(() => ({ fatte: 0 }));
vi.mock("@/lib/serramenti/pdfImageUtils", () => ({
  toDataUrl: async (url: string) => { conversioni.fatte++; return url.includes("rotta") ? null : `data:image/png;base64,${url.length}`; },
}));

import { dimenticaLinkFirmati, linkFileRiservati } from "@/lib/storage/fileRiservati";
import { conArchivioDelDocumento, dimenticaArchivioLetto, DURATA_ARCHIVIO_MS } from "@/lib/condizioni/archivioNelModello";
import { inlineImmaginiVoci, svuotaMiniatureVoci } from "@/lib/moduli/immaginiVociComputo";

beforeEach(() => {
  firme.chiamate = 0; archivio.letture = 0; conversioni.fatte = 0;
  dimenticaLinkFirmati(); dimenticaArchivioLetto(); svuotaMiniatureVoci();
});

describe("Le foto del progetto si firmano una volta", () => {
  it("il secondo giro riusa i link: nessuna richiesta nuova, stessi indirizzi", async () => {
    const foto = ["progetti-media/az/p1/a.jpg", "progetti-media/az/p1/b.jpg"];
    const primo = await linkFileRiservati(foto);
    const secondo = await linkFileRiservati(foto);
    expect(firme.chiamate).toBe(1);
    expect(secondo).toEqual(primo);
  });

  it("una foto nuova si firma da sola, le altre restano quelle di prima", async () => {
    await linkFileRiservati(["progetti-media/az/p1/a.jpg"]);
    const dopo = await linkFileRiservati(["progetti-media/az/p1/a.jpg", "progetti-media/az/p1/c.jpg"]);
    expect(firme.chiamate).toBe(2);
    expect(dopo[0]).toContain("?t=1");
    expect(dopo[1]).toContain("?t=2");
  });
});

describe("L'archivio delle condizioni si legge una volta al minuto", () => {
  const modello = { company_id: "az" };

  it("due giri di fila: una lettura sola", async () => {
    await conArchivioDelDocumento(modello, { company_id: "az" });
    const t = await conArchivioDelDocumento(modello, { company_id: "az" });
    expect(archivio.letture).toBe(1);
    expect(t).toHaveProperty("__condizioni_archivio");
  });

  it("passato il minuto, o salvato un modello, si rilegge", async () => {
    vi.useFakeTimers();
    try {
      await conArchivioDelDocumento(modello, { company_id: "az" });
      vi.advanceTimersByTime(DURATA_ARCHIVIO_MS + 1);
      await conArchivioDelDocumento(modello, { company_id: "az" });
      expect(archivio.letture).toBe(2);
      dimenticaArchivioLetto();
      await conArchivioDelDocumento(modello, { company_id: "az" });
      expect(archivio.letture).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("un altro modello associato, o un documento con le condizioni fissate, si legge a parte", async () => {
    await conArchivioDelDocumento(modello, { company_id: "az" });
    await conArchivioDelDocumento({ ...modello, condizioni_modello_id: "m2" }, { company_id: "az" });
    await conArchivioDelDocumento(modello, { company_id: "az", condizioni_origine: { modello_id: "m1", versione: 2 } });
    expect(archivio.letture).toBe(3);
  });
});

describe("Le miniature delle voci si fanno una volta", () => {
  it("il secondo giro non riconverte le foto; quella che non si è caricata si riprova", async () => {
    const voci = [{ immagine_url: "https://x/doccia.jpg" }, { immagine_url: "https://x/rotta.jpg" }];
    await inlineImmaginiVoci(voci);
    const dopo = await inlineImmaginiVoci(voci);
    expect(conversioni.fatte).toBe(3);
    expect(dopo[0].immagine_url).toMatch(/^data:image/);
    expect(dopo[1].immagine_url).toBeNull();
  });
});
