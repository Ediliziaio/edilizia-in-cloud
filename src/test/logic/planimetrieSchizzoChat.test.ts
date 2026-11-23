import { describe, expect, it } from "vitest";
import { aPlanimetria, piantaVuota } from "@/components/planimetrie/editor/adattatore";
import { calibraScalaSchizzo, generaDaSchizzo, interpretazioneSchizzo, type ScalaSchizzo } from "@/lib/planimetrie/schizzoSopralluogo";
import { proiezioneFoglio, type AngoliSchizzo } from "@/lib/planimetrie/prospettivaSchizzo";
import { rilevaSullaTavola } from "@/lib/planimetrie/rilevaTavola";
import { applicaQuotaDocumento } from "@/lib/planimetrie/confermaQuoteDocumento";
import type { PlanText } from "@/lib/preventivi/planReading";
import { validaPlanimetria } from "../../../shared/planimetrie/modello";
import { verificaConfermata, verificheDelDocumento } from "../../../shared/planimetrie/verificaDocumento";

function campione({ discordante = false, incompleto = false, senzaOcr = false } = {}) {
  const larghezza = 1060, altezza = 750;
  const pixel = new Uint8Array(larghezza * altezza);
  function riga(x0: number, y0: number, x1: number, y1: number, pennino = 7) {
    const raggio = Math.floor(pennino / 2);
    for (let y = y0 - raggio; y <= y1 + raggio; y++) {
      pixel.fill(1, y * larghezza + x0 - raggio, y * larghezza + x1 + raggio + 1);
    }
  }
  riga(153, 155, 284, 155);
  riga(404, 155, 699, 155);
  riga(829, 155, 963, 155);
  riga(153, 155, 153, 658);
  riga(548, 155, 548, 312);
  if (!incompleto) {
    riga(963, 155, 963, 509);
    riga(963, 570, 963, 658);
    riga(153, 658, 255, 658);
    riga(339, 658, 963, 658);
    riga(548, 393, 548, 658);
    riga(548, 457, 635, 457);
    riga(714, 457, 963, 457);
    // Doppi tratti dei vetri senza sigle: la geometria resta leggibile anche senza OCR.
    for (const dy of [-3, 3]) {
      riga(284, 155 + dy, 404, 155 + dy, 1);
      riga(699, 155 + dy, 829, 155 + dy, 1);
    }
    if (!discordante) for (const dx of [-3, 3]) riga(963 + dx, 509, 963 + dx, 570, 1);
  }
  const nota = (text: string, x: number, y: number, w: number): PlanText => ({
    text, bbox: [x / larghezza, y / altezza, w / larghezza, 24 / altezza], confidence: .99,
  });
  const righe = senzaOcr ? [] : [
    nota("SOGGIORNO", 265, 248, 170), nota("3,85 × 5,00 m", 267, 289, 169),
    nota("CUCINA", 710, 249, 99), nota(discordante ? "5,15 × 3,00 m" : "4,05 × 3,00 m", 672, 284, 170),
    nota("BAGNO", 760, 541, 100), nota("4,05 × 1,95 m", 734, 581, 170),
    nota("P 80", 268, 677, 50), nota("P 80", 482, 342, 45), nota("P 75", 641, 417, 48),
    ...(discordante ? [] : [nota("F 60", 975, 526, 48)]),
  ];
  const elementi = rilevaSullaTavola({ pixel, larghezza, altezza }, righe, true);
  return { elementi, larghezza, altezza, righe, etichetteLette: !senzaOcr };
}

