import {normalizzaRiferimentoPsc, type RiferimentoPsc} from "./posPsc.ts";
import type {RequisitiAddettiPos} from "./posRequisitiAddetti.ts";
import type {DocumentazioneMezzoPos} from "./posDocumentiMezzi.ts";
import type { SceltaMezzoPos } from "./posMezzi.ts";
import type { FontiTecnicheScheda } from "./posFontiTecniche.ts";
import { zipSync, strToU8 } from "fflate";
import { VERSIONE_RENDERER_POS } from "./posRenderer.ts";
import type { ProdottoPos } from "./posProdotti.ts";
import type { DatiStampaPos } from "./posHtml.ts";
import { sha256Hex } from "./improntaDocumento.ts";
import { percorsoStorageSicuro } from "./posPercorsi.ts";
export { percorsoStorageSicuro };

export const BUCKET_EMISSIONI_POS = "pos-emissioni";
const LIMITE_ALLEGATO = 20 * 1024 * 1024;
const LIMITE_ALLEGATI = 30 * 1024 * 1024;
export interface IdentitaEmissionePos {
  id: string; tentativoId: string; companyId: string; posId: string; emessoIl: string;
  origine: "approvazione_corrente" | "ricostruzione_da_contenuto_archiviato";
  snapshotId?: string;
}
export interface FileEmissionePos {
  ruolo: "pdf" | "allegato" | "modello_html" | "fonti";
  nome: string; path: string; sha256: string; dimensione: number;
  tipo?: string; nomeOriginale?: string; fonte?: { bucket: string; path: string };
  mezzo_id?: string; persona_id?: string;
  evidenza_id?: string; impronta_metadati?: string;
}
export interface ManifestEmissionePos {
  versione: 1; emissioneId: string; companyId: string; posId: string; revisione: number;
  preparataIl: string; origine: IdentitaEmissionePos["origine"]; snapshotId?: string;
  generatore: string; contenutoSha256: string; fonts: Array<{ nome: string; sha256: string }>;
  file: FileEmissionePos[];
  avvertenza: string;
  psc?: RiferimentoPsc;
  prodotti_sds?: {versione:1;prodotti:ProdottoPos[]};
  mezzi_pos?: FontiMezziEmissione;
  requisiti_addetti?: {versione:1;collegamenti:FontiRequisitiAddettiEmissione["collegamenti"]};
  documenti_mezzi?: {versione:1;collegamenti:FontiDocumentiMezziEmissione["collegamenti"]};
  fonti_tecniche?: {versione:1;collegamenti:FontiTecnicheEmissione["collegamenti"]};
}
export interface FontiRequisitiAddettiEmissione {versione:1;collegamenti:Array<{lavorazione:number;lavorazione_id:string;requisiti:RequisitiAddettiPos}>;allegati:Array<{evidenza_id:string;persona_id:string;bucket:"hr-documenti";path:string;nome:string;impronta:string}>;}
export interface FontiDocumentiMezziEmissione {versione:1;collegamenti:Array<{lavorazione:number;lavorazione_id:string;scheda_id:string;documentazione:DocumentazioneMezzoPos}>;allegati:Array<{evidenza_id:string;mezzo_id:string;bucket:"mezzi-documenti";path:string;nome:string;impronta:string}>;}
export interface FontiMezziEmissione { versione:1;collegamenti:Array<{lavorazione:number;lavorazione_id:string;scheda_id:string;anagrafica:SceltaMezzoPos}>; }
export interface FontiTecnicheEmissione { versione:1;collegamenti:Array<{lavorazione:number;lavorazione_id:string;tipo:string;scheda_id:string;fonti:FontiTecnicheScheda}>;allegati:Array<{evidenza_id:string;bucket:"fascicoli-cantiere";path:string;nome:string;impronta:string}>; }
export interface FontiProdottiPos {
 versione:1;prodotti:ProdottoPos[];
 allegati:Array<{evidenza_id:string;bucket:"fascicoli-cantiere";path:string;nome:string;impronta:string}>;
}
/** Un PDF già disegnato (dal browser) con il suo modello HTML: il pacchetto lo conserva com'è invece di disegnarlo con pdfmake. */
export interface PdfProntoPos { bytes: Uint8Array; html: string; fonts: Array<{ nome: string; sha256: string }>; generatore: string }
export function jsonCanonico(v: unknown): string {
  if (v === null || typeof v === "string" || typeof v === "boolean") return JSON.stringify(v);
  if (typeof v === "number" && Number.isFinite(v)) return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(jsonCanonico).join(",")}]`;
  if (v && typeof v === "object" && Object.getPrototypeOf(v)!==Object.prototype && Object.getPrototypeOf(v)!==null) throw new Error("Il contenuto da conservare contiene un oggetto non serializzabile");
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${jsonCanonico((v as Record<string, unknown>)[k])}`).join(",")}}`;
  throw new Error("Il contenuto da conservare contiene un valore non serializzabile");
}
function nomeSicuro(nome: string): string {
  const n = nome.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^\.+/, "").slice(-120);
  return n || "documento";
}
/** Gli allegati del POS li carica l'editor: <azienda>/pos/<pos>/<uuid>-<nome senza caratteri speciali>. */
export function validaPathAllegatoPos(path: string, companyId: string, posId: string) {
  const prefisso = `${companyId}/pos/${posId}/`;
  if (!percorsoStorageSicuro(path) || !path.startsWith(prefisso) || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(path.slice(prefisso.length))) {
    throw new Error("Un allegato non appartiene al fascicolo di questo POS: correggi l’associazione prima di emettere");
  }
}

/** No requests to arbitrary URLs; the caller downloads only the validated private storage path. */
export async function preparaPacchettoPos(
  identita: IdentitaEmissionePos,
  dati: DatiStampaPos,
  scarica: (bucket: string, path: string) => Promise<Uint8Array>,
  fonti: unknown,
  prodottiSds?: FontiProdottiPos,
  fontiTecniche?:FontiTecnicheEmissione,
  fontiMezzi?:FontiMezziEmissione,
  documentiMezzi?:FontiDocumentiMezziEmissione,
  requisitiAddetti?:FontiRequisitiAddettiEmissione,
  pscVerificato?:RiferimentoPsc,
  pdfPronto?:PdfProntoPos,
) {
  if (dati.stato !== "approvato") throw new Error("Il contenuto POS deve essere approvato prima dell’emissione");
  for (const id of [identita.id, identita.tentativoId, identita.companyId, identita.posId]) if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error("Identità emissione non valida");
  if (dati.contenuto.versione_prodotti===1 && (!prodottiSds || prodottiSds.versione!==1 || !Array.isArray(prodottiSds.prodotti) || !Array.isArray(prodottiSds.allegati))) throw new Error("Fonti prodotto/SDS non verificate: emissione non completata");
  if(dati.contenuto.versione_fonti_tecniche===1&&(!fontiTecniche||fontiTecniche.versione!==1||!Array.isArray(fontiTecniche.collegamenti)||!Array.isArray(fontiTecniche.allegati)))throw new Error("Fonti tecniche non verificate: emissione non completata");
  if(dati.contenuto.versione_mezzi===1&&(!fontiMezzi||fontiMezzi.versione!==1||!Array.isArray(fontiMezzi.collegamenti)))throw new Error("Fonti attrezzatura non verificate: emissione non completata");
  if(dati.contenuto.versione_documenti_mezzi===1&&(!documentiMezzi||documentiMezzi.versione!==1||!Array.isArray(documentiMezzi.collegamenti)||!Array.isArray(documentiMezzi.allegati)))throw new Error("Documenti attrezzatura non verificati: emissione non completata");
  if(dati.contenuto.versione_requisiti_addetti===1&&(!requisitiAddetti||requisitiAddetti.versione!==1||!Array.isArray(requisitiAddetti.collegamenti)||!Array.isArray(requisitiAddetti.allegati)))throw new Error("Riscontri nominativi non verificati: emissione non completata");
  const psc=dati.contenuto.procedure_psc.psc_presente?normalizzaRiferimentoPsc(dati.contenuto.procedure_psc.documento):undefined;
  if(psc && (identita.origine!=="approvazione_corrente" || !pscVerificato || psc.company_id!==identita.companyId || jsonCanonico(psc)!==jsonCanonico(pscVerificato)))throw new Error("Originale PSC non verificato per questa emissione: nessuna ricostruzione dalle fonti correnti.");
  if ((psc?1:0)+dati.contenuto.allegati.length+(requisitiAddetti?.allegati.length||0)+(prodottiSds?.allegati.length||0)+(fontiTecniche?.allegati.length||0)+(documentiMezzi?.allegati.length||0) > 80) throw new Error("Il fascicolo supera il limite di 80 allegati per emissione");
  const base = `${identita.companyId}/${identita.id}/${identita.tentativoId}`;
  const zip: Record<string, Uint8Array> = {};
  const oggetti: Array<{ path: string; bytes: Uint8Array; contentType: string }> = [];
  const file: FileEmissionePos[] = [];
  const aggiungi = async (nome: string, bytes: Uint8Array, ruolo: FileEmissionePos["ruolo"], contentType: string, extra: Partial<FileEmissionePos> = {}) => {
    const path = `${base}/${nome}`;
    zip[nome] = bytes;
    oggetti.push({ path, bytes, contentType });
    file.push({ ruolo, nome, path, sha256: await sha256Hex(bytes), dimensione: bytes.length, ...extra });
  };
  let totale = 0;
  if(psc) {
    const bucket=psc.archivio==="sicurezza_documenti"?"sicurezza-documenti":"fascicoli-cantiere";
    let bytes:Uint8Array;
    try{bytes=new Uint8Array(await scarica(bucket,psc.file_path));}catch{throw new Error("Originale PSC non disponibile: emissione non completata.");}
    if(!bytes.length || bytes.length>LIMITE_ALLEGATO || await sha256Hex(bytes)!==psc.sha256)throw new Error("I byte del PSC non coincidono con il riferimento scelto o superano 20 MB: riesamina il PSC.");
    totale+=bytes.length;
    await aggiungi(`allegati/PSC-${nomeSicuro(psc.file_name)}`,bytes,"allegato","application/octet-stream",{tipo:"psc",nomeOriginale:psc.file_name,evidenza_id:psc.id,fonte:{bucket,path:psc.file_path}});
  }
  // Fetch every declared attachment first. One missing or excessive file aborts the entire package.
  for (const [i, a] of dati.contenuto.allegati.entries()) {
    validaPathAllegatoPos(a.file_path, identita.companyId, identita.posId);
    let bytes: Uint8Array;
    try { bytes = new Uint8Array(await scarica("sicurezza-documenti", a.file_path)); }
    catch { throw new Error(`Allegato ${i + 1} «${a.nome}» non disponibile: emissione non completata`); }
    if (!bytes.length) throw new Error(`L’allegato ${i + 1} «${a.nome}» è vuoto`);
    totale += bytes.length;
    if (bytes.length > LIMITE_ALLEGATO || totale > LIMITE_ALLEGATI) throw new Error("Il fascicolo supera i limiti di emissione: 20 MB per allegato, 30 MB complessivi");
    await aggiungi(`allegati/${String(i + 1).padStart(3, "0")}-${nomeSicuro(a.nome)}`, bytes, "allegato", "application/octet-stream", { tipo: a.tipo, nomeOriginale: a.nome, fonte: { bucket: "sicurezza-documenti", path: a.file_path } });
  }
  // Paths below are resolved by the service-only source verifier, never accepted from POS JSON.
  const idsSds=new Set<string>();
  for(const [i,a] of (prodottiSds?.allegati||[]).entries()) {
    const prefix=`${identita.companyId}/${a.evidenza_id}/`;
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(a.evidenza_id)||a.bucket!=="fascicoli-cantiere"||!a.path.startsWith(prefix)||a.path.length<=prefix.length||!percorsoStorageSicuro(a.path)||!/^[0-9a-f]{64}$/i.test(a.impronta)||idsSds.has(a.evidenza_id)) throw new Error("Riferimento SDS del fascicolo non valido");
    idsSds.add(a.evidenza_id);
    let bytes:Uint8Array;
    try{bytes=new Uint8Array(await scarica(a.bucket,a.path));}catch{throw new Error(`SDS «${a.nome}» non disponibile: emissione non completata`);}
    if(!bytes.length)throw new Error(`La SDS «${a.nome}» è vuota`);
    totale+=bytes.length;
    if(bytes.length>LIMITE_ALLEGATO||totale>LIMITE_ALLEGATI)throw new Error("Il fascicolo supera i limiti di emissione: 20 MB per allegato, 30 MB complessivi");
    await aggiungi(`allegati/SDS-${String(i+1).padStart(3,'0')}-${nomeSicuro(a.nome)}`,bytes,"allegato","application/octet-stream",{tipo:"scheda_sicurezza",nomeOriginale:a.nome,evidenza_id:a.evidenza_id,impronta_metadati:a.impronta,fonte:{bucket:a.bucket,path:a.path}});
  }
  const idsTecnici=new Set<string>();
  for(const [i,a] of (fontiTecniche?.allegati||[]).entries()) {
    const prefix=`${identita.companyId}/${a.evidenza_id}/`;
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(a.evidenza_id)||a.bucket!=="fascicoli-cantiere"||!a.path.startsWith(prefix)||a.path.length<=prefix.length||!percorsoStorageSicuro(a.path)||!/^[0-9a-f]{64}$/i.test(a.impronta)||idsTecnici.has(a.evidenza_id))throw new Error("Riferimento tecnico del fascicolo non valido");
    idsTecnici.add(a.evidenza_id);
    let bytes:Uint8Array;
    try{bytes=new Uint8Array(await scarica(a.bucket,a.path));}catch{throw new Error(`Documento tecnico «${a.nome}» non disponibile: emissione non completata`);}
    if(!bytes.length)throw new Error(`Il documento tecnico «${a.nome}» è vuoto`);
    totale+=bytes.length;
    if(bytes.length>LIMITE_ALLEGATO||totale>LIMITE_ALLEGATI)throw new Error("Il fascicolo supera i limiti di emissione: 20 MB per allegato, 30 MB complessivi");
    await aggiungi(`allegati/TECNICO-${String(i+1).padStart(3,'0')}-${nomeSicuro(a.nome)}`,bytes,"allegato","application/octet-stream",{tipo:"evidenza_tecnica",nomeOriginale:a.nome,evidenza_id:a.evidenza_id,impronta_metadati:a.impronta,fonte:{bucket:a.bucket,path:a.path}});
  }
  const idsDocumentiMezzi=new Set<string>();
  for(const [i,a] of (documentiMezzi?.allegati||[]).entries()) {
    const prefix=`${identita.companyId}/${a.mezzo_id}/`;
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(a.evidenza_id)||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(a.mezzo_id)||a.bucket!=="mezzi-documenti"||!a.path.startsWith(prefix)||a.path.length<=prefix.length||!percorsoStorageSicuro(a.path)||a.path.split("/").length!==3||!/^[0-9a-f]{64}$/i.test(a.impronta)||idsDocumentiMezzi.has(a.evidenza_id))throw new Error("Riferimento originale dell’attrezzatura non valido");
    idsDocumentiMezzi.add(a.evidenza_id);
    let bytes:Uint8Array;
    try{bytes=new Uint8Array(await scarica(a.bucket,a.path));}catch{throw new Error(`Originale attrezzatura «${a.nome}» non disponibile: emissione non completata`);}
    if(!bytes.length)throw new Error(`L’originale attrezzatura «${a.nome}» è vuoto`);
    totale+=bytes.length;if(bytes.length>LIMITE_ALLEGATO||totale>LIMITE_ALLEGATI)throw new Error("Il fascicolo supera i limiti di emissione: 20 MB per allegato, 30 MB complessivi");
    await aggiungi(`allegati/ATTREZZATURA-${String(i+1).padStart(3,'0')}-${nomeSicuro(a.nome)}`,bytes,"allegato","application/octet-stream",{tipo:"documento_attrezzatura",nomeOriginale:a.nome,evidenza_id:a.evidenza_id,mezzo_id:a.mezzo_id,impronta_metadati:a.impronta,fonte:{bucket:a.bucket,path:a.path}});
  }
  const idsFormativi=new Set<string>();
  for(const [i,a] of (requisitiAddetti?.allegati||[]).entries()) {
    const prefix=`${identita.companyId}/${a.persona_id}/`;
    if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(a.evidenza_id)||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(a.persona_id)||a.bucket!=="hr-documenti"||!a.path.startsWith(prefix)||a.path.length<=prefix.length||!percorsoStorageSicuro(a.path)||a.path.split("/").length!==3||!/^[0-9a-f]{64}$/i.test(a.impronta)||idsFormativi.has(a.evidenza_id))throw new Error("Riferimento formativo non pertinente all’addetto della propria impresa");
    idsFormativi.add(a.evidenza_id);
    let bytes:Uint8Array;
    try{bytes=new Uint8Array(await scarica(a.bucket,a.path));}catch{throw new Error(`Originale formativo «${a.nome}» non disponibile: emissione non completata`);}
    if(!bytes.length)throw new Error(`L’originale formativo «${a.nome}» è vuoto`);
    totale+=bytes.length;if(bytes.length>LIMITE_ALLEGATO||totale>LIMITE_ALLEGATI)throw new Error("Il fascicolo supera i limiti di emissione: 20 MB per allegato, 30 MB complessivi");
    await aggiungi(`allegati/FORMAZIONE-${String(i+1).padStart(3,'0')}-${nomeSicuro(a.nome)}`,bytes,"allegato","application/octet-stream",{tipo:"qualifica_addetto",nomeOriginale:a.nome,evidenza_id:a.evidenza_id,persona_id:a.persona_id,impronta_metadati:a.impronta,fonte:{bucket:a.bucket,path:a.path}});
  }
  // pdfmake si carica solo se il PDF lo disegna il server: un avvio a freddo che non lo usa non ne paga l'importazione.
  const pdf = pdfPronto ?? await (await import("./posPdf.ts")).generaPdfPos(dati, identita.emessoIl);
  await aggiungi("POS.pdf", pdf.bytes, "pdf", "application/pdf");
  await aggiungi("modello.html", strToU8(pdf.html), "modello_html", "text/html");
  await aggiungi("fonti.json", strToU8(jsonCanonico(fonti)), "fonti", "application/json");
  const manifest: ManifestEmissionePos = {
    versione: 1, emissioneId: identita.id, companyId: identita.companyId, posId: identita.posId,
    revisione: dati.revisione, preparataIl: identita.emessoIl, origine: identita.origine,
    ...(identita.snapshotId ? { snapshotId: identita.snapshotId } : {}),
    ...(psc?{psc}:{}),
    ...(prodottiSds?{prodotti_sds:{versione:1 as const,prodotti:prodottiSds.prodotti}}:{}),
    ...(requisitiAddetti?{requisiti_addetti:{versione:1 as const,collegamenti:requisitiAddetti.collegamenti}}:{}),
    ...(documentiMezzi?{documenti_mezzi:{versione:1 as const,collegamenti:documentiMezzi.collegamenti}}:{}),...(fontiMezzi?{mezzi_pos:fontiMezzi}:{}),...(fontiTecniche?{fonti_tecniche:{versione:1 as const,collegamenti:fontiTecniche.collegamenti}}:{}),
    generatore: pdfPronto?.generatore ?? VERSIONE_RENDERER_POS, contenutoSha256: await sha256Hex(strToU8(jsonCanonico(dati))), fonts: pdf.fonts, file,
    avvertenza: identita.origine === "approvazione_corrente"
      ? "L’approvazione interna non sostituisce le firme. Gli allegati sono conservati separatamente nei byte originali, senza fusione o modifica."
      : "Copia preparata ora dal contenuto archiviato. Non ricostruisce i byte di un PDF o di allegati storici non conservati all’epoca; non attesta firme precedenti.",
  };
  const manifestBytes = strToU8(jsonCanonico(manifest));
  zip["manifest.json"] = manifestBytes;
  oggetti.push({ path: `${base}/manifest.json`, bytes: manifestBytes, contentType: "application/json" });
  const fascicolo = zipSync(zip, { level: 0, mtime: new Date(identita.emessoIl) });
  if (fascicolo.length > 38 * 1024 * 1024) throw new Error("Il pacchetto POS supera il limite di 38 MB");
  oggetti.push({ path: `${base}/fascicolo.zip`, bytes: fascicolo, contentType: "application/zip" });
  return { manifest, manifestSha256: await sha256Hex(manifestBytes), zipSha256: await sha256Hex(fascicolo), oggetti,
    pdfPath: `${base}/POS.pdf`, zipPath: `${base}/fascicolo.zip`, manifestPath: `${base}/manifest.json` };
}
