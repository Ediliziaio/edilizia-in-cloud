import {SEGNALI_POS,segnalePosSvg,normalizzaSegnaliPos} from "./posSegnaletica.ts";
import { dataRomaDaIso } from "./posData.ts";
import { ICONE_POS, iconaPosSvg } from "./posIcone.ts";
import type { DocumentazioneMezzoPos } from "./posDocumentiMezzi.ts";
import { etichettaFonteMezzo, type SceltaMezzoPos } from "./posMezzi.ts";
import type { FontiTecnicheScheda } from "./posFontiTecniche.ts";
import { CAMPI_CONTESTO_TECNICO, CAMPI_RISCHIO_TECNICO, CAMPI_ATTREZZATURA_TECNICA, tecnicaPosVuota, type TecnicaLavorazionePos } from "./posTecnica.ts";
/**
 * Il POS da stampare (o salvare in PDF dalla finestra di stampa), impaginato
 * come il modello semplificato del Decreto Interministeriale 9 settembre 2014,
 * Allegato I: stessa sequenza di tabelle, stessi riferimenti all'Allegato XV,
 * caselle spuntate, firme in fondo.
 *
 * Una bozza lo dice in testa, con l'elenco delle voci che mancano: non deve
 * poter girare come POS valido.
 */
import {
  ALLEGATO_LABEL, GESTIONE_EMERGENZE_LABEL, type Lavorazione, nessuno, type PosContenuto, type ProdottoPos, type Recapito, type Soggetto,
  SVOLGIMENTO_LABEL, vociMancanti,
} from "./posModello.ts";

export interface RevisionePos {
  rev: number;
  data: string;
  descrizione: string;
}

export interface DatiStampaPos {
  contenuto: PosContenuto;
  stato: string;
  revisione: number;
  revisioni: RevisionePos[];
  approvatoDa?: string | null;
  approvatoIl?: string | null;
  codiceCommessa?: string | null;
  avvisoCopia?: string;
  /** Quando il PDF viene emesso (ISO): compare in copertina e nel piè di pagina di un POS approvato. */
  emessoIl?: string;
  /** Indirizzo della pagina pubblica di verifica di questa emissione: diventa il codice QR in copertina. */
  urlVerifica?: string;
}

const esc = (s: string | number | null | undefined) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Testo su più righe, con gli a capo. Vuoto → una riga da compilare a mano. */
const testo = (s: string | null | undefined) => (s && s.trim() ? esc(s.trim()).replace(/\n/g, "<br>") : `<span class="vuoto">&nbsp;</span>`);
const casella = (spuntata: boolean, etichetta: string) =>
  `<span class="casella">${spuntata ? "&#9746;" : "&#9744;"} ${esc(etichetta)}</span>`;

/** Una casella da sola, per le tabelle a colonne (formazione). */
const scatola = (spuntata: boolean) => `<span class="casella">${spuntata ? "&#9746;" : "&#9744;"}</span>`;

const dataIt = dataRomaDaIso;

// ── Elenchi di cantiere: Allegato XV, punto 3.2.1, lettere d) ed e) ───────────────────────────────────────────────────
// La legge chiede «l'elenco» di opere provvisionali, macchine, impianti e sostanze utilizzati nel cantiere. Le schede delle
// lavorazioni li dicono uno per uno: qui si mettono insieme, senza doppioni, con le lavorazioni in cui servono.

/** Le voci di un campo scritto a mano (una per riga, oppure separate da «;» o «,»): senza puntini, «nessuna» e voci vuote. */
export function vociElenco(libero: string): string[] {
  return libero.split(/\n|;|,/).map((x) => x.replace(/^[-•*\s]+/, "").trim()).filter((x) => x.length > 1 && !nessuno(x)).map(maiuscola);
}
const maiuscola = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** «Collante: scheda di sicurezza allegata» → «Collante»: la scheda ha la sua colonna. */
const senzaNotaSds = (s: string) => s.replace(/\s*[:\-–(]?\s*(?:si\s+allega\s+)?(?:la\s+)?(?:sched[ae]\s+di\s+sicurezza|sds)(?:\s+allegat[ae])?\)?\s*$/i, "").trim();
const chiaveVoce = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
interface VoceCantiere { voce: string; lavorazioni: number[]; dettaglio: string }
function raggruppaVoci(lavorazioni: Lavorazione[], voci: (l: Lavorazione) => Array<{ voce: string; dettaglio?: string }>): VoceCantiere[] {
  const mappa = new Map<string, VoceCantiere>();
  lavorazioni.forEach((l, i) => {
    for (const v of voci(l)) {
      const k = chiaveVoce(v.voce);
      if (!k) continue;
      const e = mappa.get(k);
      if (!e) mappa.set(k, { voce: v.voce, lavorazioni: [i + 1], dettaglio: v.dettaglio || "" });
      else { if (!e.lavorazioni.includes(i + 1)) e.lavorazioni.push(i + 1); if (!e.dettaglio && v.dettaglio) e.dettaglio = v.dettaglio; }
    }
  });
  return [...mappa.values()];
}
const numeriLavorazioni = (n: number[]) => `n. ${n.join(", ")}`;
function sdsDelProdotto(pr: ProdottoPos): string {
  if (pr.sds_necessaria === "si") return `SDS rev. ${pr.sds_revisione || "da indicare"} del ${pr.sds_data || "da indicare"}`;
  if (pr.sds_necessaria === "no") return "SDS non necessaria";
  return "SDS da valutare";
}

