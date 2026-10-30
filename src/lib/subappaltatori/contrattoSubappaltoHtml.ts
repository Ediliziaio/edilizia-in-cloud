/**
 * Il contratto di subappalto stampabile e da firmare: i dati del contratto e le
 * clausole che in un subappalto edile servono sempre. Le clausole sono testo
 * standard prudente, non un parere legale: il titolare le rilegge, e quello che
 * scrive nel contratto (obblighi, pagamenti, penali, garanzie) vince sul testo base.
 *
 * Il testo è UNO (`articoliContratto`): la stampa (HTML) e il PDF che si manda in
 * firma lo leggono dalla stessa fonte, così si firma esattamente ciò che si stampa.
 *
 * Riferimenti: art. 1655-1677 c.c. (appalto), art. 1656 c.c. (autorizzazione al
 * subappalto), art. 29 c. 2 D.Lgs. 276/2003 (solidarietà su retribuzioni e
 * contributi), D.Lgs. 81/2008 artt. 26, 90, 97, 100 e Allegato XVII (sicurezza,
 * idoneità tecnico-professionale, POS), art. 27 D.Lgs. 81/2008 (patente a crediti),
 * DURC, art. 17 c. 6 lett. a-ter DPR 633/1972 (reverse charge in edilizia).
 */

/**
 * Una riga dell'elenco dei lavori (Allegato A, 31/10/2026): la voce del computo
 * o del listino che il subappaltatore accetta, col suo prezzo. Fotografia al
 * momento del contratto (contratti_subappalto.elenco_lavori).
 */
export interface RigaElencoLavori {
  fase: string;
  descrizione: string;
  unita: string | null;
  quantita: number;
  prezzo: number;
  importo: number;
  codice?: string | null;
}

export interface DatiContrattoSubappalto {
  numero: string | null;
  dataStipula: string | null;
  committente: { ragioneSociale: string; partitaIva: string; indirizzo: string; rappresentante: string };
  subappaltatore: { ragioneSociale: string; partitaIva: string; indirizzo: string; email: string; pec: string };
  commessa: { codice: string; descrizione: string; indirizzoCantiere: string; cliente: string };
  descrizioneLavori: string;
  importo: number;
  oneriSicurezza: number;
  ritenutaPct: number;
  dataInizio: string | null;
  dataFinePrevista: string | null;
  responsabileImpresa: string | null;
  referenteSubappaltatore: string | null;
  obblighi: string | null;
  modalitaPagamento: string | null;
  penali: string | null;
  garanzie: string | null;
  durataGaranziaMesi: number;
  note: string | null;
  /** Allegato A: i lavori uno per uno, con quantità e prezzi. Vuoto = solo la descrizione. */
  elencoLavori?: RigaElencoLavori[];
}

/** Le righe dell'elenco divise per fase, nell'ordine in cui arrivano, col subtotale. */
export function elencoPerFase(righe: RigaElencoLavori[]): Array<{ fase: string; righe: RigaElencoLavori[]; totale: number }> {
  const gruppi: Array<{ fase: string; righe: RigaElencoLavori[]; totale: number }> = [];
  for (const r of righe) {
    let g = gruppi.find((x) => x.fase === r.fase);
    if (!g) gruppi.push((g = { fase: r.fase, righe: [], totale: 0 }));
    g.righe.push(r);
    g.totale = Math.round((g.totale + (Number(r.importo) || 0)) * 100) / 100;
  }
  return gruppi;
}
export const totaleElencoLavori = (righe: RigaElencoLavori[]) =>
  Math.round(righe.reduce((t, r) => t + (Number(r.importo) || 0), 0) * 100) / 100;
export const quantitaContratto = (n: number) => (Number(n) || 0).toLocaleString("it-IT", { maximumFractionDigits: 3 });

export interface ArticoloContratto {
  titolo: string;
  /** Paragrafi di testo semplice (senza HTML). */
  paragrafi: string[];
}

// useGrouping "always": in italiano 3052,50 € senza punto è il default per le quattro cifre (31/10/2026).
export const euroContratto = (n: number) =>
  (Number(n) || 0).toLocaleString("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" } as Intl.NumberFormatOptions);
export const dataContratto = (d: string | null) => (d ? d.split("-").reverse().join("/") : "____/____/________");
const t = (v: string | null | undefined) => (v && v.trim() ? v.trim() : "");

/** Gli articoli che il subappaltatore approva a parte (artt. 1341-1342 c.c.). */
export const ARTICOLI_APPROVAZIONE_SPECIFICA = [
  "Stati di avanzamento e pagamenti", "Ritenuta di garanzia", "Personale e responsabilità",
  "Penali", "Divieto di subappalto", "Risoluzione", "Foro competente",
];

