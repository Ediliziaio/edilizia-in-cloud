import { errorePeriodo } from "./fascicolo";
export interface MaterialeSds {
  id: string;
  order_id: string;
  nome: string;
  codice: string | null;
  stock_item_id: string | null;
  fase_id: string | null;
  natura_riga: string | null;
  impronta: string;
}
export interface DocumentoSds {
  id: string;
  subappaltatore_id: string | null;
  order_id: string | null;
  fase_id: string | null;
  titolo: string;
  file_name: string | null;
  revisione: string | null;
  data_rilascio: string | null;
  data_scadenza: string | null;
  stato: string;
  applicabile_dal: string | null;
  applicabile_al: string | null;
  updated_at: string;
  disponibile: boolean;
  impronta: string;
}
export interface DatiProdottoSds {
  materiale_id: string | null;
  materiale_impronta: string | null;
  subappaltatore_id: string | null;
  fase_id: string | null;
  nome: string;
  produttore: string;
  codice: string;
  impiego: string;
  area: string;
  dal: string;
  al: string;
  sds_necessaria: "da_valutare" | "si" | "no";
  motivo_non_necessaria: string;
  evidenza_id: string | null;
  evidenza_impronta: string | null;
  corrispondenza_confermata: boolean;
  note: string;
  annullato: boolean;
  motivo: string;
}
export interface ImpiegoProdottoSds extends Omit<
  DatiProdottoSds,
  | "al"
  | "motivo"
  | "produttore"
  | "codice"
  | "area"
  | "note"
  | "motivo_non_necessaria"
> {
  id: string;
  company_id: string;
  order_id: string;
  versione: number;
  aggiornato_il: string;
  al: string | null;
  produttore: string | null;
  codice: string | null;
  area: string | null;
  note: string | null;
  motivo_non_necessaria: string | null;
  materiale_snapshot: Omit<MaterialeSds, "impronta"> | null;
  evidenza_snapshot: DocumentoSds | null;
  materiale_corrente: Omit<MaterialeSds, "impronta"> | null;
  documento_corrente: DocumentoSds | null;
  materiale_cambiato: boolean;
  documento_cambiato: boolean;
  pertinente: boolean;
  documento_pertinente: boolean;
}
export interface QuadroProdottiSds {
  company_id: string;
  order_id: string;
  data: string;
  fase_id: string | null;
  materiali: MaterialeSds[];
  documenti: DocumentoSds[];
  imprese: { id: string; ragione_sociale: string }[];
  impieghi: ImpiegoProdottoSds[];
}
export const vuotoProdottoSds = (
  data: string,
  faseId?: string,
): DatiProdottoSds => ({
  materiale_id: null,
  materiale_impronta: null,
  subappaltatore_id: null,
  fase_id: faseId || null,
  nome: "",
  produttore: "",
  codice: "",
  impiego: "",
  area: "",
  dal: data,
  al: "",
  sds_necessaria: "da_valutare",
  motivo_non_necessaria: "",
  evidenza_id: null,
  evidenza_impronta: null,
  corrispondenza_confermata: false,
  note: "",
  annullato: false,
  motivo: "",
});
export function datiProdottoSds(p: ImpiegoProdottoSds): DatiProdottoSds {
  const d = vuotoProdottoSds(p.dal, p.fase_id || undefined);
  return Object.fromEntries(
    Object.keys(d).map((k) => [
      k,
      k === "motivo"
        ? ""
        : (p[k as keyof ImpiegoProdottoSds] ?? d[k as keyof DatiProdottoSds]),
    ]),
  ) as unknown as DatiProdottoSds;
}
export function erroriProdottoSds(d: DatiProdottoSds) {
  const e: string[] = [];
  if (!d.nome.trim() || d.nome.length > 250)
    e.push("Indica il prodotto (massimo 250 caratteri).");
  if (d.impiego.trim().length < 3 || d.impiego.length > 2000)
    e.push("Descrivi l’impiego (3–2000 caratteri).");
  if (d.motivo.trim().length < 3 || d.motivo.length > 2000)
    e.push("Motiva la registrazione o rettifica (3–2000 caratteri).");
  const periodo = errorePeriodo(d.dal, d.al);
  if (periodo) e.push(periodo);
  if (!["da_valutare", "si", "no"].includes(d.sds_necessaria))
    e.push("Valuta la necessità della SDS.");
  if (d.sds_necessaria === "no" && d.motivo_non_necessaria.trim().length < 3)
    e.push("Motiva perché la SDS non è necessaria.");
  if (d.corrispondenza_confermata && !d.evidenza_id)
    e.push("Collega la SDS prima di confermarne la corrispondenza.");
  if (
    [d.produttore, d.codice, d.area].some((v) => v.length > 250) ||
    [d.note, d.motivo_non_necessaria].some((v) => v.length > 2000)
  )
    e.push("Riduci i testi oltre il limite indicato.");
  return e;
}
export function documentiSdsPertinenti(
  documenti: DocumentoSds[],
  d: Pick<DatiProdottoSds, "subappaltatore_id" | "fase_id">,
  data: string,
) {
  return documenti.filter(
    (e) =>
      e.disponibile &&
      !["superato", "non_applicabile"].includes(e.stato) &&
      e.subappaltatore_id === d.subappaltatore_id &&
      (!e.fase_id || e.fase_id === d.fase_id) &&
      (!e.applicabile_dal || e.applicabile_dal <= data) &&
      (!e.applicabile_al || e.applicabile_al >= data),
  );
}
export function avvisiProdottoSds(
  p: ImpiegoProdottoSds,
  data: string,
): string[] {
  if (p.annullato) return ["Registrazione annullata"];
  const a: string[] = [];
  if (p.materiale_cambiato)
    a.push(
      p.materiale_corrente
        ? "Materiale di origine cambiato: riesaminare"
        : "Materiale di origine rimosso o non disponibile",
    );
  if (p.sds_necessaria === "da_valutare")
    a.push("Necessità della SDS da valutare");
  if (p.sds_necessaria === "no")
    a.push("SDS dichiarata non necessaria: consulta la motivazione");
  if (p.sds_necessaria === "si") {
    if (!p.evidenza_id) a.push("SDS mancante per questo prodotto");
    else {
      if (!p.documento_pertinente)
        a.push("SDS non disponibile o fuori contesto");
      if (p.documento_cambiato) a.push("SDS cambiata: riesaminare la versione");
      if (!p.corrispondenza_confermata)
        a.push("Corrispondenza prodotto/SDS da confermare");
      const e = p.documento_corrente;
      if (e) {
        if (e.stato !== "verificato") a.push("SDS da verificare nel fascicolo");
        if (!e.revisione?.trim() || !e.data_rilascio)
          a.push("Revisione o data della SDS da indicare");
        if (e.data_scadenza && e.data_scadenza < data)
          a.push("Data di scadenza documentale superata");
      }
    }
  }
  return a;
}
