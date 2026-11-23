import { MODELLI_CATALOGO_3D } from "../../../../shared/planimetrie/modelliArredo";

export const CAMPIONI_PBR: Readonly<Record<string, { metri: [number, number]; rilievo: number; fonte: string }>> = {
  tessuto: { metri: [.4, .4], rilievo: .75, fonte: "Fabric062" },
  rovere: { metri: [1.8, 1.8], rilievo: .52, fonte: "WoodFloor051" },
  marmo: { metri: [2.4, 2.4], rilievo: .25, fonte: "Marble012" },
  impiallacciatura: { metri: [1.8, 1.8], rilievo: .45, fonte: "https://polyhaven.com/a/oak_veneer_01" },
  ...Object.fromEntries(Object.entries(MODELLI_CATALOGO_3D).flatMap(([modello, dati]) =>
    Array.from({ length: dati.parti }, (_, i) => [
      `catalogo-${modello}-${i}`, { metri: [1, 1], rilievo: .8, fonte: dati.fonte },
    ] as const))),
};

export const CANALI_PBR = ["colore", "rugosita", "normale"] as const;
export type CanalePbr = typeof CANALI_PBR[number];

export const chiaveMappaPbr = (trama: string, canale: CanalePbr) => canale === "colore" ? trama : `${trama}:${canale}`;
export const urlMappaPbr = (trama: string, canale: CanalePbr) =>
  Object.hasOwn(CAMPIONI_PBR, trama) ? `planimetrie/pbr/${trama}-${canale}.${canale === "rugosita" ? "png" : "jpg"}` : undefined;
