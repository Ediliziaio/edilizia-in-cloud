import { normalizzaPos } from "./posModello.ts";
import { preparaPosDaApp } from "./posDatiApp.ts";
import { datiDaSnapshotPos, ErroreEmissionePos, type RigaEmissionePos, type SorgenteEmissione } from "./posEmissione.ts";
// deno-lint-ignore no-explicit-any
type Db = any;
// deno-lint-ignore no-explicit-any
type PosRiga = any;

/**
 * Da dove nasce un'emissione: il POS in bozza che si approva, oppure una copia del contenuto già approvato e archiviato.
 * Li usano sia la preparazione (che prenota) sia il completamento (che arriva in una richiesta diversa e non si fida di
 * nulla che il browser possa aver cambiato nel frattempo: rilegge il POS, o la copia, dell'azienda e della prenotazione).
 */

/** Il nome di chi approva resta nel PDF immutabile e in approvato_da_nome: se il profilo non si legge, si riprova. */
export async function nomeDiChiApprova(db: Db, userId: string): Promise<string> {
  const { data: profilo, error } = await db.from("profiles").select("first_name, last_name, email").eq("id", userId).maybeSingle();
  if (error) throw new ErroreEmissionePos("Profilo di chi approva non leggibile: riprova tra poco", 503);
  return [profilo?.first_name, profilo?.last_name].filter(Boolean).join(" ") || profilo?.email || "utente";
}

/** Il POS in bozza che si approva. I dati dell'app rilevati ora restano come fonte, distinti da ciò che l'utente ha adattato e approvato. */
export async function sorgenteApprovazione(db: Db, p: { companyId: string; pos: PosRiga; nomeAutore: string; rilevaFonti?: typeof preparaPosDaApp }): Promise<SorgenteEmissione> {
  const { companyId, pos } = p;
  const fonti = await (p.rilevaFonti ?? preparaPosDaApp)(db, companyId, String(pos.order_id));
  const rilevateIl = new Date().toISOString();
  return { posId: pos.id, companyId, attesoUpdatedAt: pos.updated_at, nomeAutore: p.nomeAutore,
    dati: { contenuto: normalizzaPos(pos.contenuto), stato: "approvato", revisione: pos.revisione ?? 0, revisioni: Array.isArray(pos.revisioni) ? pos.revisioni : [], codiceCommessa: String(fonti.order.order_code || "") },
    fonti: () => Promise.resolve({ tipo: "dati_app_rilevati_durante_preparazione", rilevati_il: rilevateIl, commessa: fonti.order, contenuto_rilevato: fonti.contenuto, contesto: fonti.contesto, riferimenti: fonti.fonti,
      nota: "Dati delle fonti rilevati durante la preparazione, distinti dai contenuti adattati e approvati dall’utente." }) };
}

/** Una copia del contenuto approvato e archiviato (per id, o quella della revisione corrente): non ricostruisce i byte dell'originale. */
export async function sorgenteArchivio(db: Db, p: { companyId: string; pos: PosRiga; snapshotId?: string }): Promise<SorgenteEmissione> {
  const { companyId, pos } = p;
  const q = db.from("pos_contenuti_archiviati").select("id,revisione,snapshot,fonte,acquisito_il").eq("company_id", companyId).eq("pos_id", pos.id);
  const { data: a, error } = await (p.snapshotId ? q.eq("id", p.snapshotId) : q.eq("revisione", pos.revisione ?? 0)).maybeSingle();
  if (error || !a) throw new ErroreEmissionePos("Contenuto approvato non disponibile", 404);
  const { data: ordine, error: erroreOrdine } = await db.from("orders").select("order_code").eq("company_id", companyId).eq("id", pos.order_id).maybeSingle();
  if (erroreOrdine) throw new ErroreEmissionePos("Codice commessa non disponibile", 503);
  return { posId: pos.id, companyId, attesoUpdatedAt: pos.updated_at, snapshotId: a.id,
    dati: datiDaSnapshotPos(a.snapshot, a.revisione, ordine?.order_code || ""), nomeAutore: "Copia da contenuto archiviato",
    fonti: () => Promise.resolve({ tipo: "contenuto_archiviato", snapshot_id: a.id, fonte: a.fonte, acquisito_il: a.acquisito_il,
      nota: "Le fonti e i byte originari non sono ricostruiti. Il codice commessa è rilevato alla preparazione della copia." }) };
}

export async function sorgenteDaPrenotazione(db: Db, p: { companyId: string; userId: string; e: RigaEmissionePos; rilevaFonti?: typeof preparaPosDaApp }): Promise<SorgenteEmissione> {
  const { companyId, userId, e } = p;
  const { data: pos, error } = await db.from("pos_documents").select("id, company_id, order_id, status, contenuto, revisione, revisioni, document_type, updated_at")
    .eq("id", e.pos_id).eq("company_id", companyId).maybeSingle();
  if (error) throw new ErroreEmissionePos("POS non leggibile: riprova tra poco", 503);
  if (!pos || (pos.document_type && pos.document_type !== "pos")) throw new ErroreEmissionePos("POS non trovato", 404);
  if (e.origine === "ricostruzione_da_contenuto_archiviato") return sorgenteArchivio(db, { companyId, pos, snapshotId: e.snapshot_id ?? undefined });
  if (pos.status !== "bozza") throw new ErroreEmissionePos("Il POS non è più una bozza: ricaricalo e riprova", 409);
  return sorgenteApprovazione(db, { companyId, pos, nomeAutore: await nomeDiChiApprova(db, userId), rilevaFonti: p.rilevaFonti });
}
