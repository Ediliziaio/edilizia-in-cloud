import type { StatoEvidenza } from "./fascicolo";
export const TIPI_MENSILI = {
  lul: "LUL",
  bonifico_lul: "Bonifico LUL",
  quietanza_f24: "Quietanza F24 mensile",
  denuncia_cassa_edile: "Denuncia Cassa Edile",
  bonifico_cassa_edile: "Bonifico Cassa Edile",
  uniemens: "Ricevuta / UniEmens",
} as const;
export type TipoMensile = keyof typeof TIPI_MENSILI;
export interface DocumentoMensile {
  id: string;
  company_id: string;
  subappaltatore_id: string;
  contratto_id: string;
  competenza: string;
  tipo: TipoMensile;
  stato: StatoEvidenza;
  origine_requisito: "da_verificare" | "contratto" | "interna" | "normativa";
  riferimento_requisito: string | null;
  termine: string | null;
  referente: string | null;
  file_path: string | null;
  file_name: string | null;
  note: string | null;
  verificato_da: string | null;
  verificato_il: string | null;
  updated_at: string;
}
export function riepilogoMensili(d: DocumentoMensile[]) {
  const correnti = d.filter((x) => x.stato !== "superato");
  return {
    configurati: correnti.length,
    verificati: correnti.filter((x) => x.stato === "verificato").length,
    nonApplicabili: correnti.filter((x) => x.stato === "non_applicabile")
      .length,
    aperti: correnti.filter(
      (x) => !["verificato", "non_applicabile"].includes(x.stato),
    ).length,
  };
}
export const meseValido = (mese: string) =>
  /^\d{4}-(0[1-9]|1[0-2])$/.test(mese);

export function meseFuoriContratto(
  mese: string,
  c: {
    data_inizio?: string | null;
    data_fine_effettiva?: string | null;
    data_fine_prevista?: string | null;
  },
) {
  if (!meseValido(mese)) return false;
  const inizio = c.data_inizio?.slice(0, 7);
  const fine = (c.data_fine_effettiva || c.data_fine_prevista)?.slice(0, 7);
  return !!((inizio && mese < inizio) || (fine && mese > fine));
}