describe("Ricostruzione da uno schizzo nella chat", () => {
  it("riporta i quattro angoli al foglio e rifiuta un quadrilatero incrociato", () => {
    const angoli: AngoliSchizzo = [{ x: .14, y: .2 }, { x: .92, y: .08 }, { x: .83, y: .93 }, { x: .21, y: .78 }];
    const proietta = proiezioneFoglio(angoli)!;
    const rettangolo = [[0, 0], [1, 0], [1, 1], [0, 1]];
    rettangolo.forEach(([u, v], i) => {
      const p = proietta(u, v);
      expect(p.x).toBeCloseTo(angoli[i].x, 10);
      expect(p.y).toBeCloseTo(angoli[i].y, 10);
    });
    expect(proiezioneFoglio([angoli[0], angoli[2], angoli[1], angoli[3]])).toBeNull();
  });

  it("rispetta la misura scelta e calibra l’altro asse con riscontri indipendenti", () => {
    const verticale = (id: string, pixel: number, cm: number): ScalaSchizzo => ({
      id, nome: id, da: { x: 0, y: 0 }, a: { x: 0, y: pixel }, correzioneCm: 10,
      scritto: { cm, zona: { x: .1, y: .1, larghezza: .05, altezza: .05 } },
    });
    const base: ScalaSchizzo = { ...verticale("larghezza", 100, 390), a: { x: 100, y: 0 } };
    const a = verticale("profondita-a", 100, 490), b = verticale("profondita-b", 60, 290), discordante = verticale("discordante", 80, 480);
    expect(calibraScalaSchizzo([base, a, b, discordante], base, 390, true)).toEqual({ x: 4, y: 5, calibrate: [base, a, b] });
    expect(calibraScalaSchizzo([base, a, discordante], base, 390, true)).toEqual({ x: 4, y: 4, calibrate: [base] });
  });

  it("usa scala, tratti e sigle e conserva i riferimenti a foto e geometria anche dopo la correzione", () => {
    const lettura = interpretazioneSchizzo(campione());
    const scala = lettura.riferimenti.find(r => r.nome === "Soggiorno · larghezza interna")!;
    expect(scala.scritto?.cm).toBe(385);
    const originale = piantaVuota();
    const { conMuri, conLocali, completa } = generaDaSchizzo(originale, lettura, scala, 385, "pt");
    expect(originale.muri).toHaveLength(0);
    expect([conMuri.muri.length, conMuri.locali.length, conLocali.locali.length, conLocali.aperture.length]).toEqual([6, 0, 3, 0]);
    expect(completa.aperture.filter(a => a.tipo === "porta")).toHaveLength(3);
    expect(completa.aperture.filter(a => a.tipo === "finestra")).toHaveLength(3);
    expect(completa.locali.map(l => l.nome).sort()).toEqual(["Bagno", "Cucina", "Soggiorno"]);
    expect(completa.aperture.every(a => a.origine === "stimata")).toBe(true);
    const doc = aPlanimetria(completa);
    expect(validaPlanimetria(doc)).toMatchObject({ ok: true });
    const v = verificheDelDocumento(doc).find(v => v.riferimento?.campo === "larghezza" && v.riferimento.tipo === "apertura" && v.valoriLettiCm?.[0] === 80)!;
    expect(v.zoneFoto).toHaveLength(2);
    expect(verificaConfermata(doc, v)).toBe(false);
    const corretta = applicaQuotaDocumento(doc, v.id, 80);
    expect(corretta.livelli[0].fatto.aperture.find(a => a.id === v.riferimento?.oggettoId)?.larghezza).toBe(80);
    expect(verificaConfermata(corretta, verificheDelDocumento(corretta).find(c => c.id === v.id)!)).toBe(true);
    expect(aPlanimetria(originale, doc).letturaDocumento).toBeUndefined();
  });

  it("evidenzia quote discordanti e lascia un vano anonimo se manca il simbolo", () => {
    const lettura = interpretazioneSchizzo(campione({ discordante: true }));
    const scala = lettura.riferimenti.find(r => r.nome === "Soggiorno · larghezza interna")!;
    const { completa, quoteDiScala } = generaDaSchizzo(piantaVuota(), lettura, scala, 385, "pt", true);
    expect(quoteDiScala).toBeGreaterThan(2);
    expect(completa.aperture.filter(a => a.tipo === "varco")).toHaveLength(1);
    expect(completa.letturaDocumento?.verifiche).toEqual(expect.arrayContaining([
      expect.objectContaining({
        descrizione: expect.stringMatching(/Cucina · larghezza discordante/),
        esitoQuota: "discordante", valoriLettiCm: [515], zoneFoto: expect.any(Array),
      }),
    ]));
    expect(validaPlanimetria(aPlanimetria(completa))).toMatchObject({ ok: true });
  });

  it("conserva le sigle dei vani e segnala i nomi leggibili rimasti fuori dai contorni", () => {
    const dati = campione();
    dati.righe = dati.righe.map(r => r.text === "P 80" ? { ...r, text: "P2" } : r);
    dati.elementi.push({ id: "cavedio", tipo: "locale", nome: "Chiostrina", stato: "da_verificare",
      zona: { x: .02, y: .03, larghezza: .09, altezza: .03 } });
    const lettura = interpretazioneSchizzo(dati);
    expect(lettura.aperture.filter(a => a.tipo === "porta")).toHaveLength(3);
    expect(lettura.aperture.some(a => a.scritto?.cm === 200)).toBe(false);
    expect(lettura.nonRicostruiti).toContain("Chiostrina");
    expect(lettura.altreVerifiche).toContainEqual(expect.objectContaining({
      tipo: "geometria", descrizione: expect.stringContaining("Chiostrina"),
    }));
  });

  it("richiede una scala quando non legge quote e rifiuta un disegno aperto", () => {
    const lettura = interpretazioneSchizzo(campione({ senzaOcr: true }));
    expect(lettura.riferimenti.every(r => !r.scritto)).toBe(true);
    expect(lettura.aperture.filter(a => a.tipo === "finestra")).toHaveLength(3);
    expect(() => generaDaSchizzo(piantaVuota(), lettura, lettura.riferimenti[0], 0, "pt")).toThrow(/misura reale/);
    expect(() => interpretazioneSchizzo(campione({ incompleto: true }))).toThrow(/perimetro chiuso/);
  });
});
