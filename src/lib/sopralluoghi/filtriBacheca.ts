import { FASI, type FiltriBacheca, type PeriodoFiltro } from "./bacheca";

export const FILTRI_SOPRALLUOGHI: FiltriBacheca = {
  fase: "tutte",
  periodo: "tutti",
  tecnico: "tutti",
  testo: "",
  soloSenzaPreventivo: false,
  soloBozzeFerme: false,
};
const PERIODI: PeriodoFiltro[] = [
  "tutti",
  "oggi",
  "settimana",
  "mese",
  "in_ritardo",
  "senza_data",
];
const CHIAVI = {
  fase: "sop_fase",
  periodo: "sop_periodo",
  tecnico: "sop_tecnico",
  testo: "sop_cerca",
  soloSenzaPreventivo: "sop_senza_preventivo",
  soloBozzeFerme: "sop_ferme",
} as const;

export function leggiFiltriBacheca(params: URLSearchParams): FiltriBacheca {
  const fase = params.get(CHIAVI.fase);
  const periodo = params.get(CHIAVI.periodo);
  return {
    fase: FASI.find((f) => f.fase === fase)?.fase ?? "tutte",
    periodo: PERIODI.includes(periodo as PeriodoFiltro)
      ? (periodo as PeriodoFiltro)
      : "tutti",
    tecnico: params.get(CHIAVI.tecnico) || "tutti",
    testo: params.get(CHIAVI.testo) ?? "",
    soloSenzaPreventivo: params.get(CHIAVI.soloSenzaPreventivo) === "1",
    soloBozzeFerme: params.get(CHIAVI.soloBozzeFerme) === "1",
  };
}

export function scriviFiltriBacheca(
  params: URLSearchParams,
  filtri: Partial<FiltriBacheca>,
): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const key of Object.keys(filtri) as Array<keyof FiltriBacheca>) {
    const value = filtri[key];
    if (!value || value === "tutte" || value === "tutti")
      next.delete(CHIAVI[key]);
    else next.set(CHIAVI[key], typeof value === "boolean" ? "1" : value);
  }
  return next;
}
