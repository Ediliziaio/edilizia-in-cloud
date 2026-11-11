import { describe, expect, it } from "vitest";
import { aPlanimetria, type Pianta } from "@/components/planimetrie/editor/adattatore";
import * as C from "@/components/planimetrie/editor/comandi";
import { CATALOGO } from "@/components/planimetrie/editor/catalogo";
import { pdfVerifiche } from "@/lib/planimetrie/verifichePdf";
import { riepilogoVerifiche, verificaPianta } from "../../../shared/planimetrie/verifiche.ts";
import { nuovaPlanimetria } from "../../../shared/planimetrie/modello.ts";
import { bagnoDaVerificare } from "../fixtures/bagnoDaVerificare";

const voce = (t: string) => CATALOGO.find((v) => v.tipo === t)!;

function casa(opz: { finestraCamera?: number; bidet?: boolean; altezzaCamera?: number } = {}) {
  let p: Pianta = { versione: 1, unita: "cm", muri: [], aperture: [], locali: [] };
  const stanza = (x0: number, x1: number, nome: string, d: Parameters<typeof C.modificaLocale>[2]["destinazione"], altezza?: number) => {
    const r = C.aggiungiStanza(p, C.rettangolo({ x: x0, y: 0 }, { x: x1, y: 400 }));
    p = C.modificaLocale(r.pianta, r.id, { nome, destinazione: d, ...(altezza ? { altezza } : {}) });
  };
  stanza(0, 500, "Soggiorno", "soggiorno");
  stanza(500, 800, "Camera", "camera", opz.altezzaCamera);
  stanza(800, 1000, "Bagno", "bagno");
  const muroSud = (x: number) => p.muri.find((m) => Math.abs(m.p1.y) < 1 && Math.abs(m.p2.y) < 1 && Math.min(m.p1.x, m.p2.x) <= x && Math.max(m.p1.x, m.p2.x) >= x)!;
  p = C.aggiungiApertura(p, muroSud(250).id, "portafinestra", 100).pianta; // soggiorno: 1,40 × 2,40 = 3,36 (serve 2,5 su 20 mq lordi)
  p = C.modificaApertura(p, p.aperture[p.aperture.length - 1].id, { larghezza: 140 });
  if (opz.finestraCamera) {
    p = C.aggiungiApertura(p, muroSud(650).id, "finestra", 80).pianta;
    p = C.modificaApertura(p, p.aperture[p.aperture.length - 1].id, { larghezza: opz.finestraCamera });
  }
  p = C.aggiungiElemento(p, voce("letto_matrimoniale"), { x: 650, y: 250 }).pianta;
  const sanitari: Array<[string, number]> = [["wc", 830], ["lavabo", 900], ["doccia", 960], ...(opz.bidet ? [["bidet", 870] as [string, number]] : [])];
  for (const [t, x] of sanitari) p = C.aggiungiElemento(p, voce(t), { x, y: 360 }).pianta;
  return aPlanimetria(p, nuovaPlanimetria("Casa"));
}

describe("verifiche igienico-sanitarie", () => {
  it("camera senza finestre e troppo piccola per il letto matrimoniale, bagno cieco, alloggio sotto i 38 m²", () => {
    const v = verificaPianta(casa());
    const di = (o: string, c: string) => v.find((x) => x.oggetto === o && x.codice === c)!;
    expect(di("Camera", "rai").esito).toBe("non_conforme");
    expect(di("Camera", "superficie").esito).toBe("non_conforme"); // ~11 mq con matrimoniale
    expect(di("Soggiorno", "rai").esito).toBe("ok");
    expect(di("Bagno", "bagno").esito).toBe("non_conforme");
    expect(v.find((x) => x.codice === "alloggio" && /bidet/.test(x.messaggio))?.esito).toBe("attenzione");
    expect(riepilogoVerifiche(v).nonConformi).toBeGreaterThanOrEqual(3);
  });
  it("con la finestra giusta e il bidet: a posto; altezza 2,50 da verificare", () => {
    const v = verificaPianta(casa({ finestraCamera: 160, bidet: true, altezzaCamera: 250 }));
    expect(v.find((x) => x.oggetto === "Camera" && x.codice === "rai")!.esito).toBe("ok");
    expect(v.find((x) => x.oggetto === "Camera" && x.codice === "altezza")!.esito).toBe("attenzione");
    expect(v.some((x) => x.codice === "alloggio" && /Bagno completo/.test(x.messaggio))).toBe(true);
  });
  it("la relazione PDF", async () => {
    const { PDFDocument } = await import("pdf-lib");
    const dati = await pdfVerifiche({ documento: casa(), titolo: "Casa", stato: "Com'è oggi", verifiche: verificaPianta(casa()) });
    expect((await PDFDocument.load(dati)).getPageCount()).toBe(1);
  });
  it("anche l'esportatore rifiuta il PDF con quote discordanti ancora aperte", async () => {
    const documento = bagnoDaVerificare();
    await expect(pdfVerifiche({ documento, titolo: "Bagno", stato: "Com'è oggi", verifiche: verificaPianta(documento) })).rejects.toThrow(/423 oppure 421,5/);
  });
});
