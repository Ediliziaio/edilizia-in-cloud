import type { MezzoFontePos } from "../../../supabase/functions/_shared/posMezzi";
import type { DocumentoMezzoPos } from "../../../supabase/functions/_shared/posDocumentiMezzi";

export interface AttrezzaturaCommessa {
  id: string;
  fonte: MezzoFontePos;
  collegamenti: MezzoFontePos[];
  periodoDocumentato: boolean;
}
/** Group by canonical asset, never name or quantity; current location is not dated evidence. */
export function attrezzatureNelContesto(
  fonti: readonly MezzoFontePos[],
  ordine: string,
  giorno: string,
): AttrezzaturaCommessa[] {
  const gruppi = new Map<string, AttrezzaturaCommessa>();
  const visti = new Set<string>();
  for (const f of fonti) {
    if (
      f.order_id !== ordine ||
      !f.mezzo_id ||
      (f.dal && f.dal > giorno) ||
      (f.al && f.al < giorno)
    )
      continue;
    const chiave = `${f.mezzo_id}:${f.fonte_tipo}:${f.fonte_id}`;
    if (visti.has(chiave)) continue;
    visti.add(chiave);
    const documentato =
      (f.fonte_tipo === "assegnazione" || f.fonte_tipo === "allocazione") &&
      !!f.dal;
    const g = gruppi.get(f.mezzo_id);
    if (g) {
      g.collegamenti.push(f);
      g.periodoDocumentato ||= documentato;
    } else
      gruppi.set(f.mezzo_id, {
        id: f.mezzo_id,
        fonte: f,
        collegamenti: [f],
        periodoDocumentato: documentato,
      });
  }
  return [...gruppi.values()].sort(
    (a, b) =>
      a.fonte.nome.localeCompare(b.fonte.nome, "it") ||
      a.id.localeCompare(b.id),
  );
}
export function statoDocumentoAttrezzatura(
  d: DocumentoMezzoPos,
  giorno: string,
) {
  if (!d.disponibile) return "Originale non disponibile";
  if (d.data_inizio && d.data_inizio > giorno)
    return "Decorrenza successiva alla data scelta";
  if (d.data_scadenza && d.data_scadenza < giorno)
    return "Scaduto alla data scelta";
  return "Da riesaminare per l’utilizzo";
}