/** Gli elenchi di cantiere (lettere d ed e) a partire dalle lavorazioni; vuoti se non c'è nessuna lavorazione. */
export function elenchiCantiereHtml(p: PosContenuto): string {
  const senzaLavorazioni = `<p class="vuoto-blocco">Da indicare nelle schede delle lavorazioni.</p>`;
  const opere = raggruppaVoci(p.lavorazioni, (l) => vociElenco(l.opere_provvisionali).map((voce) => ({ voce })));
  const macchine = raggruppaVoci(p.lavorazioni, (l) => [
    ...vociElenco(l.macchine).map((voce) => ({ voce })),
    ...(p.versione_tecnica === 1 ? (l.tecnica?.attrezzature ?? []).filter((a) => a.nome.trim()).map((a) => ({
      voce: a.nome.trim(), dettaglio: a.anagrafica?.modalita === "inventario" && a.anagrafica.fonte ? etichettaFonteMezzo(a.anagrafica.fonte) : "" })) : []),
  ]);
  const impianti = raggruppaVoci(p.lavorazioni, (l) => vociElenco(l.impianti).map((voce) => ({ voce })));
  const righeCantiere = ([["Opera provvisionale", opere], ["Macchina o attrezzatura", macchine], ["Impianto", impianti]] as const)
    .flatMap(([tipo, voci]) => voci.map((v) => `<tr><td>${esc(tipo)}</td><td>${esc(v.voce)}${v.dettaglio ? `<br>${esc(v.dettaglio)}` : ""}</td><td>${esc(numeriLavorazioni(v.lavorazioni))}</td></tr>`)).join("");
  const cantiere = `<h3>Elenco dei ponteggi, delle opere provvisionali, delle macchine e degli impianti utilizzati in cantiere <span class="rif">(3.2.1 lettera d)</span></h3>`
    + (!p.lavorazioni.length ? senzaLavorazioni : righeCantiere
      ? `<table><tr><th style="width:24%">Tipo</th><th>Voce</th><th style="width:16%">Lavorazioni</th></tr>${righeCantiere}</table>`
      : `<p>Nessuna opera provvisionale, macchina o impianto dichiarato nelle lavorazioni.</p>`);
  const schedeAllegate = p.allegati.some((a) => a.tipo === "scheda_sicurezza");
  const sostanze = raggruppaVoci(p.lavorazioni, (l) => [
    ...vociElenco(l.sostanze).map(senzaNotaSds).filter(Boolean).map((voce) => ({ voce })),
    ...(l.prodotti || []).filter((pr) => pr.nome.trim()).map((pr) => ({ voce: `${pr.nome.trim()}${pr.produttore ? ` (${pr.produttore})` : ""}`, dettaglio: sdsDelProdotto(pr) })),
  ]);
  const righeSostanze = sostanze.map((v) => `<tr><td>${esc(v.voce)}</td><td>${esc(numeriLavorazioni(v.lavorazioni))}</td><td>${esc(v.dettaglio || (schedeAllegate ? "Vedi l'elenco degli allegati" : "Da allegare"))}</td></tr>`).join("");
  const elencoSostanze = `<h3>Elenco delle sostanze e dei preparati pericolosi utilizzati in cantiere <span class="rif">(3.2.1 lettera e)</span></h3>`
    + (!p.lavorazioni.length ? senzaLavorazioni : righeSostanze
      ? `<table><tr><th>Sostanza o preparato</th><th style="width:16%">Lavorazioni</th><th style="width:30%">Scheda di sicurezza</th></tr>${righeSostanze}</table>`
      : `<p>Nessuna sostanza o preparato pericoloso dichiarato nelle lavorazioni.</p>`);
  return cantiere + elencoSostanze;
}

function tabellaSoggetto(titolo: string, s: Soggetto | null): string {
  const v = s ?? { nominativo: "", indirizzo: "", codice_fiscale: "", telefono: "", email: "" };
  return `
    <table class="griglia">
      <tr><th colspan="2">${esc(titolo)}</th></tr>
      <tr><td class="et">Cognome e nome</td><td>${testo(v.nominativo)}</td></tr>
      <tr><td class="et">Indirizzo</td><td>${testo(v.indirizzo)}</td></tr>
      <tr><td class="et">Cod. fisc.</td><td>${testo(v.codice_fiscale)}</td></tr>
      <tr><td class="et">Tel.</td><td>${testo(v.telefono)}</td></tr>
      <tr><td class="et">Mail</td><td>${testo(v.email)}</td></tr>
    </table>`;
}

function righeRecapito(titolo: string, r: Recapito, vuotoTesto = ""): string {
  const vuoto = !r.indirizzo.trim() && !r.telefono.trim() && !r.email.trim();
  if (vuoto && vuotoTesto) return `<tr><td class="et">${esc(titolo)}</td><td colspan="3">${esc(vuotoTesto)}</td></tr>`;
  return `<tr><td class="et">${esc(titolo)}</td><td>Indirizzo: ${testo(r.indirizzo)}</td><td>Tel.: ${testo(r.telefono)}</td><td>E-mail: ${testo(r.email)}</td></tr>`;
}

function figura(titolo: string, riferimento: string, nominativo: string, mansioni: string, extra = ""): string {
  return `
    <h3>${esc(titolo)} <span class="rif">(${esc(riferimento)})</span></h3>
    ${extra}
    <table class="griglia">
      <tr><th style="width:35%">Nominativo</th><th>Mansioni specifiche svolte in cantiere ai fini della sicurezza</th></tr>
      <tr><td>${testo(nominativo)}</td><td>${testo(mansioni)}</td></tr>
    </table>`;
}

