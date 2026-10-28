/** A site-specific product photograph. No storage path or arbitrary client field is accepted. */
export interface ProdottoPos {
  impiego_id: string;
  versione: number;
  nome: string;
  produttore: string | null;
  codice: string | null;
  impiego: string;
  area: string | null;
  fase_id: string | null;
  subappaltatore_id: string | null;
  dal: string;
  al: string | null;
  sds_necessaria: "si" | "no" | "da_valutare";
  motivo_non_necessaria: string | null;
  materiale_id: string | null;
  materiale_impronta: string | null;
  evidenza_id: string | null;
  evidenza_impronta: string | null;
  sds_revisione: string | null;
  sds_data: string | null;
  sds_stato: string | null;
  sds_file_name: string | null;
  corrispondenza_confermata: boolean;
  verificato: boolean;
}
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const str = (v: unknown) => (typeof v === "string" ? v : "");
const nullable = (v: unknown) => (typeof v === "string" && v ? v : null);
/** Protocol capability is separate from v2 formation/CAS support in already deployed editors. */
export function supportaProdottiPos(v: unknown): boolean {
  const o = obj(v);
  return o.versione_client === 2 && o.versione_prodotti_client === 1;
}
export function normalizzaProdottoPos(v: unknown): ProdottoPos {
  const p = obj(v);
  return {
    impiego_id: str(p.impiego_id),
    versione:
      typeof p.versione === "number" && Number.isInteger(p.versione)
        ? p.versione
        : 0,
    nome: str(p.nome),
    produttore: nullable(p.produttore),
    codice: nullable(p.codice),
    impiego: str(p.impiego),
    area: nullable(p.area),
    fase_id: nullable(p.fase_id),
    subappaltatore_id: nullable(p.subappaltatore_id),
    dal: str(p.dal),
    al: nullable(p.al),
    sds_necessaria:
      p.sds_necessaria === "si" || p.sds_necessaria === "no"
        ? p.sds_necessaria
        : "da_valutare",
    motivo_non_necessaria: nullable(p.motivo_non_necessaria),
    materiale_id: nullable(p.materiale_id),
    materiale_impronta: nullable(p.materiale_impronta),
    evidenza_id: nullable(p.evidenza_id),
    evidenza_impronta: nullable(p.evidenza_impronta),
    sds_revisione: nullable(p.sds_revisione),
    sds_data: nullable(p.sds_data),
    sds_stato: nullable(p.sds_stato),
    sds_file_name: nullable(p.sds_file_name),
    corrispondenza_confermata: p.corrispondenza_confermata === true,
    verificato: p.verificato === true,
  };
}
export function erroriProdottoPos(p: ProdottoPos, faseId?: string | null) {
  const e: string[] = [];
  if (!p.impiego_id || p.versione < 1 || !p.nome.trim() || !p.impiego.trim())
    e.push("identificazione e versione dell’impiego da rileggere");
  if (!p.verificato) e.push("prodotto da riesaminare per questa lavorazione");
  if (p.fase_id && p.fase_id !== faseId)
    e.push("fase dell’impiego diversa dalla lavorazione");
  if (p.subappaltatore_id)
    e.push("impiego di un’altra impresa: consulta il suo POS");
  if (p.sds_necessaria === "da_valutare")
    e.push("necessità della SDS da valutare");
  if (p.sds_necessaria === "no" && !p.motivo_non_necessaria?.trim())
    e.push("necessità esclusa senza motivazione");
  if (p.sds_necessaria === "si") {
    if (!p.evidenza_id || !p.evidenza_impronta || !p.sds_file_name)
      e.push("SDS specifica mancante");
    if (!p.sds_revisione?.trim() || !p.sds_data)
      e.push("revisione o data SDS mancante");
    if (p.sds_stato !== "verificato" || !p.corrispondenza_confermata)
      e.push("SDS e corrispondenza da verificare nel fascicolo");
  }
  return e;
}
export function invalidaProdottiLavorazione(l: {
  prodotti?: ProdottoPos[];
  prodotti_riesaminati?: boolean;
}) {
  l.prodotti_riesaminati = false;
  for (const p of l.prodotti || []) p.verificato = false;
}
