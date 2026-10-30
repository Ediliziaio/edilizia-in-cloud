import {verificaFontePsc} from "./posPscFonte.ts";
import { preparaPacchettoPos, BUCKET_EMISSIONI_POS, type PdfProntoPos } from "./posPacchetto.ts";
import { sha256Hex } from "./improntaDocumento.ts";
import { normalizzaPos } from "./posModello.ts";
import type { DatiStampaPos, RevisionePos } from "./posHtml.ts";
import type { FontiRequisitiAddettiEmissione, FontiDocumentiMezziEmissione, FontiMezziEmissione, FontiTecnicheEmissione, FontiProdottiPos } from "./posPacchetto.ts";
import type { ManifestEmissionePos } from "./posPacchetto.ts";
import type { RiferimentoPsc } from "./posPsc.ts";
// deno-lint-ignore no-explicit-any
type Db = any;
export class ErroreEmissionePos extends Error {
  constructor(message: string, readonly status = 422) { super(message); }
}
function erroreRpc(e: { code?: string; message?: string }) {
  return new ErroreEmissionePos(e.message || "Operazione emissione non riuscita", e.code === "42501" ? 403 : ["40001", "55P03"].includes(e.code || "") ? 409 : 422);
}
export interface RigaEmissionePos {
  id: string; company_id: string; pos_id: string; revisione: number;
  stato: "preparazione" | "completa" | "errore"; token: string; emesso_il: string;
  origine: "approvazione_corrente" | "ricostruzione_da_contenuto_archiviato";
  snapshot_id: string | null; manifest: ManifestEmissionePos | null; manifest_sha256: string | null; zip_sha256: string | null;
  /** Fino a quando la prenotazione è di chi l'ha fatta (5 minuti dalla prenotazione). */
  riservata_fino?: string;
}
export interface SorgenteEmissione {
  posId: string; companyId: string; attesoUpdatedAt: string | null; snapshotId?: string;
  dati: DatiStampaPos; nomeAutore: string;
  fonti: () => Promise<unknown>;
}
/** Le fonti verificate di un'emissione: ciò che entra nel fascicolo oltre al POS e agli allegati dichiarati. */
export interface FontiEmissione {
  pscVerificato?: RiferimentoPsc; prodottiSds?: FontiProdottiPos; fontiTecniche?: FontiTecnicheEmissione;
  fontiMezzi?: FontiMezziEmissione; documentiMezzi?: FontiDocumentiMezziEmissione; requisitiAddetti?: FontiRequisitiAddettiEmissione;
}

/** Prenota (o riprende) l'emissione: per 5 minuti nessun altro può prepararla. */
export async function prenotaEmissionePos(db: Db, userId: string, sorgente: SorgenteEmissione): Promise<RigaEmissionePos> {
  const { data, error } = await db.rpc("pos_prenota_emissione", {
    _pos_id: sorgente.posId, _autore: userId, _attesa_updated_at: sorgente.attesoUpdatedAt, _snapshot_id: sorgente.snapshotId || null,
  });
  if (error) throw erroreRpc(error);
  const e = data as RigaEmissionePos;
  if (!e?.id || e.company_id !== sorgente.companyId) throw new ErroreEmissionePos("Prenotazione emissione non disponibile", 403);
  return e;
}

/** Il contenuto che si conserva: approvato, con chi approva e quando (per una copia da archivio, l'avviso che non è l'originale). */
export function datiEmissionePos(e: RigaEmissionePos, sorgente: SorgenteEmissione): DatiStampaPos {
  return { ...sorgente.dati, stato: "approvato", approvatoDa: sorgente.snapshotId ? sorgente.dati.approvatoDa : sorgente.nomeAutore,
    approvatoIl: sorgente.snapshotId ? sorgente.dati.approvatoIl : e.emesso_il,
    ...(sorgente.snapshotId ? {avvisoCopia:`COPIA PREPARATA IL ${new Date(e.emesso_il).toLocaleDateString("it-IT",{timeZone:"Europe/Rome"})} DAL CONTENUTO ARCHIVIATO. Non ricostruisce i byte dell’originale storico e non attesta firme precedenti.`} : {}) };
}

