/** Metadata only. Paths and buckets are resolved by the service, never by POS JSON. */
export interface DocumentoTecnicoPos {
  id: string;
  order_id: string;
  fase_id: string | null;
  tipo: string;
  catalogo_id: string | null;
  catalogo_versione: number | null;
  titolo: string;
  file_name: string;
  revisione: string | null;
  data_rilascio: string | null;
  data_scadenza: string | null;
  applicabile_dal: string | null;
  applicabile_al: string | null;
  stato: string;
  impronta: string;
  disponibile: boolean;
  confermata: boolean;
}
export interface FontiTecnicheScheda {
  modalita: "da_verificare" | "documenti" | "testo_pos" | "non_applicabile";
  motivazione: string;
  documenti: DocumentoTecnicoPos[];
}
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const str = (v: unknown) => (typeof v === "string" ? v : "");
const nul = (v: unknown) => (typeof v === "string" && v ? v : null);
export function normalizzaDocumentoTecnico(v: unknown): DocumentoTecnicoPos {
  const o = obj(v);
  return {
    id: str(o.id),
    order_id: str(o.order_id),
    fase_id: nul(o.fase_id),
    tipo: str(o.tipo),
    catalogo_id: nul(o.catalogo_id),
    catalogo_versione: Number.isInteger(o.catalogo_versione)
      ? Number(o.catalogo_versione)
      : null,
    titolo: str(o.titolo),
    file_name: str(o.file_name),
    revisione: nul(o.revisione),
    data_rilascio: nul(o.data_rilascio),
    data_scadenza: nul(o.data_scadenza),
    applicabile_dal: nul(o.applicabile_dal),
    applicabile_al: nul(o.applicabile_al),
    stato: str(o.stato),
    impronta: str(o.impronta),
    disponibile: o.disponibile === true,
    confermata: o.confermata === true,
  };
}
export function normalizzaFontiTecniche(v: unknown): FontiTecnicheScheda {
  const o = obj(v);
  return {
    modalita: ["documenti", "testo_pos", "non_applicabile"].includes(
      str(o.modalita),
    )
      ? (o.modalita as FontiTecnicheScheda["modalita"])
      : "da_verificare",
    motivazione: str(o.motivazione),
    documenti: (Array.isArray(o.documenti) ? o.documenti : []).map(
      normalizzaDocumentoTecnico,
    ),
  };
}
export function erroriFontiTecniche(
  f: FontiTecnicheScheda | undefined,
  tipo: "rischio" | "attrezzatura",
  orderId?: string,
  faseId?: string | null,
  dal?: string,
  al?: string,
) {
  const e: string[] = [];
  if (!f || f.modalita === "da_verificare")
    return ["scegli come documentare la fonte tecnica"];
  if (f.modalita !== "documenti") {
    if (
      (tipo === "rischio" && f.modalita !== "testo_pos") ||
      (tipo === "attrezzatura" && f.modalita !== "non_applicabile")
    )
      e.push("modalità della fonte non pertinente alla scheda");
    if (!f.motivazione.trim())
      e.push(
        "motiva la fonte dichiarativa o la documentazione non applicabile",
      );
    if (f.documenti.length)
      e.push(
        "risolvi i documenti presenti prima di dichiarare una fonte solo testuale",
      );
    return e;
  }
  if (!f.documenti.length || f.documenti.length > 20)
    e.push("collega da 1 a 20 documenti specifici");
  if (new Set(f.documenti.map((d) => d.id)).size !== f.documenti.length)
    e.push("documenti duplicati nella scheda");
  for (const d of f.documenti) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        d.id,
      ) ||
      !/^[0-9a-f]{64}$/i.test(d.impronta) ||
      !d.titolo.trim() ||
      !d.file_name.trim()
    )
      e.push("identificazione o impronta del documento mancante");
    if (!d.disponibile || d.stato !== "verificato" || !d.confermata)
      e.push(
        `documento «${d.titolo || "senza titolo"}» da verificare e confermare`,
      );
    if (orderId && d.order_id !== orderId)
      e.push("documento di un’altra commessa");
    if (d.fase_id && d.fase_id !== faseId)
      e.push("documento riferito a un’altra fase");
    if (!d.revisione?.trim() || !d.data_rilascio)
      e.push("revisione o data del documento da completare");
    if (
      dal &&
      ((d.data_rilascio && d.data_rilascio > dal) ||
        (d.applicabile_dal && d.applicabile_dal > dal))
    )
      e.push("documento non applicabile dall’inizio del POS");
    const fine = al || "9999-12-31";
    if (
      dal &&
      ((d.data_scadenza && d.data_scadenza < fine) ||
        (d.applicabile_al && d.applicabile_al < fine))
    )
      e.push("documento non valido per tutto il periodo del POS");
  }
  return e;
}
export const supportaFontiTecnichePos = (b: Record<string, unknown>) =>
  b.versione_client === 2 &&
  b.versione_tecnica_client === 1 &&
  b.versione_fonti_tecniche_client === 1;