export function articoliContratto(d: DatiContrattoSubappalto): ArticoloContratto[] {
  const totale = (Number(d.importo) || 0) + (Number(d.oneriSicurezza) || 0);
  const art: ArticoloContratto[] = [
    { titolo: "Oggetto", paragrafi: [
      `Il Committente affida al Subappaltatore, che accetta, l'esecuzione delle seguenti lavorazioni nel cantiere della commessa ${d.commessa.codice} (${d.commessa.descrizione}), sito in ${d.commessa.indirizzoCantiere || "—"}:`,
      t(d.descrizioneLavori) || "—",
      ...(d.elencoLavori?.length
        ? [`Le lavorazioni, le quantità previste e i prezzi unitari sono quelli dell'Allegato A – Elenco dei lavori (${d.elencoLavori.length} voci, ${euroContratto(totaleElencoLavori(d.elencoLavori))}), parte integrante del presente contratto. Si contabilizzano le quantità effettivamente eseguite e misurate, ai prezzi unitari dell'Allegato A.`]
        : []),
      "Il Committente dichiara di essere autorizzato al subappalto dal proprio committente (art. 1656 c.c.).",
    ] },
    { titolo: "Durata", paragrafi: [
      `I lavori inizieranno il ${dataContratto(d.dataInizio)} e termineranno entro il ${dataContratto(d.dataFinePrevista)}, secondo il cronoprogramma del cantiere e le indicazioni del direttore tecnico del Committente.`,
    ] },
    { titolo: "Corrispettivo", paragrafi: [
      `Il corrispettivo è di ${euroContratto(d.importo)} per i lavori, oltre a ${euroContratto(d.oneriSicurezza)} per oneri della sicurezza non soggetti a ribasso, per un totale di ${euroContratto(totale)}, IVA esclusa. Ove applicabile, la fatturazione avviene con inversione contabile (art. 17, comma 6, lett. a-ter, DPR 633/1972).`,
    ] },
    { titolo: "Stati di avanzamento e pagamenti", paragrafi: [
      `I lavori sono contabilizzati per stati di avanzamento (SAL) verificati dal Committente. ${t(d.modalitaPagamento) || "I pagamenti avvengono a mezzo bonifico entro 60 giorni dalla data della fattura, previa verifica del SAL."} Ogni pagamento è subordinato alla regolarità contributiva (DURC in corso di validità) del Subappaltatore.`,
    ] },
    { titolo: "Ritenuta di garanzia", paragrafi: [
      `Su ogni SAL è operata una ritenuta di garanzia del ${d.ritenutaPct}%, svincolata alla fine del periodo di garanzia di ${d.durataGaranziaMesi} mesi dalla fine dei lavori, in assenza di vizi o contestazioni.`,
    ] },
    { titolo: "Sicurezza", paragrafi: [
      "Il Subappaltatore applica il D.Lgs. 81/2008: consegna il proprio POS prima dell'ingresso in cantiere, rispetta il PSC (ove previsto) e le disposizioni del coordinatore, partecipa alle riunioni di coordinamento, forma e dota di DPI i propri lavoratori, che espongono la tessera di riconoscimento. Il Subappaltatore dichiara di essere in possesso della patente a crediti (art. 27 D.Lgs. 81/2008) ove richiesta.",
    ] },
    { titolo: "Idoneità e documenti", paragrafi: [
      "Prima dell'inizio dei lavori il Subappaltatore consegna i documenti dell'Allegato XVII del D.Lgs. 81/2008 (visura camerale, DVR, DURC, dichiarazione di non essere destinatario di provvedimenti di sospensione) e li mantiene aggiornati per tutta la durata del contratto.",
    ] },
    { titolo: "Personale e responsabilità", paragrafi: [
      "Il Subappaltatore organizza i lavori con mezzi e personale propri, a proprio rischio, applicando i contratti collettivi del settore edile e iscrivendo i lavoratori alla Cassa Edile. Le parti prendono atto della responsabilità solidale per retribuzioni e contributi (art. 29, comma 2, D.Lgs. 276/2003): il Committente può sospendere i pagamenti fino alla prova degli adempimenti.",
      ...(t(d.obblighi) ? [`Obblighi specifici: ${t(d.obblighi)}`] : []),
    ] },
    { titolo: "Referenti", paragrafi: [
      `Per il Committente: ${t(d.responsabileImpresa) || "________________________"}.`,
      `Per il Subappaltatore (responsabile in cantiere): ${t(d.referenteSubappaltatore) || "________________________"}.`,
    ] },
    { titolo: "Penali", paragrafi: [t(d.penali) || "Per ogni giorno di ritardo sul termine di fine lavori non dovuto a cause non imputabili al Subappaltatore, il Committente può applicare una penale pari all'1‰ del corrispettivo, fino a un massimo del 10%."] },
    { titolo: "Garanzie e assicurazioni", paragrafi: [t(d.garanzie) || "Il Subappaltatore mantiene una polizza di responsabilità civile verso terzi e prestatori d'opera (RCT/RCO) adeguata ai lavori, e ne consegna copia al Committente."] },
    { titolo: "Divieto di subappalto", paragrafi: ["Il Subappaltatore non può a sua volta subappaltare, in tutto o in parte, i lavori senza l'autorizzazione scritta del Committente."] },
    { titolo: "Risoluzione", paragrafi: ["Il contratto si risolve di diritto (art. 1456 c.c.) in caso di gravi violazioni delle norme di sicurezza, di DURC irregolare non sanato entro 15 giorni o di subappalto non autorizzato."] },
    { titolo: "Foro competente", paragrafi: ["Per ogni controversia è competente il foro della sede del Committente."] },
  ];
  if (t(d.note)) art.push({ titolo: "Altre pattuizioni", paragrafi: [t(d.note)] });
  return art;
}

