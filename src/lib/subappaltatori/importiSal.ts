import type { SALSubappaltatore } from "@/types/subappaltatori";
type ImportiSal = Pick<SALSubappaltatore, "pagato_registrato" | "importo_netto"> & { stato: string };
export const pagatoSal = (s: ImportiSal) => Number(s.pagato_registrato ?? (s.stato === 'pagato' ? s.importo_netto : 0));
export const residuoSal = (s: ImportiSal) => Math.max(0,Number(s.importo_netto)-pagatoSal(s));