/** Verifica ogni fonte che il contenuto dichiara (PSC, SDS, schede tecniche, attrezzature, riscontri nominativi): una che non torna ferma tutto. */
export async function raccogliFontiEmissione(db: Db, userId: string, e: RigaEmissionePos, sorgente: SorgenteEmissione, dati: DatiStampaPos): Promise<FontiEmissione> {
  const fonti: FontiEmissione = {};
  if(dati.contenuto.procedure_psc.psc_presente && dati.contenuto.procedure_psc.documento) {
    if(sorgente.snapshotId)throw new ErroreEmissionePos("Il PSC storico richiede il pacchetto originale conservato; nessuna ricostruzione dal documento corrente.",409);
    const {data:posCorrente,error:posErr}=await db.from("pos_documents").select("order_id").eq("id",sorgente.posId).eq("company_id",sorgente.companyId).maybeSingle();
    if(posErr||!posCorrente?.order_id)throw new ErroreEmissionePos("Commessa del PSC non verificabile",409);
    const {data:provaPsc,error:errorePsc}=await db.rpc("pos_psc_verifica",{_company:sorgente.companyId,_ordine:posCorrente.order_id,_contenuto:dati.contenuto,_autore:userId});
    if(errorePsc||!provaPsc)throw new ErroreEmissionePos("Riferimento PSC non verificabile per questa emissione: riesamina e salva la bozza.",409);
    fonti.pscVerificato=await verificaFontePsc(db,sorgente.companyId,posCorrente.order_id,provaPsc);
  }
  if(dati.contenuto.versione_prodotti===1) {
    if(sorgente.snapshotId) throw new ErroreEmissionePos("Questa revisione richiede il fascicolo originale: le SDS riesaminate non vengono ricostruite dalle fonti correnti",409);
    const {data:prova,error:erroreProdotti}=await db.rpc("pos_prodotti_fonti_emissione",{_pos_id:sorgente.posId,_autore:userId});
    if(erroreProdotti)throw erroreRpc(erroreProdotti);
    if(!prova||prova.versione!==1||!Array.isArray(prova.prodotti)||!Array.isArray(prova.allegati))throw new ErroreEmissionePos("Fonti prodotto/SDS non disponibili",409);
    fonti.prodottiSds=prova;
  }
  if(dati.contenuto.versione_fonti_tecniche===1) {
    if(sorgente.snapshotId)throw new ErroreEmissionePos("Questa revisione richiede il fascicolo originale: i documenti tecnici non vengono ricostruiti dalle fonti correnti",409);
    const {data:prova,error:err}=await db.rpc("pos_fonti_tecniche_emissione",{_pos_id:sorgente.posId,_autore:userId});
    if(err)throw erroreRpc(err);
    if(!prova||prova.versione!==1||!Array.isArray(prova.collegamenti)||!Array.isArray(prova.allegati))throw new ErroreEmissionePos("Fonti tecniche non disponibili",409);
    fonti.fontiTecniche=prova;
  }
  if(dati.contenuto.versione_mezzi===1) {
    if(sorgente.snapshotId)throw new ErroreEmissionePos("Questa revisione richiede il fascicolo originale: le assegnazioni non vengono ricostruite dall’inventario corrente",409);
    const {data:prova,error:err}=await db.rpc("pos_mezzi_fonti_emissione",{_pos_id:sorgente.posId,_autore:userId});
    if(err)throw erroreRpc(err);
    if(!prova||prova.versione!==1||!Array.isArray(prova.collegamenti))throw new ErroreEmissionePos("Fonti attrezzatura non disponibili",409);
    fonti.fontiMezzi=prova;
  }
  if(dati.contenuto.versione_documenti_mezzi===1) {
    if(sorgente.snapshotId)throw new ErroreEmissionePos("Questa revisione richiede il fascicolo originale: i documenti della macchina non vengono ricostruiti dall’archivio corrente",409);
    const {data:prova,error:err}=await db.rpc("pos_documenti_mezzi_fonti_emissione",{_pos_id:sorgente.posId,_autore:userId});
    if(err)throw erroreRpc(err);
    if(!prova||prova.versione!==1||!Array.isArray(prova.collegamenti)||!Array.isArray(prova.allegati))throw new ErroreEmissionePos("Documenti attrezzatura non disponibili",409);
    fonti.documentiMezzi=prova;
  }
  if(dati.contenuto.versione_requisiti_addetti===1) {
    if(sorgente.snapshotId || e.origine!=="approvazione_corrente")throw new ErroreEmissionePos("Gli originali nominativi storici richiedono il pacchetto già conservato",409);
    const {data:prova,error:err}=await db.rpc("pos_requisiti_addetti_fonti_emissione",{_pos_id:sorgente.posId,_autore:userId});
    if(err)throw erroreRpc(err);
    if(!prova||prova.versione!==1||!Array.isArray(prova.collegamenti)||!Array.isArray(prova.allegati))throw new ErroreEmissionePos("Riscontri nominativi non verificabili: nessuna emissione completata");
    fonti.requisitiAddetti=prova;
  }
  return fonti;
}

