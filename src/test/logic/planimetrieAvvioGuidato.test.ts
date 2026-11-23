import { describe, expect, it } from "vitest";
import { ambientiDaAppunti, ambientiDaAreeSalvate, bozzaDaAmbienti, stanzeFuoriMisura } from "@/lib/planimetrie/avvioGuidato";
import type { FieldDefinition, SurveyAreaRow } from "@/types/surveys";
import { validaPlanimetria } from "../../../shared/planimetrie/modello";
import { areaPoligono } from "../../../shared/planimetrie/geometria";

const stanzaSalvata = (name: string, area_data: Record<string, unknown>): SurveyAreaRow => ({
  id: name, survey_id: "rilievo", name, position: 0, area_data, notes: null, audio_url: null,
  audio_transcription: null, is_complete: true, created_at: "", updated_at: "",
});

describe("Avvio guidato della planimetria", () => {
  it("aggiorna le misure di una stanza senza aggiungere le quote di porte e finestre", () => {
    const appunti = "Cucina 3,20 × 4,10 m, bagno 5 m²\nCorreggi la cucina a 320 cm per 410 cm\nLa cucina è invece 320 cm per 400 cm\nPorta del bagno 80 × 210 cm\nIngresso con finestra 90 x 150 cm\nAltezza 2,85 m";
    const ambienti = ambientiDaAppunti(appunti);
    expect(ambienti).toMatchObject([
      { nome: "Cucina", larghezzaM: 3.2, profonditaM: 4, superficieMq: 12.8, altezzaM: 2.85 },
      { nome: "bagno", superficieMq: 5, altezzaM: 2.85 },
    ]);
    expect(ambienti[1].larghezzaM).toBeUndefined();
  });

  it("segnala le stanze che la pianta dell'AI ha disegnato fuori dalle misure scritte", () => {
    const testo = "Soggiorno con cucina 5,00 x 4,20 m, disimpegno 3,00 x 1,20 m, bagno 2,40 x 2,10 m.";
    const quadrato = (x: number, y: number, w: number, h: number) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
    const pianta = { livelli: [{ nome: "Piano terra", fatto: { locali: [
      { nome: "Soggiorno con cucina", contorno: quadrato(0, 0, 499, 420) }, // 20,96 m²: entro il 10%
      { nome: "Disimpegno", contorno: quadrato(500, 0, 123, 420) },          // 5,17 m² invece di 3,6
      { nome: "Bagno", contorno: quadrato(0, 430, 240, 210) },
    ] } }] } as never;
    expect(stanzeFuoriMisura(testo, pianta)).toEqual(["Disimpegno: scritti 3,6 m², disegnati 5,17 m²"]);
    expect(stanzeFuoriMisura("nessuna misura qui", pianta)).toEqual([]);
  });

  it("l'altezza scritta in fondo, dopo un punto, vale per tutte le stanze e non solo per l'ultima", () => {
    const ambienti = ambientiDaAppunti("Soggiorno con cucina 5,00 x 4,20 m, camera 3.80 x 3.60 m, bagno 2,40 x 2,10 m, disimpegno 3,00 x 1,20 m. Altezza 2,70 m.");
    expect(ambienti.map((a) => [a.nome, a.altezzaM])).toEqual([
      ["Soggiorno con cucina", 2.7], ["camera", 2.7], ["bagno", 2.7], ["disimpegno", 2.7],
    ]);
    // il punto dei decimali («3.80») non spezza la stanza
    expect(ambienti[1].superficieMq).toBeCloseTo(13.68);
    expect(ambienti[3].superficieMq).toBeCloseTo(3.6);
  });

  it("legge mq e altezza del sopralluogo in unità diverse ed esclude le falde", () => {
    const aree = [stanzaSalvata("Cucina", { mq: "13,12", altezza_soffitto: 285 })];
    const campi: FieldDefinition[] = [{ key: "altezza_soffitto", label: "Altezza", type: "dimension", unit: "cm" }];
    expect(ambientiDaAreeSalvate(aree, campi, "Stanza")).toEqual([{ nome: "Cucina", superficieMq: 13.12, altezzaM: 2.85 }]);
    expect(ambientiDaAreeSalvate(aree, campi, "Falda")).toEqual([]);
  });

  it("apre una bozza valida e conserva le misure rilevate, distinguendo i lati dedotti dalla sola superficie", () => {
    const note = "Cucina 3,20 × 4,10 m, altezza 285 cm\nBagno 2,10 × 2,40 m\nSoggiorno 22,5 m²";
    const documento = bozzaDaAmbienti(ambientiDaAppunti(note), "sopralluogo", note);
    expect(validaPlanimetria(documento)).toMatchObject({ ok: true });
    expect(documento.riferimenti?.note).toBe(note);
    const [cucina, bagno, soggiorno] = documento.livelli[0].fatto.locali;
    expect(areaPoligono(cucina.contorno) / 10_000).toBeCloseTo(13.12);
    expect(areaPoligono(bagno.contorno) / 10_000).toBeCloseTo(5.04);
    expect(cucina.altezza).toBe(285);
    expect(cucina.origineMisure).toMatchObject({ larghezza: "rilevata", profondita: "rilevata", altezza: "rilevata" });
    expect(soggiorno.origine).toBe("stimata");
    expect(areaPoligono(soggiorno.contorno) / 10_000).toBeCloseTo(22.5, 1);
  });

  it("mantiene stanze omonime e quote diverse nei piani descritti", () => {
    const note = "Primo piano\nBagno 2 × 3 m\nAltezza 2,65 m\nPiano terra: bagno 2 × 2 m, garage 4 × 6 m\nAltezza 2,85 m";
    const ambienti = ambientiDaAppunti(note);
    expect(ambienti.map(a => [a.nome.toLowerCase(), a.piano, a.superficieMq, a.altezzaM])).toEqual([
      ["bagno", "Primo piano", 6, 2.65], ["bagno", "Piano terra", 4, 2.85], ["garage", "Piano terra", 24, 2.85],
    ]);
    const documento = bozzaDaAmbienti(ambienti, "sopralluogo", note);
    expect(validaPlanimetria(documento)).toMatchObject({ ok: true });
    expect(documento.livelli.map(p => [p.nome, p.quota, p.fatto.locali.map(l => l.altezza)])).toEqual([
      ["Piano terra", 0, [285, 285]], ["Primo piano", 300, [265]],
    ]);
  });
});