function fontiTecnicheHtml(f:FontiTecnicheScheda|undefined):string {
 if(!f||f.modalita==="da_verificare")return `<p>Fonti tecniche da scegliere e verificare.</p>`;
 if(f.modalita!=="documenti")return `<p><strong>${f.modalita==="testo_pos"?"Valutazione riportata nel POS, senza originale collegato":"Documentazione dichiarata non applicabile"}</strong>: ${testo(f.motivazione)}</p>`;
 return `<table class="griglia"><tr><th>Documenti tecnici selezionati</th><th>Revisione e provenienza</th></tr>${f.documenti.map(d=>`<tr><td>${testo(d.titolo)}<br>${testo(d.file_name)}</td><td>Rev. ${esc(d.revisione)} del ${esc(dataIt(d.data_rilascio))}<br>Stato nel fascicolo: ${esc(d.stato)}<br>Pertinenza ${d.confermata?"confermata dal compilatore":"da confermare"}<br>Riferimento: ${esc(d.id)}</td></tr>`).join("")}</table>`;
}
function mezzoHtml(v: SceltaMezzoPos | undefined): string {
 if(!v || v.modalita === "da_verificare") return `<p>Identità e impiego dell’attrezzatura da verificare.</p>`;
 const f=v.fonte;
 return `<table class="griglia"><tr><td class="et">Identità e provenienza</td><td>${v.modalita==="inventario"&&f?testo(etichettaFonteMezzo(f)):"Attrezzatura dichiarata non censita"}${v.modalita==="non_censita"?`<br>${testo(v.motivazione)}`:""}${f?`<br>Identificativo inventario: ${esc(f.mezzo_id)}<br>Stato registrato: ${esc(f.stato)}`:""}</td></tr><tr><td class="et">Impiego dichiarato nel POS</td><td>${esc(dataIt(v.utilizzo_dal))} — ${esc(dataIt(v.utilizzo_al))}<br>Quantità: ${esc(v.quantita_usata===null?"da indicare":String(v.quantita_usata))} ${esc(f?.unita||"unità")}<br>${v.confermata?"Identità e impiego confermati dal compilatore":"Identità e impiego da confermare"}</td></tr></table>${f&&(f.fonte_tipo==="corrente"||f.fonte_tipo==="su_mezzo_corrente")?`<p class="nota">È nota soltanto la collocazione corrente. Il periodo d’uso è dichiarato, senza prova dello storico di assegnazione.</p>`:""}<p class="nota">Il collegamento d’inventario non attesta manutenzione, formazione o idoneità tecnica.</p>`;
}
function documentiMezzoHtml(v:DocumentazioneMezzoPos|undefined):string {
 if(!v||v.modalita==="da_verificare")return `<p>Documenti e controlli della specifica attrezzatura da scegliere e riesaminare.</p>`;
 const documenti=v.modalita==="documenti"?`<table class="griglia"><tr><th>Originale della macchina selezionato</th><th>Revisione letta e pertinenza dichiarate</th></tr>${v.documenti.map(d=>`<tr><td>${testo(d.titolo||d.file_name)}<br>${esc(d.categoria)} · ${testo(d.file_name)}<br>Riferimento archivio: ${esc(d.id)}<br>Attrezzatura: ${esc(d.mezzo_id)}</td><td>${testo(d.revisione_dichiarata)}<br>Dal ${esc(dataIt(d.data_inizio))} · scadenza ${esc(dataIt(d.data_scadenza))}<br>${d.confermata?"Originale letto e pertinenza confermata dal compilatore":"Originale e pertinenza da verificare"}</td></tr>`).join("")}</table>`:`<p><strong>Altra gestione documentale dichiarata</strong>: ${testo(v.motivazione)}. Non attesta automaticamente esenzioni o disponibilità di originali non collegati.</p>`;
 const q=v.controlli;
 const controlli=q?`<p>Quadro registrato da riesaminare: ${q.manutenzioni.length} manutenzioni; ${q.segnalazioni.length} segnalazioni. Non costituisce un esito di idoneità.</p>${q.manutenzioni.length?`<table class="griglia"><tr><th>Intervento registrato</th><th>Prossimi controlli registrati</th></tr>${q.manutenzioni.map(m=>`<tr><td>${esc(m.tipo)} · ${esc(dataIt(m.data))}<br>Contatore: ${esc(m.contatore||"non indicato")}</td><td>${esc(dataIt(m.prossima_data))}<br>Soglia contatore: ${esc(m.prossimo_contatore||"non indicata")}</td></tr>`).join("")}</table>`:""}${q.segnalazioni.length?`<table class="griglia"><tr><th>Segnalazione registrata</th><th>Stato registrato</th></tr>${q.segnalazioni.map(x=>`<tr><td>${esc(x.tipo)} · ${esc(dataIt(x.creata_il.slice(0,10)))}</td><td>${esc(x.stato)}</td></tr>`).join("")}</table>`:""}`:`<p>Nessun quadro d’inventario collegato. Il riesame seguente è una dichiarazione del compilatore.</p>`;
 return `<h4>Documenti e controlli della specifica attrezzatura</h4>${documenti}${controlli}<p><strong>Riesame, criticità e azioni dichiarati:</strong> ${testo(v.riesame_controlli)}</p><p>${v.confermata?"Documenti e controlli riesaminati dal compilatore per l’impiego dichiarato.":"Documenti e controlli ancora da riesaminare."}</p>`;
}
function dettaglioTecnicoHtml(t: TecnicaLavorazionePos, titolo: string, fontiAttive=false, mezziAttivi=false, documentiMezziAttivi=false): string {
  const tabella=(campi:Record<string,string>,r:Record<string,unknown>)=>`<table class="griglia">${Object.entries(campi).map(([k,l])=>`<tr><td class="et">${esc(l)}</td><td>${testo(typeof r[k]==="string"?r[k]:"")}</td></tr>`).join("")}</table>`;
  return `<h3>Dettaglio tecnico — ${esc(titolo)}</h3><p>${t.riesaminata?"Riesame dichiarato nell’editor per questa lavorazione.":"Dettaglio da riesaminare per il cantiere."} Il riesame non è una firma o un’attestazione automatica di adeguatezza.</p>`+
    tabella(CAMPI_CONTESTO_TECNICO,t)+`<h3>Rischi specifici — ${esc(titolo)}</h3>`+
    (t.rischi.length?t.rischi.map((r,i)=>`<h4>Rischio ${i+1}: ${esc(r.pericolo)}</h4>${tabella(CAMPI_RISCHIO_TECNICO,r)}${fontiAttive?fontiTecnicheHtml(r.fonti):""}`).join(""):`<p>Rischi specifici da descrivere e valutare.</p>`)+
    `<h3>Attrezzature effettive — ${esc(titolo)}</h3><p>${t.attrezzature_previste==="si"?"Attrezzature previste: consultare le schede seguenti.":t.attrezzature_previste==="no"?`Assenza dichiarata: ${testo(t.motivo_senza_attrezzature)}`:"Attrezzature ancora da verificare."}</p>`+
    t.attrezzature.map((a,i)=>`<h4>Attrezzatura ${i+1}: ${esc(a.nome)}</h4>${tabella(CAMPI_ATTREZZATURA_TECNICA,a)}${mezziAttivi?mezzoHtml(a.anagrafica):""}${documentiMezziAttivi?documentiMezzoHtml(a.documentazione):""}${fontiAttive?fontiTecnicheHtml(a.fonti):""}`).join("")+`<p class="nota">I riferimenti a valutazioni, manuali e formazione sono dichiarazioni del compilatore, distinti dagli originali documentali del fascicolo.</p>`;
}