/** Scarica gli allegati dichiarati e compone il pacchetto (PDF, modello, fonti, manifest, ZIP). Il PDF lo disegna il server, salvo che arrivi già pronto. */
export async function pacchettoEmissionePos(db: Db, e: RigaEmissionePos, sorgente: SorgenteEmissione, dati: DatiStampaPos, fonti: FontiEmissione, pdfPronto?: PdfProntoPos) {
  const {pscVerificato,prodottiSds,fontiTecniche,fontiMezzi,documentiMezzi,requisitiAddetti}=fonti;
  const fontiApp=await sorgente.fonti();
  return preparaPacchettoPos({ id: e.id, tentativoId: e.token, companyId: e.company_id, posId: e.pos_id, emessoIl: e.emesso_il,
    origine: e.origine, ...(e.snapshot_id ? { snapshotId: e.snapshot_id } : {}) }, dati,
    async (bucket, path) => {
      const { data: blob, error: err } = await db.storage.from(bucket).download(path);
      if (err || !blob || blob.size > 20 * 1024 * 1024) throw new Error("Allegato assente o troppo grande");
      return new Uint8Array(await blob.arrayBuffer());
    }, prodottiSds||fontiTecniche||fontiMezzi||documentiMezzi||requisitiAddetti?{fonti_app:fontiApp,...(prodottiSds?{prodotti_sds:prodottiSds}:{}),...(fontiTecniche?{fonti_tecniche:fontiTecniche}:{}),...(fontiMezzi?{mezzi_pos:fontiMezzi}:{}),...(documentiMezzi?{documenti_mezzi:documentiMezzi}:{}),...(requisitiAddetti?{requisiti_addetti:requisitiAddetti}:{})}:fontiApp, prodottiSds, fontiTecniche, fontiMezzi, documentiMezzi, requisitiAddetti, pscVerificato, pdfPronto);
}

/** Carica i file in piccoli gruppi, li rilegge confrontando l'impronta e solo allora completa l'emissione. */
export async function pubblicaPacchettoEmissione(db: Db, userId: string, e: RigaEmissionePos, sorgente: SorgenteEmissione, pacchetto: Awaited<ReturnType<typeof preparaPacchettoPos>>, pscVerificato?: RiferimentoPsc): Promise<RigaEmissionePos> {
  // Independent uploads in small batches keep memory and simultaneous connections bounded.
  for (let i = 0; i < pacchetto.oggetti.length; i += 3) {
    const risultati = await Promise.allSettled(pacchetto.oggetti.slice(i, i + 3).map(async f => {
      const { error: err } = await db.storage.from(BUCKET_EMISSIONI_POS).upload(f.path, f.bytes, { upsert: false, contentType: f.contentType });
      if (err) throw new Error("Un file dell’emissione non è stato conservato: riprova");
    }));
    const fallito = risultati.find(r => r.status === "rejected");
    if (fallito?.status === "rejected") throw fallito.reason;
  }
  for (const f of pacchetto.oggetti) {
    const { data: blob, error: err } = await db.storage.from(BUCKET_EMISSIONI_POS).download(f.path);
    if (err || !blob || blob.size !== f.bytes.length || await sha256Hex(await blob.arrayBuffer()) !== await sha256Hex(f.bytes)) throw new Error("La rilettura di un file non corrisponde all’originale: nessuna approvazione completata");
  }
  if(pscVerificato)await verificaFontePsc(db,sorgente.companyId,pscVerificato.order_id,pscVerificato);
  const { data: finale, error: err } = await db.rpc("pos_completa_emissione", {
    _id: e.id, _token: e.token, _autore: userId, _nome_autore: sorgente.nomeAutore,
    _manifest: pacchetto.manifest, _manifest_sha256: pacchetto.manifestSha256, _zip_sha256: pacchetto.zipSha256,
  });
  if (err) throw erroreRpc(err);
  if(!finale?.id || finale.stato!=="completa") throw new ErroreEmissionePos("Il server non ha confermato il completamento dell’emissione",503);
  return finale as RigaEmissionePos;
}

