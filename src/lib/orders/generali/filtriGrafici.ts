import type { RigaConfronto, TotaliColonne } from "./pianoConti";
import type { GruppoFonte, TipoFonte } from "./investitoriConti";

export function categorieFiltro(testo: string | null): string[] {
  return [
    ...new Set((testo ?? "").split(",").filter((v) => /^[a-z0-9_]+$/.test(v))),
  ].slice(0, 40);
}

export function totaliRigheFiltrate(
  righe: readonly RigaConfronto[],
): TotaliColonne {
  const somma = (chiave: Exclude<keyof TotaliColonne, "approvato">) =>
    Math.round(righe.reduce((s, r) => s + r[chiave], 0) * 100) / 100;
  return {
    previsto: somma("previsto"),
    reale: somma("reale"),
    aFinire: somma("aFinire"),
    stima: somma("stima"),
    scostamento: somma("scostamento"),
    approvato: righe.some((r) => r.approvato !== null)
      ? Math.round(righe.reduce((s, r) => s + (r.approvato ?? 0), 0) * 100) /
        100
      : null,
  };
}

export function gruppoFonte(tipo: TipoFonte): GruppoFonte {
  return tipo === "propri"
    ? "propri"
    : tipo === "capitale" || tipo === "prestito"
      ? "investitori"
      : "debito";
}