function requisitiAddettiHtml(l: import("./posModello.ts").Lavorazione): string {
  const v=l.requisiti_addetti;
  const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
  const string=(v:unknown)=>typeof v==='string'?v:'';
  if(!v)return '<h4>Requisiti nominativi della propria impresa</h4><p class="nota">Da definire per questa lavorazione.</p>';
  let html=`<h4>Requisiti nominativi della propria impresa</h4><p>${testo(`Periodo: ${v.dal} — ${v.al}\nPertinenza all’attività: ${v.adattamento}\n${v.confermata?'Collegamento dichiarato come riesaminato dall’autore; la provenienza viene ricontrollata alla finalizzazione dell’emissione.':'Da riesaminare e confermare.'}`)}</p>`;
  if(v.modalita==='altra_gestione')return html+`<p>${testo(`Lavorazione dichiarata interamente eseguita dall’impresa esterna: ${l.svolgimento_con}\nMotivazione: ${v.motivazione}`)}</p>`;
  if(!v.fonti.length)return html+'<p class="nota">Nessun riesame nominativo collegato.</p>';
  for(const f of v.fonti){
    const p=f.fotografia;
    html+=`<p>${testo(`Attività riesaminata: ${string(p.attivita)} · revisione ${string(String(p.revisione||''))}\nResponsabile: ${string(p.responsabile)} · ${string(p.ruolo_responsabile)}\nRegistro: ${f.id}\nImpronta della fotografia: ${f.impronta}`)}</p><table><thead><tr><th style="width:24%">Addetto e requisito</th><th style="width:38%">Evidenza nominativa</th><th style="width:38%">Pertinenza, limiti e decisione</th></tr></thead><tbody>`;
    for(const row of Array.isArray(p.riscontri)?p.riscontri:[]){
      const r=object(row),q=object(r.qualifica),d=object(q.dati);
      const persona=(Array.isArray(p.persone)?p.persone:[]).map(object).find(a=>a.id===r.persona_id);
      const periodi=(Array.isArray(persona?.periodi)?persona.periodi:[]).map(object).map(a=>`Periodo assegnato: ${string(a.dal)} — ${string(a.al)}${a.senza_date===true?' (assegnazione senza date: periodo dichiarato nel riesame)':''}`).join('\n');
      html+=`<tr><td>${testo(`${string(r.nominativo)}\n${string(r.mansione)}\n${periodi}\n${string(r.titolo)}\n${string(r.profilo_nome)} · v${String(r.profilo_versione||'')}`)}</td><td>${testo(r.esito==='non_applicabile'?'Non applicabile, con motivazione':`${string(d.titolo)}\n${string(d.ente)}\n${string(d.validita_dal)} — ${string(d.validita_al)||'senza scadenza dichiarata'}\nQualifica: ${string(q.id)}\nOriginale: ${string(q.fonte_id)}`)}</td><td>${testo(`${r.esito==='non_applicabile'?'Non applicabile':'Evidenza riesaminata'}\n${string(r.motivazione)}\n${string(d.limitazioni)?'Limiti: '+string(d.limitazioni):''}`)}</td></tr>`;
    }
    html+='</tbody></table>';
  }
  return html+'<p class="nota">Gli originali pertinenti sono conservati separatamente nel fascicolo dell’emissione. Il riscontro documentale non è un giudizio di idoneità né un’autorizzazione all’accesso.</p>';
}

