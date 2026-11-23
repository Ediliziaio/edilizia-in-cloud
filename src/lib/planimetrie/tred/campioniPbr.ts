export const CAMPIONI_PBR: Readonly<Record<string, { metri: [number, number]; rilievo: number; fonte: string }>> = {
  tessuto: { metri: [.4, .4], rilievo: .75, fonte: "Fabric062" },
  rovere: { metri: [1.8, 1.8], rilievo: .52, fonte: "WoodFloor051" },
  marmo: { metri: [2.4, 2.4], rilievo: .25, fonte: "Marble012" },
};

export const CANALI_PBR = ["colore", "rugosita", "normale"] as const;
export type CanalePbr = typeof CANALI_PBR[number];

export const chiaveMappaPbr = (trama: string, canale: CanalePbr) => canale === "colore" ? trama : `${trama}:${canale}`;
export const urlMappaPbr = (trama: string, canale: CanalePbr) =>
  Object.hasOwn(CAMPIONI_PBR, trama) ? `planimetrie/pbr/${trama}-${canale}.${canale === "rugosita" ? "png" : "jpg"}` : undefined;
