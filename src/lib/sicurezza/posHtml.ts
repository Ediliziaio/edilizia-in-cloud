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
  ALLEGATO_LABEL, GESTIONE_EMERGENZE_LABEL, type PosContenuto, type Recapito, type Soggetto,
  SVOLGIMENTO_LABEL, vociMancanti,
} from "../../../supabase/functions/_shared/posModello";

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

function dataIt(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso);
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

export function costruisciHtmlPos(d: DatiStampaPos): string {
  const p = d.contenuto;
  const bozza = d.stato !== "approvato";
  const mancanti = vociMancanti(p);
  const subappalto = p.impresa.ruolo === "esecutrice_subappalto";
  const titoloCommessa = d.codiceCommessa ? ` — ${d.codiceCommessa}` : "";
  const indirizzoCantiere = [p.opera.cantiere.via, p.opera.cantiere.localita, p.opera.cantiere.provincia ? `(${p.opera.cantiere.provincia})` : ""]
    .filter(Boolean).join(", ");

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

  const formazione = p.formazione.length
    ? p.formazione.map((f, i) => `
        <tr><td class="num">${i + 1}</td><td>${testo(f.nominativo)}</td><td>${testo(f.qualifica)}</td>
        <td>${casella(f.base, "base")}<br>${casella(f.rischi_specifici, "rischi specifici e di mansione")}<br>${casella(f.rischi_cantiere, "rischi di cantiere contenuti in PSC e POS")}<br>${casella(f.dpi_terza_categoria, "DPI 3ª cat. (compreso addestramento)")}<br>${casella(!!f.altro.trim(), `Altro${f.altro.trim() ? `: ${f.altro.trim()}` : ""}`)}${f.attestati ? `<div class="nota">Attestati: ${esc(f.attestati)}</div>` : ""}</td></tr>`).join("")
    : `<tr><td class="num">1</td><td>${testo("")}</td><td>${testo("")}</td><td>${testo("")}</td></tr>`;

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
        <tr><td class="et" colspan="2">Opere provvisionali</td><td>${testo(l.opere_provvisionali)}</td></tr>
        <tr><td class="et" colspan="2">Macchine</td><td>${testo(l.macchine)}</td></tr>
        <tr><td class="et" colspan="2">Impianti</td><td>${testo(l.impianti)}</td></tr>
        <tr><td class="et" colspan="2">Turni di lavoro</td><td>${testo(l.turni)}</td></tr>
        <tr><td class="et" colspan="2">Rischi</td><td>${testo(l.rischi)}</td></tr>
        <tr><td class="et" colspan="2">Misure preventive e protettive</td><td>${testo(l.misure)}</td></tr>
        <tr><td class="et" colspan="2">DPI</td><td>${testo(l.dpi)}</td></tr>
        <tr><td class="et" colspan="2">Durata presunta in giorni</td><td>${l.durata_giorni != null ? esc(l.durata_giorni) : testo("")}</td></tr>
        <tr><td class="et" colspan="2">Modalità di svolgimento</td><td>${casella(l.svolgimento === "diretto", SVOLGIMENTO_LABEL.diretto)}<br>${casella(l.svolgimento === "subappalto", `${SVOLGIMENTO_LABEL.subappalto}${l.svolgimento === "subappalto" ? `: ${l.svolgimento_con}` : ""}`)}<br>${casella(l.svolgimento === "collaborazione", `${SVOLGIMENTO_LABEL.collaborazione}${l.svolgimento === "collaborazione" ? `: ${l.svolgimento_con}` : ""}`)}</td></tr>
      </table>`).join("")
    : `<p class="vuoto-blocco">Nessuna lavorazione descritta.</p>`;

  // Lettera i): elenco dei DPI forniti, dalle schede delle lavorazioni.
  const dpi = [...new Set(p.lavorazioni.flatMap((l) => l.dpi.split(/\n|;/).map((x) => x.replace(/^[-•\s]+/, "").trim())).filter(Boolean))];

  const psc = p.procedure_psc;
  const procedure = psc.richieste && psc.voci.length
    ? psc.voci.map((v, i) => `<tr><td class="num">${i + 1}</td><td>${testo(v.procedura)}</td><td>${testo(v.indicazioni)}</td></tr>`).join("")
    : "";

  const schede = p.allegati.filter((a) => a.tipo === "scheda_sicurezza");
  const altriAllegati = p.allegati.filter((a) => a.tipo !== "scheda_sicurezza");

  const avvisoBozza = bozza
    ? `<div class="bozza"><strong>BOZZA — non vale come POS approvato.</strong>${mancanti.length ? `<br>Mancano ancora ${mancanti.length} contenuti minimi dell'Allegato XV:<ul>${mancanti.map((m) => `<li>${esc(m.testo)} <span class="rif">(${esc(m.riferimento)})</span></li>`).join("")}</ul>` : "<br>Tutti i contenuti minimi sono presenti: manca l'approvazione del datore di lavoro."}</div>`
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
  .firme td { height: 16mm; }
  .copertina td { font-size: 10pt; }
  @media screen { body { background: #f3f3f3; } .pagina { background: #fff; padding: 12mm; margin: 10px auto; box-shadow: 0 1px 4px rgba(0,0,0,.15); } }
</style>
</head>
<body>
<div class="pagina">
  ${avvisoBozza}
  <h1>PIANO OPERATIVO DI SICUREZZA</h1>
  <p class="sottotitolo">Modello semplificato — D.I. 9 settembre 2014, Allegato I<br>D.Lgs 81/2008, art. 89 c. 1 lett. h) e Allegato XV punto 3.2</p>
  <table class="griglia copertina">
    <tr><td class="et">Impresa</td><td>${testo(p.impresa.ragione_sociale)}</td></tr>
    <tr><td class="et">Cantiere</td><td>${testo(indirizzoCantiere)}</td></tr>
    <tr><td class="et">Lavori</td><td>${testo(p.opera.descrizione_attivita)}</td></tr>
    ${d.codiceCommessa ? `<tr><td class="et">Commessa</td><td>${esc(d.codiceCommessa)}</td></tr>` : ""}
  </table>
  <table>
    <tr><th style="width:8%">REV</th><th style="width:16%">DATA</th><th>DESCRIZIONE REVISIONE</th><th style="width:28%">REDAZIONE (firma)</th></tr>
    ${revisioni}
  </table>
  <p class="intro">La redazione del POS deve essere improntata su criteri di semplicità, brevità e comprensibilità, in modo da garantire la completezza e l'idoneità quale strumento di pianificazione degli interventi di prevenzione in cantiere, l'indicazione di misure di prevenzione e protezione e dei DPI, le procedure per l'attuazione delle misure da realizzare e i ruoli che vi devono provvedere.</p>

  <h2>Identificazione e descrizione dell'opera <span class="rif">(3.2.1)</span></h2>
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

  <h2>Dati identificativi dell'impresa <span class="rif">(3.2.1 lettera a) punto 1)</span></h2>
  <p>${casella(p.impresa.ruolo === "affidataria", "Impresa affidataria")} &nbsp; ${casella(p.impresa.ruolo === "affidataria_esecutrice", "Impresa affidataria ed esecutrice")} &nbsp; ${casella(subappalto, `Impresa esecutrice in subappalto a: ${subappalto ? p.impresa.subappalto_a : "____________"}`)}</p>
  <p>Le attività dell'impresa nel cantiere in oggetto hanno durata ${casella(!p.impresa.durata_oltre_200_giorni, "minore")} ${casella(p.impresa.durata_oltre_200_giorni, "maggiore")} a 200 giorni</p>
  <table class="griglia">
    <tr><td class="et">Ragione sociale</td><td colspan="3">${testo(p.impresa.ragione_sociale)}${p.impresa.partita_iva ? ` — P. IVA ${esc(p.impresa.partita_iva)}` : ""}</td></tr>
    <tr><td class="et">Datore di lavoro</td><td colspan="3">${testo(p.impresa.datore_lavoro)}</td></tr>
    ${righeRecapito("Sede legale", p.impresa.sede_legale)}
    ${righeRecapito("Sede operativa", p.impresa.sede_operativa, "Coincide con la sede legale")}
    ${righeRecapito("Uffici di cantiere", p.impresa.uffici_cantiere, "Non previsti")}
  </table>

  <h2>Dirigenti e preposti <span class="rif">(3.2.1 lettera a) punto 6 e lettera b)</span></h2>
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

  <h2>Organizzazione del servizio di pronto soccorso, antincendio ed evacuazione dei lavoratori <span class="rif">(3.2.1 lettera a) punto 3)</span></h2>
  <p>Gestione delle emergenze: ${casella(p.emergenze.gestione === "committente", GESTIONE_EMERGENZE_LABEL.committente)} ${casella(p.emergenze.gestione === "interna", GESTIONE_EMERGENZE_LABEL.interna)} ${casella(p.emergenze.gestione === "comune", GESTIONE_EMERGENZE_LABEL.comune)}</p>
  ${p.emergenze.gestione === "comune" ? `<p>Imprese che gestiscono insieme le emergenze: ${testo(p.emergenze.imprese_gestione_comune)}</p>` : ""}
  <h3>Lavoratori incaricati della gestione delle emergenze <span class="rif">(3.2.1 lettera a) punto 3 e lettera b)</span></h3>
  <table>
    <tr><th style="width:28%">Nominativo</th><th style="width:36%">Tipo nomina</th><th>Mansioni specifiche svolte in cantiere ai fini della sicurezza</th></tr>
    ${addetti}
  </table>

  <h2>Numero e qualifica dei lavoratori operanti in cantiere per conto dell'impresa <span class="rif">(3.2.1 lettera a) punto 7)</span></h2>
  <table>
    <tr><th>Qualifica</th><th class="num">Numero</th><th>Note</th></tr>
    ${lavoratori}
  </table>
  <h3>Lavoratori autonomi operanti per conto dell'impresa <span class="rif">(3.2.1 lettera a) punto 7)</span></h3>
  <table>
    <tr><th style="width:45%">Dati identificativi</th><th>Attività svolta in cantiere dal soggetto</th></tr>
    ${autonomi}
  </table>

  <h2>Documentazione in merito all'informazione ed alla formazione fornite ai lavoratori impegnati in cantiere <span class="rif">(3.2.1 lettera l)</span></h2>
  <p class="nota">Per ciascun lavoratore: informazione, formazione e addestramento ricevuti. Gli attestati sono a disposizione presso la sede dell'impresa.</p>
  <table>
    <tr><th class="num">N</th><th style="width:26%">Lavoratori impegnati in cantiere</th><th style="width:18%">Qualifica</th><th>Informazione, formazione e addestramento forniti</th></tr>
    ${formazione}
  </table>

  <h2>Esito del rapporto di valutazione del rumore <span class="rif">(3.2.1 lettera f)</span></h2>
  <p>Il rapporto di valutazione di esposizione dei lavoratori al rumore, relativamente alle lavorazioni svolte in cantiere, è il seguente:</p>
  ${p.rumore.esito.trim() ? `<table><tr><td>${testo(p.rumore.esito)}</td></tr></table>` : ""}
  <h3>Tabella riepilogativa dei livelli di esposizione</h3>
  <table>
    <tr><th>Mansione (o nominativo)</th><th>Lavorazione</th><th>Livello di pressione sonora delle sorgenti di rumore utilizzate</th><th>Livelli di esposizione giornaliera/settimanale</th><th>Note</th></tr>
    ${rumore}
  </table>

  <h2>Lavorazioni svolte in cantiere <span class="rif">(3.2.1 lettera a) punto 2 e lettere c, d, e, g, i, h)</span></h2>
  ${lavorazioni}
  <h3>Elenco dei dispositivi di protezione individuale forniti ai lavoratori <span class="rif">(3.2.1 lettera i)</span></h3>
  ${dpi.length ? `<ul>${dpi.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : `<p class="vuoto-blocco">Da indicare nelle schede delle lavorazioni.</p>`}

  <h2>Procedure complementari o di dettaglio richieste dal PSC (se previsto) <span class="rif">(3.2.1 lettera h)</span></h2>
  <p>${psc.psc_presente ? "" : "Per questo cantiere non è previsto il PSC. "}Nel PSC sono state richieste delle procedure complementari o di dettaglio: ${casella(!psc.richieste, "no")} ${casella(psc.richieste, "si")}</p>
  ${procedure ? `<table><tr><th class="num">N</th><th>Procedura richiesta nel PSC</th><th>Indicazioni complementari e di dettaglio</th></tr>${procedure}</table>` : ""}

  <h2>Elenco allegati obbligatori</h2>
  <p>${casella(schede.length > 0, "Schede di sicurezza delle sostanze e preparati pericolosi")}</p>
  ${schede.length ? `<ul>${schede.map((a) => `<li>${esc(a.nome)}</li>`).join("")}</ul>` : ""}
  ${altriAllegati.length ? `<ul>${altriAllegati.map((a) => `<li>${casella(true, `${ALLEGATO_LABEL[a.tipo]}: ${a.nome}`)}</li>`).join("")}</ul>` : ""}

  <h2>Firme</h2>
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