const esc = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function costruisciContrattoSubappaltoHtml(d: DatiContrattoSubappalto): string {
  const articoli = articoliContratto(d);
  return `<!DOCTYPE html>
<html lang="it"><head><meta charset="UTF-8"><title>Contratto di subappalto ${esc(d.numero ?? "")}</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font-family: Arial, sans-serif; color: #111; font-size: 11pt; line-height: 1.5; max-width: 800px; margin: 24px auto; }
  h1 { font-size: 16pt; text-align: center; margin-bottom: 4px; }
  .sotto { text-align: center; color: #555; margin-bottom: 20px; }
  .parti { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 16px 0; }
  .parti div { border: 1px solid #ccc; border-radius: 6px; padding: 10px; font-size: 10pt; }
  h2 { font-size: 11pt; margin: 16px 0 4px; }
  p { margin: 0 0 6px; white-space: pre-wrap; }
  .firme { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 48px; }
  .firme div { border-top: 1px solid #333; padding-top: 6px; font-size: 10pt; text-align: center; }
  .clausole { margin-top: 28px; font-size: 9.5pt; }
  .allegato { page-break-before: always; }
  table.elenco { width: 100%; border-collapse: collapse; font-size: 9pt; margin-top: 8px; }
  table.elenco th, table.elenco td { border: 1px solid #999; padding: 3px 5px; vertical-align: top; }
  table.elenco th { background: #eee; text-align: left; }
  table.elenco td.n { text-align: right; white-space: nowrap; }
  table.elenco tr.fase td { background: #f5f5f5; font-weight: bold; }
  table.elenco tr.tot td { font-weight: bold; }
</style></head><body>
  <h1>CONTRATTO DI SUBAPPALTO</h1>
  <p class="sotto">${d.numero ? `N. ${esc(d.numero)} · ` : ""}stipulato il ${dataContratto(d.dataStipula)}</p>
  <div class="parti">
    <div><strong>Committente (impresa affidataria)</strong><br>${esc(d.committente.ragioneSociale)}<br>P.IVA ${esc(d.committente.partitaIva || "—")}<br>${esc(d.committente.indirizzo)}${d.committente.rappresentante ? `<br>rappresentata da ${esc(d.committente.rappresentante)}` : ""}</div>
    <div><strong>Subappaltatore</strong><br>${esc(d.subappaltatore.ragioneSociale)}<br>P.IVA ${esc(d.subappaltatore.partitaIva || "—")}<br>${esc(d.subappaltatore.indirizzo)}${d.subappaltatore.pec ? `<br>PEC ${esc(d.subappaltatore.pec)}` : ""}</div>
  </div>
  <p>Cliente finale dell'opera: ${esc(d.commessa.cliente || "—")}.</p>
  ${articoli.map((a, i) => `<h2>Art. ${i + 1} – ${esc(a.titolo)}</h2>${a.paragrafi.map((p) => `<p>${esc(p)}</p>`).join("")}`).join("\n  ")}
  <div class="firme"><div>Il Committente</div><div>Il Subappaltatore</div></div>
  <p class="clausole">Ai sensi degli artt. 1341 e 1342 c.c. il Subappaltatore approva specificamente gli articoli: ${ARTICOLI_APPROVAZIONE_SPECIFICA.join(", ")}.</p>
  <div class="firme"><div></div><div>Il Subappaltatore</div></div>
  ${d.elencoLavori?.length ? `<section class="allegato">
  <h1>ALLEGATO A – ELENCO DEI LAVORI</h1>
  <p class="sotto">Commessa ${esc(d.commessa.codice)} · ${esc(d.subappaltatore.ragioneSociale)} · prezzi IVA esclusa</p>
  <table class="elenco"><thead><tr><th>Descrizione</th><th>U.M.</th><th>Quantità</th><th>Prezzo unitario</th><th>Importo</th></tr></thead><tbody>
  ${elencoPerFase(d.elencoLavori).map((g) => `<tr class="fase"><td colspan="4">${esc(g.fase)}</td><td class="n">${euroContratto(g.totale)}</td></tr>${g.righe.map((r) => `<tr><td>${r.codice ? `${esc(r.codice)} · ` : ""}${esc(r.descrizione)}</td><td>${esc(r.unita ?? "")}</td><td class="n">${quantitaContratto(r.quantita)}</td><td class="n">${euroContratto(r.prezzo)}</td><td class="n">${euroContratto(r.importo)}</td></tr>`).join("")}`).join("")}
  <tr class="tot"><td colspan="4">Totale lavori</td><td class="n">${euroContratto(totaleElencoLavori(d.elencoLavori))}</td></tr>
  </tbody></table>
  <div class="firme"><div>Il Committente</div><div>Il Subappaltatore, per accettazione</div></div>
  </section>` : ""}
</body></html>`;
}
