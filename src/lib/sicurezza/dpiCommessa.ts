import { statoConsegnaDpi, type StatoConsegna, type ConsegnaRegistrata } from "../../../supabase/functions/_shared/consegneDpi";
export { TIPI_DPI, statoConsegnaDpi, type StatoConsegna } from "../../../supabase/functions/_shared/consegneDpi";
export interface VerbaleDpi {
  revisione?: string | null;
  impronta: string;
  id: string;
  operaio_id: string;
  titolo: string;
  file_name: string | null;
  catalogo_id: string;
  catalogo_versione: number;
  order_id: string | null;
  fase_id: string | null;
  applicabile_dal: string | null;
  applicabile_al: string | null;
  stato: string;
  data_rilascio: string | null;
  data_scadenza: string | null;
  updated_at: string;
}
export interface ConsegnaDpi extends ConsegnaRegistrata {
  evidenza_impronta?: string | null;
  evidenza_id?: string | null;
  evidenza_attesa?: string | null;
  evidenza_snapshot?: VerbaleDpi | null;
  aggiornato_il?: string;
  taglia?: string | null;
  note?: string;
  annullamento_motivo?: string | null;
  marca: string | null;
  matricola: string | null;
  modulo_registrato: boolean;
}
export interface AddettoDpi {
  id: string;
  nome: string;
  cognome: string;
  qualifica: string | null;
  attivo: boolean | null;
  assegnazioni: Array<{
    fonte: "commessa" | "campo";
    dal: string | null;
    al: string | null;
    fase_id: string | null;
  }>;
  consegne: ConsegnaDpi[];
}
export interface QuadroDpi {
  esterni_legacy?: number;
  data: string;
  fase_id: string | null;
  addetti: AddettoDpi[];
  campo_senza_dipendente: number;
}
export const ETICHETTE_CONSEGNA: Record<StatoConsegna, string> = {
  annullata: "Registrazione annullata",
  da_controllare: "Dati da controllare",
  futura: "Consegna futura",
  restituita: "Restituito",
  scaduta: "Scaduto",
  danneggiata: "Danneggiato",
  smarrita: "Smarrito",
  in_uso: "Registrato in uso",
};
export function riepilogoDpi(q: QuadroDpi) {
  const consegne = q.addetti.flatMap((a) => a.consegne);
  return {
    addetti: q.addetti.length,
    senzaConsegne: q.addetti.filter(
      (a) => !a.consegne.some((d) => statoConsegnaDpi(d, q.data) === "in_uso"),
    ).length,
    criticita: consegne.filter((d) =>
      ["da_controllare", "scaduta", "danneggiata", "smarrita"].includes(
        statoConsegnaDpi(d, q.data),
      ),
    ).length,
    senzaModulo: consegne.filter(
      (d) => statoConsegnaDpi(d, q.data) === "in_uso" && !d.modulo_registrato,
    ).length,
  };
}