/**
 * Esegue i passi di una preparazione; se uno fallisce segna l'errore sulla prenotazione (così si riprova subito) e
 * toglie i file già caricati. `traccia.daRipulire` lo riempie chi ha caricato qualcosa.
 */
export async function conErroreRegistrato<T>(db: Db, e: RigaEmissionePos, passi: (traccia: { daRipulire: string[] }) => Promise<T>): Promise<T> {
  const traccia = { daRipulire: [] as string[] };
  try {
    return await passi(traccia);
  } catch (err) {
    const messaggio = err instanceof Error ? err.message : "Emissione non completata";
    // This conditional write cannot alter a completed emission or another attempt's lease.
    const {data:fallita,error:erroreStato}=await db.from("pos_emissioni").update({ stato: "errore", errore: messaggio.slice(0, 500), updated_at: new Date().toISOString() })
      .eq("id", e.id).eq("company_id", e.company_id).eq("token", e.token).eq("stato", "preparazione").select("id").maybeSingle();
    // A failed attempt cannot subsequently complete; never remove files unless that state was committed.
    if(fallita&&!erroreStato&&traccia.daRipulire.length) {
      try { await db.storage.from(BUCKET_EMISSIONI_POS).remove(traccia.daRipulire); } catch { /* private leftovers remain recoverable; do not mask the original failure */ }
    }
    throw err instanceof ErroreEmissionePos ? err : new ErroreEmissionePos(messaggio);
  }
}

/** Approves only after every frozen byte exists and has been read back with its expected hash. */
export async function conservaEmissionePos(db: Db, userId: string, sorgente: SorgenteEmissione): Promise<RigaEmissionePos> {
  const e = await prenotaEmissionePos(db, userId, sorgente);
  if (e.stato === "completa") return e;
  return conErroreRegistrato(db, e, async traccia => {
    const dati = datiEmissionePos(e, sorgente);
    const fonti = await raccogliFontiEmissione(db, userId, e, sorgente, dati);
    const pacchetto = await pacchettoEmissionePos(db, e, sorgente, dati, fonti);
    traccia.daRipulire = pacchetto.oggetti.map(f=>f.path);
    return pubblicaPacchettoEmissione(db, userId, e, sorgente, pacchetto, fonti.pscVerificato);
  });
}

/** Signed URL is issued only after the stored bytes match the immutable manifest. */
export async function scaricaEmissionePos(db: Db, companyId: string, id: string, tipo: "pdf" | "zip") {
  const { data: e, error } = await db.from("pos_emissioni").select("*").eq("id", id).eq("company_id", companyId).eq("stato", "completa").maybeSingle();
  if (error || !e) throw new ErroreEmissionePos("Emissione non disponibile", 404);
  const base = `${companyId}/${e.id}/${e.token}`;
  const path = `${base}/${tipo === "pdf" ? "POS.pdf" : "fascicolo.zip"}`;
  const atteso = tipo === "zip" ? e.zip_sha256 : (e.manifest as ManifestEmissionePos)?.file.find(f => f.ruolo === "pdf" && f.path === path)?.sha256;
  const { data: blob, error: err } = await db.storage.from(BUCKET_EMISSIONI_POS).download(path);
  if (err || !blob || blob.size > 40 * 1024 * 1024 || !atteso || await sha256Hex(await blob.arrayBuffer()) !== atteso) throw new ErroreEmissionePos("Il file conservato non corrisponde all’impronta dell’emissione: download bloccato", 409);
  const { data: link, error: linkError } = await db.storage.from(BUCKET_EMISSIONI_POS).createSignedUrl(path, 300, { download: true });
  if (linkError || !link?.signedUrl) throw new ErroreEmissionePos("Link del documento non disponibile: riprova", 503);
  return { url: link.signedUrl };
}

export function datiDaSnapshotPos(snapshot: Record<string, unknown>, revisione: number, codice: string): DatiStampaPos {
  return { contenuto: normalizzaPos(snapshot.contenuto), stato: "approvato", revisione,
    revisioni: Array.isArray(snapshot.revisioni) ? snapshot.revisioni as RevisionePos[] : [],
    approvatoDa: typeof snapshot.approvato_da_nome === "string" ? snapshot.approvato_da_nome : null,
    approvatoIl: typeof snapshot.approvato_il === "string" ? snapshot.approvato_il : null, codiceCommessa: codice };
}