export function costruisciHtmlPos(d: DatiStampaPos): string {
  const p = d.contenuto;
  const bozza = d.stato !== "approvato";
  const mancanti = vociMancanti(p);
  const subappalto = p.impresa.ruolo === "esecutrice_subappalto";
  const titoloCommessa = d.codiceCommessa ? ` — ${d.codiceCommessa}` : "";
  // «Via Mazzini 14, Como (CO)»: la provincia sta attaccata alla località, non è una voce a parte dell'elenco.
  const localitaProvincia = [p.opera.cantiere.localita, p.opera.cantiere.provincia ? `(${p.opera.cantiere.provincia})` : ""].filter(Boolean).join(" ");
  const indirizzoCantiere = [p.opera.cantiere.via, localitaProvincia].filter(Boolean).join(", ");
  const periodoLavori = p.opera.data_inizio || p.opera.data_fine ? `${dataIt(p.opera.data_inizio) || "…"} — ${dataIt(p.opera.data_fine) || "…"}` : "";
  const statoDocumento = !bozza
    ? `<p class="stato-doc">Revisione ${esc(d.revisione)} · approvata nell'app${d.approvatoIl ? ` il ${esc(dataIt(d.approvatoIl))}` : ""}${d.approvatoDa ? ` da ${esc(d.approvatoDa)}` : ""}${d.emessoIl ? ` · PDF emesso il ${esc(dataIt(d.emessoIl))}` : ""}</p>`
    : "";
  const verificaCopia = d.urlVerifica
    ? `<div class="verifica" data-url="${esc(d.urlVerifica)}">Per controllare che questa copia sia la revisione in vigore, inquadra il codice o apri l'indirizzo<br>${esc(d.urlVerifica)}</div>`
    : "";

  const revisioni = (d.revisioni.length ? d.revisioni : [{ rev: d.revisione, data: "", descrizione: "Prima emissione" }])
    .map((r) => `<tr><td>${esc(r.rev)}</td><td>${esc(dataIt(r.data))}</td><td>${esc(r.descrizione)}</td><td></td></tr>`)
    .join("");

  const dirigenti = p.dirigenti.length
    ? p.dirigenti.map((x) => `
        <tr><td>${testo(x.nominativo)}</td>
        <td>${casella(x.ruolo === "direttore_tecnico", "Direttore tecnico di cantiere")}<br>${casella(x.ruolo === "incaricato_art97", "Incaricato dall'impresa affidataria per i compiti dell'art. 97")}${x.ruolo === "altro" ? `<br>${casella(true, "Dirigente")}` : ""}</td>
        <td>${testo(x.mansioni_sicurezza)}</td></tr>`).join("")
    : `<tr><td>${testo("")}</td><td>${casella(false, "Direttore tecnico di cantiere")}</td><td>${testo("")}</td></tr>`;

  const preposti = p.preposti.length
    ? p.preposti.map((x) => `
        <tr><td>${testo(x.nominativo)}</td>
        <td>${casella(x.ruolo === "capocantiere", "Capo cantiere")}<br>${casella(x.ruolo === "incaricato_art97", "Incaricato dall'impresa affidataria per i compiti dell'art. 97")}<br>${casella(x.ruolo === "altro", `Altro${x.ruolo_altro ? `: ${x.ruolo_altro}` : ""}`)}</td>
        <td>${testo(x.mansioni_sicurezza)}</td></tr>`).join("")
    : `<tr><td>${testo("")}</td><td>${casella(false, "Capo cantiere")}</td><td>${testo("")}</td></tr>`;

  const addetti = p.emergenze.addetti.length
    ? p.emergenze.addetti.map((a) => `
        <tr><td>${testo(a.nominativo)}</td>
        <td>${casella(a.antincendio, "Prevenzione incendi, lotta antincendio, evacuazione, salvataggio")}<br>${casella(a.primo_soccorso, "Primo soccorso")}</td>
        <td>${testo(a.mansioni_sicurezza)}</td></tr>`).join("")
    : `<tr><td>${testo("")}</td><td>${testo("")}</td><td>${testo("")}</td></tr>`;

  const lavoratori = p.lavoratori.length
    ? p.lavoratori.map((r) => `<tr><td>${testo(r.qualifica)}</td><td class="num">${esc(r.numero)}</td><td>${testo(r.note)}</td></tr>`).join("")
    : `<tr><td>${testo("")}</td><td></td><td></td></tr>`;

  const autonomi = p.autonomi.length
    ? p.autonomi.map((a) => `
        <tr><td>Nominativo: ${testo(a.nominativo)}<br>Indirizzo: ${testo(a.indirizzo)}<br>Cod. fisc.: ${testo(a.codice_fiscale)}<br>P. IVA: ${testo(a.partita_iva)}</td>
        <td>${testo(a.attivita)}<br>Data ingresso cantiere: ${esc(dataIt(a.data_ingresso))}<br>Data uscita cantiere: ${esc(dataIt(a.data_uscita))}${a.note ? `<br>Note: ${testo(a.note)}` : ""}</td></tr>`).join("")
    : `<tr><td colspan="2">Nessun lavoratore autonomo opera in cantiere per conto dell'impresa.</td></tr>`;

  // Una riga per lavoratore e una colonna per tipo di formazione: a colpo d'occhio chi ha cosa (prima erano 6-8 righe a testa).
  const formazione = p.formazione.length
    ? p.formazione.map((f, i) => `
        <tr><td class="num">${i + 1}</td><td>${testo(f.nominativo)}</td><td>${testo(f.qualifica)}</td>
        <td class="centro">${scatola(f.base)}</td><td class="centro">${scatola(f.rischi_specifici)}</td><td class="centro">${scatola(f.rischi_cantiere)}</td><td class="centro">${scatola(f.dpi_terza_categoria)}</td>
        <td>${[f.altro.trim() ? `Altro: ${esc(f.altro.trim())}` : "", f.attestati.trim() ? `Attestati: ${esc(f.attestati.trim())}` : ""].filter(Boolean).join("<br>")}</td></tr>`).join("")
    : `<tr><td class="num">1</td><td>${testo("")}</td><td>${testo("")}</td><td class="centro">${scatola(false)}</td><td class="centro">${scatola(false)}</td><td class="centro">${scatola(false)}</td><td class="centro">${scatola(false)}</td><td>${testo("")}</td></tr>`;

  const rumore = p.rumore.righe.length
    ? p.rumore.righe.map((r) => `<tr><td>${testo(r.mansione)}</td><td>${testo(r.lavorazione)}</td><td>${testo(r.livello_sorgenti)}</td><td>${testo(r.esposizione)}</td><td>${testo(r.note)}</td></tr>`).join("")
    : `<tr><td>${testo("")}</td><td></td><td></td><td></td><td></td></tr>`;

  const lavorazioni = p.lavorazioni.length
    ? p.lavorazioni.map((l, i) => `
      <table class="griglia lavorazione">
        <tr><th class="num" style="width:6%">${i + 1}</th><th colspan="2">${esc(l.titolo || `Lavorazione n. ${i + 1}`)}</th></tr>
        <tr><td class="et" colspan="2">Descrizione della lavorazione</td><td>${testo(l.descrizione)}</td></tr>
        <tr><td class="et" colspan="2">Modalità e organizzazione della fase di lavoro</td><td>${testo(l.modalita)}</td></tr>
        <tr><td class="et" colspan="2">Sostanze e preparati pericolosi (si allegano le schede)</td><td>${testo(l.sostanze)}</td></tr>
        ${(l.prodotti||[]).length ? `<tr><td class="et" colspan="2">Prodotti identificati e SDS riesaminate</td><td>${(l.prodotti||[]).map(pr=>testo(`${pr.nome} · ${pr.produttore||"produttore non indicato"} · ${pr.codice||"codice non indicato"}
Impiego: ${pr.impiego}
Periodo: ${pr.dal} — ${pr.al||"senza fine indicata"}
SDS: ${pr.sds_necessaria==="si"?`rev. ${pr.sds_revisione||"da indicare"} del ${pr.sds_data||"da indicare"} · ${pr.sds_file_name||"file mancante"}`:pr.sds_necessaria==="no"?`non necessaria: ${pr.motivo_non_necessaria||"motivo da indicare"}`:"da valutare"}
Riferimento impiego: ${pr.impiego_id} · versione ${pr.versione}${pr.evidenza_id?` · documento ${pr.evidenza_id}`:""}`)).join("<br><br>")}</td></tr>` : ""}
        <tr><td class="et" colspan="2">Opere provvisionali</td><td>${testo(l.opere_provvisionali)}</td></tr>
        <tr><td class="et" colspan="2">Macchine</td><td>${testo(l.macchine)}</td></tr>
        <tr><td class="et" colspan="2">Impianti</td><td>${testo(l.impianti)}</td></tr>
        <tr><td class="et" colspan="2">Turni di lavoro</td><td>${testo(l.turni)}</td></tr>
        <tr><td class="et" colspan="2">Rischi</td><td>${testo(l.rischi)}</td></tr>
        <tr><td class="et" colspan="2">Misure preventive e protettive</td><td>${testo(l.misure)}</td></tr>
        <tr><td class="et" colspan="2">DPI</td><td>${testo(l.dpi)}</td></tr>
        <tr><td class="et" colspan="2">Durata presunta in giorni</td><td>${l.durata_giorni != null ? esc(l.durata_giorni) : testo("")}</td></tr>
        <tr><td class="et" colspan="2">Modalità di svolgimento</td><td>${casella(l.svolgimento === "diretto", SVOLGIMENTO_LABEL.diretto)}<br>${casella(l.svolgimento === "subappalto", `${SVOLGIMENTO_LABEL.subappalto}${l.svolgimento === "subappalto" ? `: ${l.svolgimento_con}` : ""}`)}<br>${casella(l.svolgimento === "collaborazione", `${SVOLGIMENTO_LABEL.collaborazione}${l.svolgimento === "collaborazione" ? `: ${l.svolgimento_con}` : ""}`)}</td></tr>
      </table>${normalizzaSegnaliPos(l.segnaletica).length?`<h4>Segnaletica della lavorazione</h4><p class="nota">Pittogrammi schematici per la documentazione. Ubicazione dichiarata dal compilatore; posa e presenza effettiva da verificare sul cantiere.</p>${normalizzaSegnaliPos(l.segnaletica).map(s=>`<div class="segnale-pos" data-segnale="${s.id}" style="display:flex;gap:12px;align-items:center;margin:8px 0">${segnalePosSvg(s.id)}<p>${esc(SEGNALI_POS.find(x=>x.id===s.id)!.nome)}<br>Ubicazione: ${esc(s.ubicazione||"Da definire")}<br>${esc(s.note)}</p></div>`).join("")}`:""}${p.versione_requisiti_addetti===1?requisitiAddettiHtml(l):""}${p.versione_tecnica===1?dettaglioTecnicoHtml(l.tecnica||tecnicaPosVuota(),l.titolo||`Lavorazione ${i+1}`,p.versione_fonti_tecniche===1,p.versione_mezzi===1,p.versione_documenti_mezzi===1):""}`).join("")
    : `<p class="vuoto-blocco">Nessuna lavorazione descritta.</p>`;

  // The phase list states planned DPI; it does not prove delivery to a worker.
  const dpi = [...new Set(p.lavorazioni.flatMap((l) => l.dpi.split(/\n|;/).map((x) => x.replace(/^[-•\s]+/, "").trim())).filter(Boolean))];

  const psc = p.procedure_psc;
  const procedure = psc.richieste && psc.voci.length
    ? psc.voci.map((v, i) => `<tr><td class="num">${i + 1}</td><td>${testo(v.procedura)}${v.pagina?`<br>Rif. PSC: ${esc(v.pagina)}`:""}</td><td>${testo(v.indicazioni)}${v.responsabile?`<br>Responsabile operativo: ${esc(v.responsabile)}`:""}${v.lavorazione_id?`<br>Lavorazione: ${esc(p.lavorazioni.find(l=>l.id===v.lavorazione_id)?.titolo||"Riferimento non più presente: da riesaminare")}`:""}</td></tr>`).join("")
    : "";

  const schedeProdotti = [...new Map(p.lavorazioni.flatMap(l=>l.prodotti||[]).filter(pr=>pr.evidenza_id&&pr.sds_file_name).map(pr=>[pr.evidenza_id,pr])).values()];
  const schede = p.allegati.filter((a) => a.tipo === "scheda_sicurezza");
  const altriAllegati = p.allegati.filter((a) => a.tipo !== "scheda_sicurezza");

  const avvisoBozza = bozza
    ? `<div class="bozza"><strong>BOZZA — non vale come POS approvato.</strong>${mancanti.length ? `<br>${mancanti.length === 1 ? "Manca ancora 1 contenuto minimo" : `Mancano ancora ${mancanti.length} contenuti minimi`} dell'Allegato XV:<ul>${mancanti.map((m) => `<li>${esc(m.testo)} <span class="rif">(${esc(m.riferimento)})</span></li>`).join("")}</ul>` : "<br>Tutti i contenuti minimi sono presenti: manca l'approvazione del datore di lavoro."}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<title>POS${esc(titoloCommessa)} — rev. ${esc(d.revisione)}</title>
<style>
  @page { size: A4; margin: 16mm 14mm 18mm; @bottom-right { content: "Pagina " counter(page) " di " counter(pages); font: 9pt Arial, sans-serif; color: #444; } }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #111; line-height: 1.4; margin: 0; }
  .pagina { max-width: 190mm; margin: 0 auto; padding: 8mm 0; }
  h1 { font-size: 20pt; text-align: center; margin: 18mm 0 4mm; letter-spacing: 0.04em; }
  h2 svg { width: 18px; height: 18px; vertical-align: middle; margin-right: 7px; }
  h2 { font-size: 11pt; text-transform: uppercase; background: #e8e8e8; border: 1px solid #555; padding: 4px 6px; margin: 16px 0 6px; page-break-after: avoid; }
  h3 { font-size: 10pt; margin: 12px 0 4px; page-break-after: avoid; }
  .sottotitolo { text-align: center; font-size: 11pt; margin: 0 0 10mm; }
  .rif { font-weight: normal; font-size: 8.5pt; color: #444; text-transform: none; }
  table { width: 100%; border-collapse: collapse; margin: 4px 0 8px; page-break-inside: auto; }
  tr { page-break-inside: avoid; }
  th, td { border: 1px solid #555; padding: 4px 6px; vertical-align: top; text-align: left; }
  th { background: #f2f2f2; font-weight: bold; }
  td.et { width: 32%; background: #fafafa; font-weight: bold; }
  td.num, th.num { text-align: center; width: 5%; }
  .casella { white-space: nowrap; }
  .vuoto { display: inline-block; min-width: 40mm; border-bottom: 1px dotted #888; }
  .vuoto-blocco { font-style: italic; color: #555; }
  .nota { font-size: 8.5pt; color: #444; margin-top: 3px; }
  .intro { font-style: italic; border: 1px solid #555; padding: 6px 8px; margin: 8px 0; }
  .bozza { border: 2px solid #b91c1c; color: #7f1d1d; background: #fef2f2; padding: 8px 10px; margin: 0 0 10px; }
  .bozza ul { margin: 4px 0 0 18px; padding: 0; }
  td.centro, th.centro { text-align: center; }
  .stato-doc { border: 1px solid #5a9e74; background: #ecf7f0; color: #14532d; font-weight: bold; padding: 6px 10px; margin: 4mm 0; }
  .avviso-copia { background: #fff7e6; border-color: #e8c27a; }
  .verifica { font-size: 8.5pt; color: #444; border: 1px dashed #888; padding: 6px 8px; margin: 8px 0; }
  .firme td { height: 16mm; }
  .copertina td { font-size: 10pt; }
  @media screen { body { background: #f3f3f3; } .pagina { background: #fff; padding: 12mm; margin: 10px auto; box-shadow: 0 1px 4px rgba(0,0,0,.15); } }
</style>
</head>
<body>
<div class="pagina" data-impresa="${esc(p.impresa.ragione_sociale)}" data-cantiere="${esc(indirizzoCantiere)}">
  ${avvisoBozza}
  ${d.avvisoCopia ? `<p class="intro avviso-copia">${esc(d.avvisoCopia)}</p>` : ""}
  <h1>PIANO OPERATIVO DI SICUREZZA</h1>
  <p class="sottotitolo">Modello semplificato — D.I. 9 settembre 2014, Allegato I<br>D.Lgs 81/2008, art. 89 c. 1 lett. h) e Allegato XV punto 3.2</p>
  ${statoDocumento}
  <table class="griglia copertina">
    <tr><td class="et">Impresa</td><td>${testo(p.impresa.ragione_sociale)}</td></tr>
    <tr><td class="et">Committente</td><td>${testo(p.opera.committente.nominativo)}</td></tr>
    <tr><td class="et">Cantiere</td><td>${testo(indirizzoCantiere)}</td></tr>
    <tr><td class="et">Lavori</td><td>${testo(p.opera.descrizione_attivita)}</td></tr>
    ${periodoLavori ? `<tr><td class="et">Inizio e fine lavori</td><td>${esc(periodoLavori)}</td></tr>` : ""}
    ${d.codiceCommessa ? `<tr><td class="et">Commessa</td><td>${esc(d.codiceCommessa)}</td></tr>` : ""}
  </table>
  <table>
    <tr><th style="width:8%">REV</th><th style="width:16%">DATA</th><th>DESCRIZIONE REVISIONE</th><th style="width:28%">REDAZIONE (firma)</th></tr>
    ${revisioni}
  </table>
  <p class="intro">La redazione del POS deve essere improntata su criteri di semplicità, brevità e comprensibilità, in modo da garantire la completezza e l'idoneità quale strumento di pianificazione degli interventi di prevenzione in cantiere, l'indicazione di misure di prevenzione e protezione e dei DPI, le procedure per l'attuazione delle misure da realizzare e i ruoli che vi devono provvedere.</p>
  ${verificaCopia}

  <h2>${iconaPosSvg(ICONE_POS[0].id)}Identificazione e descrizione dell'opera <span class="rif">(3.2.1)</span></h2>
  ${tabellaSoggetto("Committente", p.opera.committente)}
  ${p.opera.responsabile_lavori ? tabellaSoggetto("Responsabile dei lavori", p.opera.responsabile_lavori) : `<p class="nota">Responsabile dei lavori: non nominato.</p>`}
  <table class="griglia">
    <tr><th colspan="2">Cantiere</th></tr>
    <tr><td class="et">Via</td><td>${testo(p.opera.cantiere.via)}</td></tr>
    <tr><td class="et">Località</td><td>${testo(p.opera.cantiere.localita)}</td></tr>
    <tr><td class="et">Provincia</td><td>${testo(p.opera.cantiere.provincia)}</td></tr>
    <tr><td class="et">Inizio e fine lavori previsti</td><td>${esc(dataIt(p.opera.data_inizio)) || testo("")} — ${esc(dataIt(p.opera.data_fine)) || testo("")}</td></tr>
  </table>
  <h3>Descrizione sintetica delle attività che saranno svolte in cantiere <span class="rif">(3.2.1 lett. c)</span></h3>
  <table><tr><td>${testo(p.opera.descrizione_attivita)}</td></tr></table>
  <table class="griglia">
    <tr><td class="et">Modalità organizzative</td><td>${testo(p.opera.modalita_organizzative)}</td></tr>
    <tr><td class="et">Turni di lavoro</td><td>${testo(p.opera.turni_lavoro)}</td></tr>
  </table>

  <h2>${iconaPosSvg(ICONE_POS[1].id)}Dati identificativi dell'impresa <span class="rif">(3.2.1 lettera a) punto 1)</span></h2>
  <p>${casella(p.impresa.ruolo === "affidataria", "Impresa affidataria")} &nbsp; ${casella(p.impresa.ruolo === "affidataria_esecutrice", "Impresa affidataria ed esecutrice")} &nbsp; ${casella(subappalto, `Impresa esecutrice in subappalto a: ${subappalto ? p.impresa.subappalto_a : "____________"}`)}</p>
  <p>Le attività dell'impresa nel cantiere in oggetto hanno durata ${casella(!p.impresa.durata_oltre_200_giorni, "minore")} ${casella(p.impresa.durata_oltre_200_giorni, "maggiore")} a 200 giorni</p>
  <table class="griglia">
    <tr><td class="et">Ragione sociale</td><td colspan="3">${testo(p.impresa.ragione_sociale)}${p.impresa.partita_iva ? ` — P. IVA ${esc(p.impresa.partita_iva)}` : ""}</td></tr>
    <tr><td class="et">Datore di lavoro</td><td colspan="3">${testo(p.impresa.datore_lavoro)}</td></tr>
    ${righeRecapito("Sede legale", p.impresa.sede_legale)}
    ${righeRecapito("Sede operativa", p.impresa.sede_operativa, "Coincide con la sede legale")}
    ${righeRecapito("Uffici di cantiere", p.impresa.uffici_cantiere, "Non previsti")}
  </table>

  <h2>${iconaPosSvg(ICONE_POS[2].id)}Dirigenti e preposti <span class="rif">(3.2.1 lettera a) punto 6 e lettera b))</span></h2>
  <table>
    <tr><th style="width:28%">Nominativo — Dirigente</th><th style="width:32%">Ruolo</th><th>Mansioni specifiche svolte in cantiere ai fini della sicurezza</th></tr>
    ${dirigenti}
  </table>
  <table>
    <tr><th style="width:28%">Nominativo — Preposto</th><th style="width:32%">Ruolo</th><th>Mansioni specifiche svolte in cantiere ai fini della sicurezza</th></tr>
    ${preposti}
  </table>

  ${figura("Responsabile del servizio di prevenzione e protezione (RSPP)", "3.2.1 lettera a) punto 5 e lettera b)", p.rspp.nominativo, p.rspp.mansioni_sicurezza,
    `<p>Il ruolo di RSPP è svolto da: ${casella(p.rspp.svolto_da === "datore", "Datore di lavoro")} ${casella(p.rspp.svolto_da !== "datore", "Altra persona")} ${casella(p.rspp.svolto_da === "interno", "Interna all'impresa")} ${casella(p.rspp.svolto_da === "esterno", "Esterna (consulente)")}</p>`)}
  ${p.medico_competente.previsto
    ? figura("Medico competente (ove previsto)", "3.2.1 lettera a) punto 4; lettera b)", p.medico_competente.nominativo, p.medico_competente.mansioni_sicurezza)
    : `<h3>Medico competente <span class="rif">(3.2.1 lettera a) punto 4)</span></h3><p>Non previsto: i lavoratori non sono soggetti a sorveglianza sanitaria.</p>`}
  ${figura("Rappresentante dei lavoratori per la sicurezza (RLS o RLST)", "3.2.1 lettera a) punto 3 e lettera b)", p.rls.nominativo, p.rls.mansioni_sicurezza,
    `<p>${casella(p.rls.tipo === "rls", "Rappresentante dei lavoratori per la sicurezza aziendale (RLS)")}<br>${casella(p.rls.tipo === "rlst", "Rappresentante dei lavoratori per la sicurezza territoriale (RLST)")}</p>`)}

  <h2>${iconaPosSvg(ICONE_POS[3].id)}Organizzazione del servizio di pronto soccorso, antincendio ed evacuazione dei lavoratori <span class="rif">(3.2.1 lettera a) punto 3)</span></h2>
  <p>Gestione delle emergenze: ${casella(p.emergenze.gestione === "committente", GESTIONE_EMERGENZE_LABEL.committente)} ${casella(p.emergenze.gestione === "interna", GESTIONE_EMERGENZE_LABEL.interna)} ${casella(p.emergenze.gestione === "comune", GESTIONE_EMERGENZE_LABEL.comune)}</p>
  ${p.emergenze.gestione === "comune" ? `<p>Imprese che gestiscono insieme le emergenze: ${testo(p.emergenze.imprese_gestione_comune)}</p>` : ""}
  <h3>Lavoratori incaricati della gestione delle emergenze <span class="rif">(3.2.1 lettera a) punto 3 e lettera b)</span></h3>
  <table>
    <tr><th style="width:28%">Nominativo</th><th style="width:36%">Tipo nomina</th><th>Mansioni specifiche svolte in cantiere ai fini della sicurezza</th></tr>
    ${addetti}
  </table>

  <h2>${iconaPosSvg(ICONE_POS[4].id)}Numero e qualifica dei lavoratori operanti in cantiere per conto dell'impresa <span class="rif">(3.2.1 lettera a) punto 7)</span></h2>
  <table>
    <tr><th>Qualifica</th><th class="num">Numero</th><th>Note</th></tr>
    ${lavoratori}
  </table>
  <h3>Lavoratori autonomi operanti per conto dell'impresa <span class="rif">(3.2.1 lettera a) punto 7)</span></h3>
  <table>
    <tr><th style="width:45%">Dati identificativi</th><th>Attività svolta in cantiere dal soggetto</th></tr>
    ${autonomi}
  </table>

  <h2>${iconaPosSvg(ICONE_POS[5].id)}Documentazione in merito all'informazione ed alla formazione fornite ai lavoratori impegnati in cantiere <span class="rif">(3.2.1 lettera l)</span></h2>
  <p class="nota">Per ciascun lavoratore: informazione, formazione e addestramento ricevuti. Gli attestati sono a disposizione presso la sede dell'impresa.</p>
  <table class="matrice">
    <tr><th class="num">N</th><th style="width:19%">Lavoratori impegnati in cantiere</th><th style="width:14%">Qualifica</th><th class="centro" style="width:8%">Base</th><th class="centro" style="width:10.5%">Rischi specifici</th><th class="centro" style="width:10.5%">Rischi di cantiere</th><th class="centro" style="width:9%">DPI 3ª cat.</th><th>Altro, attestati e scadenze</th></tr>
    ${formazione}
  </table>
  <p class="nota">Base: formazione di base. Rischi specifici: rischi specifici e di mansione. Rischi di cantiere: quelli contenuti in PSC e POS. DPI 3ª cat.: DPI di terza categoria, compreso l'addestramento.</p>

  <h2>${iconaPosSvg(ICONE_POS[6].id)}Esito del rapporto di valutazione del rumore <span class="rif">(3.2.1 lettera f)</span></h2>
  <p>Il rapporto di valutazione di esposizione dei lavoratori al rumore, relativamente alle lavorazioni svolte in cantiere, è il seguente:</p>
  ${p.rumore.esito.trim() ? `<table><tr><td>${testo(p.rumore.esito)}</td></tr></table>` : ""}
  <h3>Tabella riepilogativa dei livelli di esposizione</h3>
  <table>
    <tr><th>Mansione (o nominativo)</th><th>Lavorazione</th><th>Livello di pressione sonora delle sorgenti di rumore utilizzate</th><th>Livelli di esposizione giornaliera/settimanale</th><th>Note</th></tr>
    ${rumore}
  </table>

  <h2>${iconaPosSvg(ICONE_POS[7].id)}Lavorazioni svolte in cantiere <span class="rif">(3.2.1 lettera a) punto 2 e lettere c, d, e, g, i, h)</span></h2>
  ${lavorazioni}
  ${elenchiCantiereHtml(p)}
  <h3>Elenco dei dispositivi di protezione individuale previsti dalle lavorazioni <span class="rif">(3.2.1 lettera i)</span></h3>
  <p class="nota">L’elenco indica i DPI previsti. La consegna ai singoli lavoratori richiede le relative evidenze; non è attestata dalla sola scheda di lavorazione.</p>
  ${dpi.length ? `<ul>${dpi.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : `<p class="vuoto-blocco">Da indicare nelle schede delle lavorazioni.</p>`}

  <h2>${iconaPosSvg(ICONE_POS[8].id)}Procedure complementari o di dettaglio richieste dal PSC (se previsto) <span class="rif">(3.2.1 lettera h)</span></h2>
  <p>${psc.psc_presente ? "" : "Per questo cantiere non è previsto il PSC. "}Nel PSC sono state richieste delle procedure complementari o di dettaglio: ${casella(!psc.richieste, "no")} ${casella(psc.richieste, "si")}</p>
  ${psc.psc_presente ? psc.documento ? `<table><tr><th colspan="2">Originale PSC di riferimento dichiarato dal compilatore</th></tr><tr><td>Titolo / file</td><td>${esc(psc.documento.titolo)} · ${esc(psc.documento.file_name)}</td></tr><tr><td>Revisione / data</td><td>${esc(psc.documento.revisione)} · ${esc(psc.documento.data_documento||"Non indicata")}</td></tr><tr><td>Identificazione</td><td>${esc(psc.documento.archivio)} · ${esc(psc.documento.id)}</td></tr><tr><td>SHA-256</td><td>${esc(psc.documento.sha256)}</td></tr></table><p class="nota">Il riferimento identifica il file consultato; non attesta la verifica tecnica del PSC o della coerenza del POS.</p>` : `<p class="nota">Originale PSC non collegato: riferimento documentale da completare.</p>` : ""}
  ${procedure ? `<table><tr><th class="num">N</th><th>Procedura richiesta nel PSC</th><th>Indicazioni complementari e di dettaglio</th></tr>${procedure}</table>` : ""}

  <h2>${iconaPosSvg(ICONE_POS[9].id)}Elenco allegati obbligatori</h2>
  <p>${casella(schede.length > 0 || schedeProdotti.length > 0, "Schede di sicurezza delle sostanze e preparati pericolosi")}</p>
  ${schede.length ? `<ul>${schede.map((a) => `<li>${esc(a.nome)}</li>`).join("")}</ul>` : ""}
  ${schedeProdotti.length ? `<ul>${schedeProdotti.map(pr=>`<li>${esc(pr.sds_file_name||"")} · ${esc(pr.nome)} · revisione ${esc(pr.sds_revisione||"non indicata")} · ${esc(pr.evidenza_id||"")}</li>`).join("")}</ul>` : ""}
  ${altriAllegati.length ? `<ul>${altriAllegati.map((a) => `<li>${esc(ALLEGATO_LABEL[a.tipo])}: ${esc(a.nome)}</li>`).join("")}</ul>` : ""}

  <h2>${iconaPosSvg(ICONE_POS[10].id)}Firme</h2>
  <p>Il presente documento è composto da n. ______ pagine.</p>
  <table class="firme">
    <tr><th style="width:52%">Il datore di lavoro dell'impresa</th><th style="width:18%">Data</th><th>Firma</th></tr>
    <tr><td>${testo(p.impresa.datore_lavoro)}</td><td></td><td></td></tr>
    <tr><th>Il RLS / RLST per consultazione</th><th>Data</th><th>Firma</th></tr>
    <tr><td>${testo(p.rls.nominativo)}</td><td></td><td></td></tr>
    ${subappalto ? `<tr><th>Il datore di lavoro dell'impresa affidataria, per congruenza del presente documento rispetto al proprio POS</th><th>Data</th><th>Firma</th></tr><tr><td>${testo(p.impresa.subappalto_a)}</td><td></td><td></td></tr>` : ""}
    ${psc.psc_presente ? `<tr><th>Il CSE, se presente, per verifica di coerenza con il PSC</th><th>Data</th><th>Firma</th></tr><tr><td></td><td></td><td></td></tr>` : ""}
  </table>
  ${!bozza && d.approvatoDa ? `<p class="nota">Approvato nell'app da ${esc(d.approvatoDa)}${d.approvatoIl ? ` il ${esc(dataIt(d.approvatoIl))}` : ""}. L'approvazione nell'app non sostituisce le firme.</p>` : ""}
</div>
</body>
</html>`;
}
