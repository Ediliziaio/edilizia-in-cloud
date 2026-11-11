import type { RigaChiesta, RigaLetta, RigaConfronto } from "./confrontoDocumentoFornitore.ts";
type RecordDati = Record<string, unknown>;
const rec = (v: unknown): RecordDati => v && typeof v === "object" && !Array.isArray(v) ? v as RecordDati : {};
const testo = (v: unknown) => typeof v === "string" ? v : null;
export interface BaseConferma {
  impronta: string;
  fonte: "invio" | "ordine_corrente";
  evento_id?: string | null;
  inviato_il?: string | null;
  documento?: RecordDati | null;
  testata: RecordDati;
  righe: RecordDati[];
  fornitore?: {nome?:string|null;email?:string|null;partita_iva?:string|null};
  allegato_fornitore?:string|null;
}
export function righeDellaBase(base: BaseConferma): Array<RigaChiesta & {rfq_item_id?:string|null}> {
  const spedite = base.fonte === "invio" && Array.isArray(base.documento?.righe) ? base.documento.righe : null;
  if (spedite) return spedite.map((v, i) => {
    const r = rec(v), s = rec(r.specifiche);
    return { chiave: testo(r.origineId) || `invio:${base.evento_id}:${i}`, descrizione: String(r.descrizione || ""),
      riferimento: testo(s.riferimento), sku: testo(s.sku), quantita: Number(r.quantita), unita: testo(r.unita),
      prezzo: r.prezzo == null ? null : Number(r.prezzo) * (1 - Number(r.sconto || 0) / 100),
      misure: rec(s.misure), colore: testo(s.colore), apertura: testo(s.apertura), dettagli: testo(s.dettagli) || testo(r.nota),
      rfq_item_id: testo(base.righe.find(x=>x.id===r.origineId)?.rfq_item_id),iva:r.iva==null?null:Number(r.iva) };
  });
  return base.righe.map(r => ({ chiave: String(r.id), descrizione: String(r.description ?? r.descrizione ?? ""),
    riferimento: testo(r.riferimento), sku: testo(r.sku), quantita: Number(r.quantity ?? r.quantita),
    unita: testo(r.unit_of_measure ?? r.unita_misura), prezzo: r.price_pending || r.unit_price == null ? null : Number(r.unit_price) * (1 - Number(r.discount_percent || 0) / 100),
    misure: rec(r.misure), colore: testo(r.colore), apertura: testo(r.apertura), dettagli: testo(r.misure_testo ?? r.note),rfq_item_id:testo(r.rfq_item_id),iva:r.vat_rate==null?null:Number(r.vat_rate) }));
}
export interface LetturaConferma {
  righe?: RigaLetta[];
  data_consegna?: string | null;
  giorni_consegna?: number | null;
  numero_documento?: string | null;
  totale_documento?: number | null;
  altri_costi?: Array<{ descrizione?: string; importo?: number | null }> | null;
  riferimenti_ordini?: string[];
  pagine_lette?: number;
  pagine_totali?: number;
  lettura_completa?: boolean;
  avvisi?: string[];
  pagamento?:string|null;
  partita_iva_fornitore?:string|null;
}
/** Nessuna interpretazione silenziosa di JSON incompleto o troncato. */
export function validaLetturaConferma(v: unknown): LetturaConferma {
  const r = rec(v);
  if (!Array.isArray(r.righe) || r.righe.length > 500) throw new Error("Il documento non contiene una lettura valida delle posizioni.");
  for (const x of r.righe) {
    const l = rec(x);
    if (!Object.keys(l).length || (l.quantita != null && (!Number.isFinite(Number(l.quantita)) || Number(l.quantita) < 0))) throw new Error("Quantità non leggibile: controlla il documento originale.");
    if(l.pagina!=null&&(!Number.isInteger(l.pagina)||Number(l.pagina)<1||Number(l.pagina)>1000)) throw new Error('Riferimento alla pagina non valido: controlla l’originale.');
  }
  for(const campo of ['pagine_lette','pagine_totali']) if(r[campo]!=null&&(!Number.isInteger(r[campo])||Number(r[campo])<1)) throw new Error('Conteggio delle pagine non valido.');
  if(r.pagine_lette&&r.pagine_totali&&Number(r.pagine_lette)>Number(r.pagine_totali))throw new Error('Conteggio delle pagine incoerente.');
  return r as LetturaConferma;
}
export function avvisiLettura(lettura: LetturaConferma, numeroOrdine: unknown): RigaConfronto[] {
  const avvisi = [...(lettura.avvisi ?? [])];
  if (lettura.lettura_completa === false || (lettura.pagine_totali && (!lettura.pagine_lette || lettura.pagine_lette < lettura.pagine_totali))) avvisi.push("Non tutte le pagine sono state lette: verifica l’originale.");
  const riferimenti = lettura.riferimenti_ordini?.filter(Boolean) ?? [];
  if (riferimenti.length > 1) avvisi.push("Il documento cita più ordini: verifica a quali posizioni appartiene ogni riga.");
  if (riferimenti.length && numeroOrdine && !riferimenti.some(r => r.toLowerCase().replace(/\W/g, "") === String(numeroOrdine).toLowerCase().replace(/\W/g, ""))) avvisi.push("Il riferimento d’ordine letto non corrisponde a questo ordine.");
  return avvisi.map((a, i): RigaConfronto => ({ chiave: `lettura:${i}`, riferimento: null, descrizione: "Controllo del documento", categoria: "generico", stato: "abbinata", esito: "da_controllare", chiesto: "Documento completo e riferito all’ordine", letto: a,
    campi: [{ campo: "Documento", chiesto: null, letto: a, esito: "da_controllare", nota: a }] }));
}
export function condizioniDocumento(base:BaseConferma,lettura:LetturaConferma):RigaConfronto[] {
  const righe:RigaConfronto[]=[];
  const aggiungi=(chiave:string,campo:string,richiesto:string,letto:string|null,nota:string)=>righe.push({chiave,riferimento:null,descrizione:campo,categoria:"generico",stato:"abbinata",esito:letto?"giallo":"da_controllare",chiesto:richiesto,letto:letto||"Non riportato",campi:[{campo,chiesto:richiesto,letto,esito:letto?"giallo":"da_controllare",nota}]});
  const pagamento=testo(base.documento?.pagamento)||testo(base.testata.pagamento);
  const norm=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,"");
  if(pagamento&&(!lettura.pagamento||norm(pagamento)!==norm(lettura.pagamento))) aggiungi("condizioni:pagamento","Pagamento",pagamento,lettura.pagamento||null,"Verifica le condizioni di pagamento concordate con il fornitore.");
  const iva=(s:string)=>s.toUpperCase().replace(/^IT/,"").replace(/\W/g,"");
  if(base.fornitore?.partita_iva&&lettura.partita_iva_fornitore&&iva(base.fornitore.partita_iva)!==iva(lettura.partita_iva_fornitore)) aggiungi("identita:fornitore","Fornitore",base.fornitore.partita_iva,lettura.partita_iva_fornitore,"La partita IVA dell’emittente è diversa: controlla a chi appartiene il documento.");
  for(const [i,c] of (lettura.altri_costi??[]).entries()) if(c.importo&&Number.isFinite(c.importo)) aggiungi(`costo:${i}`,"Costo aggiuntivo", "Da verificare nella richiesta",`${c.descrizione||'Spesa'} · ${c.importo} €`,"Voce commerciale del fornitore da verificare prima dell’approvazione.");
  return righe;
}
