/** Aspetto illustrativo condiviso tra editor e documento, separato dalle misure. */
export type CoperturaFv = "tegole" | "antracite" | "lamiera";
export const copertureFv: ReadonlyArray<{ valore: CoperturaFv; nome: string }> = [
  { valore: "tegole", nome: "Tegole naturali" },
  { valore: "antracite", nome: "Tegole antracite" },
  { valore: "lamiera", nome: "Lamiera grigia" },
];
export function coperturaValidaFv(v: unknown): v is CoperturaFv {
  return copertureFv.some(c => c.valore === v);
}
export function aspettoTettoFv(copertura?: CoperturaFv, industriale = false) {
  const tipo = copertura ?? (industriale ? "lamiera" : "tegole");
  return { tipo, colore: tipo === "tegole" ? "#8b7d6b" : tipo === "antracite" ? "#515963" : "#829099", parete: "#eee9dd", pannello: "#122332", cornice: "#88959f" };
}
/** La prima inquadratura privilegia la falda con più pannelli, poi l’area. */
export function azimutVistaTettoFv(falde: Array<{ id: string; azimut: number | null; area: number }>, pannelli: Array<{ faldaId: string }>) {
  const conta = new Map<string, number>();
  for (const p of pannelli) conta.set(p.faldaId, (conta.get(p.faldaId) ?? 0) + 1);
  const principale = [...falde].sort((a, b) => (conta.get(b.id) ?? 0) - (conta.get(a.id) ?? 0) || b.area - a.area)[0];
  return (principale?.azimut ?? 180) + 25;
}
