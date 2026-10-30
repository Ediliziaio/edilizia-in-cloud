// DXF del geometra come SFONDO da ricalcare (fase 3: solo l'ingresso).
// Non si riconoscono muri né stanze (fase 7): si legge quanto basta per
// mettere il disegno sotto la pianta nella scala giusta — unità e ingombro —
// dall'intestazione del DXF in formato testo.

import type { Planimetria, SfondoDxf } from "./modelloProvvisorio.ts";

const UNITA: Record<string, SfondoDxf["unita"]> = { "4": "mm", "5": "cm", "6": "m" };
const CM: Record<SfondoDxf["unita"], number> = { mm: 0.1, cm: 1, m: 100, sconosciuta: 1 };

export function leggiIntestazioneDxf(testo: string): { unita: SfondoDxf["unita"]; estensione: SfondoDxf["estensione"] } {
  if (testo.startsWith("AutoCAD Binary DXF")) throw new Error("DXF binario: salvalo come DXF di testo (ASCII).");
  const righe = testo.split(/\r?\n/).map((r) => r.trim());
  if (!righe.includes("SECTION") || !righe.includes("EOF")) throw new Error("Il file non sembra un DXF.");
  let unita: SfondoDxf["unita"] = "sconosciuta";
  const punti: Record<string, { x?: number; y?: number }> = {};
  for (let i = 0; i + 1 < righe.length; i += 2) {
    if (righe[i] === "2" && righe[i + 1] === "ENTITIES") break;
    if (righe[i] !== "9") continue;
    const nome = righe[i + 1];
    if (nome === "$INSUNITS" && righe[i + 2] === "70") unita = UNITA[righe[i + 3]] ?? "sconosciuta";
    if (nome === "$EXTMIN" || nome === "$EXTMAX") {
      const p: { x?: number; y?: number } = {};
      for (let j = i + 2; j + 1 < Math.min(righe.length, i + 10); j += 2) {
        if (righe[j] === "10") p.x = Number(righe[j + 1]);
        if (righe[j] === "20") p.y = Number(righe[j + 1]);
      }
      punti[nome] = p;
    }
  }
  const min = punti.$EXTMIN;
  const max = punti.$EXTMAX;
  const valida = (v?: number) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 1e19;
  const estensione = min && max && valida(min.x) && valida(min.y) && valida(max.x) && valida(max.y) && max.x! > min.x!
    ? { min: { x: min.x!, y: min.y! }, max: { x: max.x!, y: max.y! } }
    : null;
  if (unita === "sconosciuta" && estensione) {
    // Senza unità dichiarate: un appartamento è largo 5–40 m.
    const w = estensione.max.x - estensione.min.x;
    unita = w > 2000 ? "mm" : w > 200 ? "cm" : "m";
  }
  return { unita, estensione };
}

/** Pianta vuota con il DXF sotto: l'utente ricalca nell'editor. */
export function planimetriaConSfondoDxf(testo: string, path: string): Planimetria {
  const { unita, estensione } = leggiIntestazioneDxf(testo);
  const avvisi = ["Il disegno del tecnico è sotto la pianta: ricalca le stanze sopra."];
  if (!estensione) avvisi.push("Il DXF non dice quanto è grande: controlla che la scala sia giusta misurando una parete.");
  return {
    versione_schema: "provvisoria-1",
    unita: "cm",
    livelli: [{ id: "p0", nome: "Piano", muri: [], aperture: [], locali: [] }],
    scala: null,
    riferimenti: { ingresso: "dxf", sorgente_path: path, sfondo_dxf: { path, unita, cm_per_unita: CM[unita], estensione } },
    avvisi,
  };
}
