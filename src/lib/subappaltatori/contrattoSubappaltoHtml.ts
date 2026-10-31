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
  committente: { ragioneSociale: string; partitaIva: string; indirizzo: string; rappresentante: string; codiceFiscale?: string; telefono?: string; email?: string };
  subappaltatore: {
    ragioneSociale: string; partitaIva: string; indirizzo: string; email: string; pec: string;
    codiceFiscale?: string; telefono?: string; responsabile?: string;
  };
  /** Aliquota IVA della ditta: 0 = reverse charge (il caso normale nel subappalto edile). */
  ivaPct?: number;
  /** Logo dell'impresa affidataria (Impostazioni → Profilo aziendale), già letto come data URL. */
  veste?: { logoUrl: string | null };
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
  /**
   * Testi personalizzati degli articoli, per titolo (standard dell'azienda unito a quello del contratto, vedi
   * `unisciArticoliPersonalizzati`). Il testo sostituisce i paragrafi dell'articolo; il titolo resta.
   */
  articoliPersonalizzati?: Record<string, string>;
}

/** Testo personalizzato → paragrafi: una riga vuota separa i paragrafi. */
export function paragrafiDaTesto(testo: string): string[] {
  return testo.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

/** Standard dell'azienda e testi del contratto: vince il contratto; un testo vuoto non conta. */
export function unisciArticoliPersonalizzati(modello: unknown, contratto: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const fonte of [modello, contratto]) {
    if (!fonte || typeof fonte !== "object" || Array.isArray(fonte)) continue;
    for (const [titolo, testo] of Object.entries(fonte as Record<string, unknown>)) {
      if (typeof testo === "string" && testo.trim()) out[titolo] = testo.trim();
    }
  }
  return out;
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
/**
 * Il riquadro economico del contratto, uguale in stampa e nel PDF: lavori, oneri della sicurezza, IVA (o reverse
 * charge), ritenuta di garanzia e quanto si paga ai SAL al netto della ritenuta.
 */
export interface RiepilogoEconomicoContratto {
  lavori: number; oneri: number; imponibile: number;
  ivaPct: number; reverseCharge: boolean; iva: number; totaleFattura: number;
  ritenutaPct: number; ritenuta: number; nettoAiSal: number;
}
const cent = (n: number) => Math.round(n * 100) / 100;
export function riepilogoEconomicoContratto(d: Pick<DatiContrattoSubappalto, "importo" | "oneriSicurezza" | "ivaPct" | "ritenutaPct">): RiepilogoEconomicoContratto {
  const lavori = cent(Number(d.importo) || 0);
  const oneri = cent(Number(d.oneriSicurezza) || 0);
  const imponibile = cent(lavori + oneri);
  const ivaPct = Math.max(0, Number(d.ivaPct) || 0);
  const iva = cent(imponibile * ivaPct / 100);
  const ritenutaPct = Math.max(0, Number(d.ritenutaPct) || 0);
  // La ritenuta si calcola sull'imponibile: l'IVA (se c'è) non si trattiene.
  const ritenuta = cent(imponibile * ritenutaPct / 100);
  return { lavori, oneri, imponibile, ivaPct, reverseCharge: ivaPct === 0, iva, totaleFattura: cent(imponibile + iva), ritenutaPct, ritenuta, nettoAiSal: cent(imponibile + iva - ritenuta) };
}

/**
 * Il codice delle righe dell'elenco è quello di origine della voce: per le voci nate da un preventivo è il
 * numero del preventivo, uguale su tutte (Dimora, O-0001: «RST-2026-010» su 23 righe). Allora non è un codice
 * della voce ma il riferimento del documento: si scrive una volta in testa, non ripetuto su ogni riga.
 */
export function codiciElenco(righe: RigaElencoLavori[]): { riferimento: string | null; perRiga: boolean } {
  const codici = new Set(righe.map((r) => (r.codice ?? "").trim()));
  if (codici.size === 1) { const unico = [...codici][0]; return { riferimento: unico || null, perRiga: false }; }
  return { riferimento: null, perRiga: [...codici].some(Boolean) };
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

/**
 * Gli articoli che il subappaltatore approva a parte (artt. 1341-1342 c.c.): quelli che lo vincolano di più.
 * Stessi titoli degli articoli qui sotto e stesso numero di CLAUSOLE_SUBAPPALTO (supabase/functions/_shared/clausoleFirma.ts).
 */
export const ARTICOLI_APPROVAZIONE_SPECIFICA = [
  "Pagamenti", "Penali per ritardi e comportamenti scorretti", "Sistemazione e rifacimento delle lavorazioni",
  "Divieto di modifica e variazione delle lavorazioni", "Garanzie dei lavori", "Divieto di subappalto",
  "Personale non regolarmente assunto", "Risoluzione del contratto", "Mediazione e foro competente",
];

/**
 * Il testo standard (31/10/2026): il contratto di subappalto che Dimora Torino usa coi suoi subappaltatori,
 * reso generico. L'impresa che firma è l'«Affidataria», il cliente finale il «Committente». Quello che si
 * scrive nel contratto (obblighi, pagamenti, penali, garanzie, note) si aggiunge o sostituisce il testo base.
 * Rispetto all'originale: niente rimando al D.Lgs. 50/2016 (appalti pubblici, abrogato), sede e città presi
 * dall'Affidataria invece di Torino, gli obblighi di legge del vecchio testo standard (art. 1656 c.c., art. 29
 * D.Lgs. 276/2003, Allegato XVII D.Lgs. 81/2008, DURC, patente a crediti) tenuti dove servono.
 */
export function articoliContratto(d: DatiContrattoSubappalto): ArticoloContratto[] {
  const totale = (Number(d.importo) || 0) + (Number(d.oneriSicurezza) || 0);
  const A = t(d.committente.ragioneSociale) || "l'impresa affidataria";
  const ritenuta = Number(d.ritenutaPct) || 0;
  const art: ArticoloContratto[] = [
    { titolo: "Premesse e oggetto", paragrafi: [
      `L'impresa ${A} (di seguito «Affidataria») affida al Subappaltatore, che con la sottoscrizione del presente contratto accetta, l'esecuzione di tutte le opere, prestazioni, forniture e provviste necessarie per i lavori nel cantiere della commessa ${d.commessa.codice} (${d.commessa.descrizione}), sito in ${d.commessa.indirizzoCantiere || "—"}, per conto del cliente finale ${d.commessa.cliente || "—"} (di seguito «Committente»).`,
      t(d.descrizioneLavori) || "—",
      ...(d.elencoLavori?.length
        ? [`Le lavorazioni, le quantità previste e i prezzi unitari sono quelli dell'Allegato A – Elenco dei lavori (${d.elencoLavori.length} voci, ${euroContratto(totaleElencoLavori(d.elencoLavori))}), parte integrante del presente contratto. Si contabilizzano le quantità effettivamente eseguite e misurate, ai prezzi unitari dell'Allegato A.`]
        : []),
      "Le premesse e gli allegati elencati all'ultimo articolo, sottoscritti dalle parti per accettazione, sono parte integrante ed essenziale del contratto. L'Affidataria dichiara di essere autorizzata al subappalto dal Committente (art. 1656 c.c.).",
      `Il Subappaltatore nomina quale proprio referente di cantiere ${t(d.referenteSubappaltatore) || "________________________"}: ogni comunicazione formale è valida se inviata ai suoi recapiti.`,
    ] },
    { titolo: "Obblighi dell'Affidataria", paragrafi: [
      "L'Affidataria consegna al Subappaltatore l'elenco dei lavori o il computo metrico e, dove previsti, i disegni tecnici delle forniture, delle demolizioni e costruzioni, degli impianti e degli arredi.",
      "Restano a carico dell'Affidataria la fornitura di acqua ed energia elettrica e la realizzazione dei progetti.",
      `Per l'Affidataria il referente è ${t(d.responsabileImpresa) || "________________________"}.`,
    ] },
    { titolo: "Obblighi del Subappaltatore", paragrafi: [
      "Il Subappaltatore esegue i lavori a perfetta regola d'arte, con la migliore diligenza professionale, con mezzi e maestranze propri dotati di adeguata capacità tecnica e a proprio rischio. Garantisce che materiali e macchinari impiegati sono conformi alle norme di legge e di sicurezza e che le opere sono idonee allo scopo, che dichiara di conoscere.",
      "Mantiene con il Committente un comportamento professionale e corretto in rappresentanza dell'Affidataria; non rilascia propri recapiti e comunica solo con la Direzione Lavori e con l'Affidataria.",
      "Tiene in ordine e puliti i luoghi dell'intervento e le parti condominiali di passaggio, adottando misure per evitare danni e disagi; sgombera il cantiere dal materiale di risulta delle proprie lavorazioni; non danneggia né disperde il materiale di altri professionisti presenti in cantiere.",
      "Comunica tempestivamente all'Affidataria, alla Direzione Lavori o al capo cantiere: assenze dal cantiere superiori a un giorno lavorativo e i tempi di esecuzione, per garantire un flusso costante del cantiere; modifiche tecniche alle lavorazioni; varianti, che vanno confermate prima di essere eseguite; problemi tecnici o mancanza di materiali.",
      "Rispetta le lavorazioni pattuite senza prendere iniziative e senza variare le opere, e non chiede compensi non pattuiti. Se esegue di sua iniziativa lavorazioni non richieste, ne assume la totale responsabilità e solleva l'Affidataria.",
      "Solleva l'Affidataria da ogni danno causato a terzi durante la propria attività. Dichiara di essere in regola con i versamenti contributivi e di avere un DURC regolare, sollevando l'Affidataria da ogni responsabilità di natura fiscale e contributiva.",
      "Prima dell'ingresso in cantiere consegna copia della propria polizza di responsabilità civile lavori/montaggi con massimale minimo di 500.000,00 € per sinistro. Senza polizza valida i lavori sono sospesi, senza penali né pretese a carico dell'Affidataria.",
      "Per i 12 mesi successivi alla fine dei lavori non assume né ingaggia dipendenti o collaboratori dell'Affidataria: per ciascun lavoratore sottratto è dovuta una penale di 5.000,00 €.",
      ...(t(d.obblighi) ? [`Obblighi specifici: ${t(d.obblighi)}`] : []),
    ] },
    { titolo: "Consegna dei lavori", paragrafi: [
      `Il Subappaltatore prende possesso del cantiere e inizia improrogabilmente le lavorazioni entro il ${dataContratto(d.dataInizio)}, e le termina entro il ${dataContratto(d.dataFinePrevista)}, secondo il cronoprogramma del cantiere e le indicazioni dell'Affidataria.`,
    ] },
    { titolo: "Pagamenti", paragrafi: [
      `Le parti pattuiscono in ${euroContratto(d.importo)} il prezzo complessivo delle opere subappaltate${Number(d.oneriSicurezza) ? `, oltre a ${euroContratto(d.oneriSicurezza)} per oneri della sicurezza non soggetti a ribasso, per un totale di ${euroContratto(totale)}` : ""}, IVA esclusa.`,
      t(d.modalitaPagamento) || "I SAL sono quelli dell'elenco pagamenti allegato al presente contratto. La fattura si paga entro 7 giorni lavorativi dalla consegna nel cassetto fiscale dell'Affidataria.",
      "Ogni pagamento è subordinato alla regolarità contributiva del Subappaltatore (DURC in corso di validità). I materiali eventualmente forniti dall'Affidataria possono essere detratti dal corrispettivo, previa consegna di DDT e fatture.",
      ...(ritenuta > 0 ? [`Ritenuta di garanzia: su ogni SAL è trattenuto il ${ritenuta}%, svincolato alla fine del periodo di garanzia di ${d.durataGaranziaMesi} mesi dalla fine dei lavori, in assenza di vizi o contestazioni.`] : []),
    ] },
    { titolo: "Fatturazione", paragrafi: [
      (Number(d.ivaPct) || 0) > 0
        ? `Il Subappaltatore fattura con IVA al ${Number(d.ivaPct)}%: le parti dichiarano che le prestazioni non rientrano nell'inversione contabile dell'art. 17, comma 6, lettera a), DPR 633/1972.`
        : "Le parti dichiarano che le opere sono operazioni soggette all'inversione contabile (reverse charge) dell'art. 17, comma 6, lettera a), DPR 633/1972: il Subappaltatore fattura senza IVA e l'Affidataria la integra.",
    ] },
    { titolo: "Penali per ritardi e comportamenti scorretti", paragrafi: [
      `Il Subappaltatore ultima a perfetta regola d'arte le opere subappaltate entro il ${dataContratto(d.dataFinePrevista)}.`,
      t(d.penali) || "Per ogni giorno di ritardo, dovuto ad assenza ingiustificata dal cantiere o al ritardo nell'ultimazione delle lavorazioni per esclusiva colpa del Subappaltatore, è dovuta all'Affidataria una penale di 200,00 € al giorno fino al decimo giorno lavorativo e di 400,00 € al giorno dall'undicesimo, salvo il maggior danno.",
    ] },
    { titolo: "Sistemazione e rifacimento delle lavorazioni", paragrafi: [
      "Se il Committente o l'Affidataria rilevano vizi o difformità nelle opere, il Subappaltatore interviene a propria cura e spese, senza maggior compenso, entro 3 giorni dalla richiesta. Per ogni giorno di ritardo oltre questo termine è dovuta una penale di 150,00 €, salvo il maggior danno.",
    ] },
    { titolo: "Divieto di modifica e variazione delle lavorazioni", paragrafi: [
      "Le opere subappaltate non si modificano senza autorizzazione scritta dell'Affidataria: una modifica di quantità o qualità non autorizzata per iscritto non viene contabilizzata nel saldo finale.",
      "L'Affidataria può chiedere di modificare quantità e qualità delle opere quando lo chiede il Committente, e ne trasmette tempestivamente le richieste. Se il Subappaltatore rifiuta senza motivo di eseguirle, l'Affidataria può risolvere il contratto senza preavviso: il Subappaltatore lascia subito il cantiere sgombro, pulito e in sicurezza, e riceve solo il corrispettivo delle opere eseguite fino a quel momento.",
    ] },
    { titolo: "Variazione delle lavorazioni", paragrafi: [
      "Se durante i lavori, per ragioni non conosciute né conoscibili ai sopralluoghi preliminari, servono modifiche tecniche alle lavorazioni concordate, il Subappaltatore lo comunica subito per iscritto all'Affidataria per concordare la soluzione tecnica.",
      "Il Subappaltatore risponde verso l'Affidataria, il Committente e i terzi dei danni causati dalla mancata o tardiva comunicazione, e restano a suo carico i costi per inconvenienti, vizi, danni e difetti dovuti a sopralluoghi omessi o insufficienti.",
    ] },
    { titolo: "Garanzie dei lavori", paragrafi: [
      "Il Subappaltatore presta tutte le garanzie di legge sull'esatta esecuzione delle lavorazioni. Se il Committente o l'Affidataria riscontrano vizi, anche dopo il collaudo, il Subappaltatore li elimina a propria cura e spese entro 3 giorni dalla comunicazione, senza altro compenso; per ogni giorno di ritardo è dovuta una penale di 150,00 €, salvo il maggior danno.",
      "Restano ferme le garanzie degli artt. 1667-1669 c.c.: 2 anni per i vizi delle finiture, 10 anni per i vizi strutturali o che compromettono stabilità e sicurezza.",
      ...(t(d.garanzie) ? [t(d.garanzie)] : []),
    ] },
    { titolo: "Divieto di subappalto", paragrafi: [
      "Il Subappaltatore non può cedere né subappaltare, neppure in parte, le lavorazioni del presente contratto. La violazione consente all'Affidataria di risolvere il contratto con effetto immediato, pagando solo le opere eseguite direttamente dal Subappaltatore, che lascia subito il cantiere sgombro, pulito e in sicurezza.",
    ] },
    { titolo: "Sicurezza dei luoghi di lavoro", paragrafi: [
      "Il Subappaltatore osserva e fa osservare al proprio personale le norme sulla salute e sicurezza nei luoghi di lavoro, compreso il D.Lgs. 81/2008. In particolare: fa rispettare le norme di sicurezza e igiene e le disposizioni dei piani di sicurezza; impiega solo personale formato e informato; usa mezzi, macchine e attrezzature conformi e manutenuti; dota il personale dei dispositivi di protezione individuale e ne pretende l'uso; adotta ogni cautela per l'incolumità dei lavoratori e dei terzi.",
      "Dichiara di aver preso atto dei rischi specifici del cantiere e solleva l'Affidataria da ogni responsabilità per sinistri o danni durante i lavori affidati; risponde dei danni causati a terzi, al proprio personale e al Committente, e delle sanzioni per violazioni della normativa antinfortunistica. Dichiara di essere in possesso della patente a crediti (art. 27 D.Lgs. 81/2008) ove richiesta.",
    ] },
    { titolo: "POS e documenti", paragrafi: [
      "Il Subappaltatore rispetta il Piano di Sicurezza e Coordinamento, dove previsto, e ha redatto il proprio Piano Operativo di Sicurezza (POS), consegnato al Rappresentante dei Lavoratori per la Sicurezza. Trasmette all'Affidataria il POS e le schede tecniche dei materiali almeno 5 giorni lavorativi prima dell'ingresso in cantiere: in mancanza l'Affidataria può sospendere i lavori senza penali né richieste di risarcimento.",
      "Prima dell'inizio dei lavori consegna i documenti dell'Allegato XVII del D.Lgs. 81/2008 (visura camerale, DVR, DURC, dichiarazione di non essere destinatario di provvedimenti di sospensione), l'elenco nominativo del personale e il registro delle presenze in cantiere, aggiornato ogni giorno. La mancata consegna è causa di risoluzione immediata. Ogni lavoratore espone la tessera di riconoscimento (art. 21 D.Lgs. 81/2008).",
      "Il Subappaltatore dichiara di conoscere il D.Lgs. 231/2001 e si astiene da comportamenti che possano configurarne i reati: l'inosservanza è grave inadempimento e causa di risoluzione.",
    ] },
    { titolo: "Contratto collettivo nazionale", paragrafi: [
      "Il Subappaltatore applica ai propri dipendenti impiegati nel subappalto il trattamento economico e normativo del CCNL Edilizia pro tempore vigente, li iscrive alla Cassa Edile e risponde di ogni sanzione derivante dalla sua violazione.",
    ] },
    { titolo: "Personale non regolarmente assunto", paragrafi: [
      "È vietato impiegare personale non regolarmente assunto. Se l'Affidataria lo rileva, può risolvere subito il contratto e trattenere in garanzia le somme dovute a saldo fino alla dichiarazione dei lavoratori di aver ricevuto quanto spettante.",
      "Il Subappaltatore paga puntualmente il proprio personale. Le parti prendono atto della responsabilità solidale per retribuzioni e contributi (art. 29, comma 2, D.Lgs. 276/2003): se arrivano all'Affidataria richieste di pagamento dei lavoratori, può sospendere i pagamenti fino alla concorrenza di quanto richiesto.",
    ] },
    { titolo: "Risoluzione del contratto", paragrafi: [
      "Oltre ai casi già previsti, l'Affidataria può risolvere il contratto per iscritto per: frode, grave negligenza o imperizia; assenza ingiustificata superiore a 5 giorni lavorativi consecutivi; ritardi sul programma dei lavori che compromettono la riuscita dell'opera; lavori superficiali o errati contestati anche durante l'esecuzione; inosservanza di capitolato, progetti o indicazioni della Direzione Lavori o dell'Affidataria; concorrenza sleale o accaparramento della clientela; sospensioni dei lavori non autorizzate; impiego di personale non regolarmente assunto; DURC irregolare non sanato entro 15 giorni.",
      "In caso di risoluzione il Subappaltatore ha diritto solo al pagamento dei lavori regolarmente eseguiti e accettati, salvo il risarcimento dei danni. Libera e pulisce il cantiere entro 3 giorni lavorativi, restituisce chiavi e accessi e asporta materiali e mezzi; per ogni giorno di ritardo è dovuta una penale di 300,00 €, salvo il maggior danno, e l'Affidataria può sgomberare a spese del Subappaltatore.",
    ] },
    { titolo: "Controllo qualità dei lavori", paragrafi: [
      "Se durante o alla fine dei lavori emergono difformità o vizi, il Subappaltatore interviene a proprie spese entro 3 giorni lavorativi; oltre, senza giustificato motivo, è dovuta una penale di 200,00 € al giorno, compensabile con quanto dovuto al Subappaltatore.",
      "La verifica finale (art. 1665 c.c.) si completa entro 15 giorni dall'ultimazione con un verbale: se l'esito è positivo, il verbale contiene l'accettazione dei lavori senza riserve.",
    ] },
    { titolo: "Arredi e materiale delicato", paragrafi: [
      "È vietato montare, smontare o spostare mobili e arredi negli immobili senza autorizzazione scritta dell'Affidataria. I danni causati in violazione del divieto sono a esclusivo carico del Subappaltatore, e l'Affidataria può trattenerne l'importo dalle somme dovute a saldo.",
    ] },
    { titolo: "Consegna delle chiavi", paragrafi: [
      "Il Subappaltatore detiene chiavi e strumenti di accesso al cantiere solo per servizio, nei modi e nei tempi stabiliti dall'Affidataria, che ne ha il pieno possesso. In caso di smarrimento sostituisce a proprie spese chiavi o serrature.",
    ] },
    { titolo: "Mediazione e foro competente", paragrafi: [
      "Per ogni controversia le parti tentano prima la mediazione (D.Lgs. 28/2010) presso un organismo di mediazione del luogo della sede dell'Affidataria o altro concordato; in mancanza di accordo è competente il foro della sede dell'Affidataria.",
    ] },
    { titolo: "Revisione dei prezzi", paragrafi: [
      "Se gli indici ISTAT dei materiali da costruzione aumentano del 10% o più rispetto alla data dell'offerta, le parti si incontrano per concordare un adeguamento proporzionale dei prezzi.",
    ] },
    { titolo: "Trattamento dei dati personali", paragrafi: [
      `Le parti, titolari autonomi, trattano i dati personali scambiati ai sensi del Regolamento (UE) 2016/679 solo per l'esecuzione del contratto e gli obblighi di legge collegati, per la durata del rapporto e poi per gli obblighi di legge. Titolare per l'Affidataria: ${A}.`,
    ] },
  ];
  if (t(d.note)) art.push({ titolo: "Altre pattuizioni", paragrafi: [t(d.note)] });
  // Testi personalizzati (standard dell'azienda o del singolo contratto): sostituiscono i paragrafi, non il titolo.
  // Quello che si scrive nel singolo contratto da «Modifica» (obblighi specifici, garanzie) resta in coda:
  // uno standard dell'azienda non lo deve cancellare.
  const pers = d.articoliPersonalizzati ?? {};
  const inCoda: Record<string, string[]> = {
    "Obblighi del Subappaltatore": t(d.obblighi) ? [`Obblighi specifici: ${t(d.obblighi)}`] : [],
    "Garanzie dei lavori": t(d.garanzie) ? [t(d.garanzie)] : [],
  };
  for (const a of art) {
    const testo = pers[a.titolo];
    if (typeof testo === "string" && testo.trim()) {
      const par = paragrafiDaTesto(testo);
      if (par.length) a.paragrafi = [...par, ...(inCoda[a.titolo] ?? [])];
    }
  }
  art.push({ titolo: "Allegati", paragrafi: [
    `Sono allegati al contratto: ${d.elencoLavori?.length ? "Allegato A – Elenco dei lavori" : "elenco dei lavori"} e modalità di pagamento; visura camerale, DURC e certificato assicurativo del Subappaltatore; cronoprogramma; disegni tecnici di cantiere; schede tecniche di materiali e componenti.`,
  ] });
  return art;
}

/** «Art. 5 (Pagamenti), Art. 7 (…)»: gli articoli da approvare a parte, col numero che hanno in questo contratto. */
export function articoliDaApprovare(articoli: ArticoloContratto[]): string {
  return ARTICOLI_APPROVAZIONE_SPECIFICA
    .map((titolo) => { const i = articoli.findIndex((a) => a.titolo === titolo); return i >= 0 ? `Art. ${i + 1} (${titolo})` : titolo; })
    .join(", ");
}

/**
 * Le clausole che la pagina di firma fa approvare a parte (31/10/2026): gli stessi articoli che il PDF elenca
 * nell'approvazione specifica, col numero e il TESTO che hanno in questo contratto. Prima la firma mostrava un
 * riassunto fisso (penali da 200 €, foro dell'Affidataria…) anche quando l'azienda aveva riscritto l'articolo.
 */
export function clausoleFirmaSubappalto(articoli: ArticoloContratto[]): Array<{ id: string; testo: string }> {
  return ARTICOLI_APPROVAZIONE_SPECIFICA.map((titolo, k) => {
    const i = articoli.findIndex((a) => a.titolo === titolo);
    const testo = i >= 0 ? `Art. ${i + 1} – ${titolo}: ${articoli[i].paragrafi.join(" ")}` : titolo;
    return { id: `sub-art-${k + 1}`, testo };
  });
}

const esc = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function costruisciContrattoSubappaltoHtml(d: DatiContrattoSubappalto): string {
  const articoli = articoliContratto(d);
  const eco = riepilogoEconomicoContratto(d);
  const colore = "#2b6cb0"; // lo stesso blu del PDF, per tutte le aziende
  const rigaEco = (l: string, v: string, forte = false) => `<tr${forte ? ' class="forte"' : ""}><td>${esc(l)}</td><td class="n">${esc(v)}</td></tr>`;
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
  .testata { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid ${colore}; padding-bottom: 8px; margin-bottom: 16px; }
  .testata img { max-height: 48px; max-width: 180px; }
  .testata .dati { text-align: right; font-size: 8.5pt; color: #444; }
  h1, h2 { color: ${colore}; }
  table.eco { width: 100%; border-collapse: collapse; font-size: 10pt; margin: 10px 0 16px; }
  table.eco td { border-bottom: 1px solid #ddd; padding: 4px 6px; }
  table.eco td.n { text-align: right; white-space: nowrap; }
  table.eco tr.forte td { font-weight: bold; }
</style></head><body>
  <div class="testata">${d.veste?.logoUrl ? `<img src="${esc(d.veste.logoUrl)}" alt="">` : `<strong>${esc(d.committente.ragioneSociale)}</strong>`}<div class="dati"><strong>${esc(d.committente.ragioneSociale)}</strong><br>${esc(d.committente.indirizzo)}<br>P.IVA ${esc(d.committente.partitaIva || "—")}</div></div>
  <h1>CONTRATTO DI SUBAPPALTO</h1>
  <p class="sotto">${d.numero ? `N. ${esc(d.numero)} · ` : ""}stipulato il ${dataContratto(d.dataStipula)}</p>
  <div class="parti">
    <div><strong>Impresa affidataria</strong><br>${esc(d.committente.ragioneSociale)}<br>P.IVA ${esc(d.committente.partitaIva || "—")}<br>${esc(d.committente.indirizzo)}${d.committente.rappresentante ? `<br>rappresentata da ${esc(d.committente.rappresentante)}` : ""}</div>
    <div><strong>Subappaltatore</strong><br>${esc(d.subappaltatore.ragioneSociale)}<br>P.IVA ${esc(d.subappaltatore.partitaIva || "—")}<br>${esc(d.subappaltatore.indirizzo)}${d.subappaltatore.pec ? `<br>PEC ${esc(d.subappaltatore.pec)}` : ""}</div>
  </div>
  <p>Committente (cliente finale dell'opera): ${esc(d.commessa.cliente || "—")}. Cantiere: ${esc(d.commessa.indirizzoCantiere || "—")}. Lavori dal ${dataContratto(d.dataInizio)} al ${dataContratto(d.dataFinePrevista)}.</p>
  <table class="eco">
    ${rigaEco("Lavori", euroContratto(eco.lavori))}
    ${eco.oneri > 0 ? rigaEco("Oneri della sicurezza", euroContratto(eco.oneri)) : ""}
    ${rigaEco("Imponibile", euroContratto(eco.imponibile), true)}
    ${rigaEco(eco.reverseCharge ? "IVA: inversione contabile (art. 17 c. 6 lett. a DPR 633/72)" : `IVA ${eco.ivaPct}%`, eco.reverseCharge ? "reverse charge" : euroContratto(eco.iva))}
    ${eco.ritenutaPct > 0 ? rigaEco(`Ritenuta di garanzia ${eco.ritenutaPct}%`, `− ${euroContratto(eco.ritenuta)}`) : ""}
    ${rigaEco(eco.ritenutaPct > 0 ? "Da pagare ai SAL, al netto della ritenuta" : "Da pagare ai SAL", euroContratto(eco.nettoAiSal), true)}
  </table>
  ${articoli.map((a, i) => `<h2>Art. ${i + 1} – ${esc(a.titolo)}</h2>${a.paragrafi.map((p) => `<p>${esc(p)}</p>`).join("")}`).join("\n  ")}
  <div class="firme"><div>L'Affidataria</div><div>Il Subappaltatore</div></div>
  <p class="clausole">Ai sensi degli artt. 1341 e 1342 c.c. il Subappaltatore approva specificamente: ${esc(articoliDaApprovare(articoli))}.</p>
  <div class="firme"><div></div><div>Il Subappaltatore</div></div>
  ${d.elencoLavori?.length ? `<section class="allegato">
  <h1>ALLEGATO A – ELENCO DEI LAVORI</h1>
  <p class="sotto">Commessa ${esc(d.commessa.codice)}${codiciElenco(d.elencoLavori).riferimento ? ` · dal preventivo ${esc(codiciElenco(d.elencoLavori).riferimento)}` : ""} · ${esc(d.subappaltatore.ragioneSociale)} · prezzi IVA esclusa</p>
  <table class="elenco"><thead><tr><th>Descrizione</th><th>U.M.</th><th>Quantità</th><th>Prezzo unitario</th><th>Importo</th></tr></thead><tbody>
  ${elencoPerFase(d.elencoLavori).map((g) => `<tr class="fase"><td colspan="4">${esc(g.fase)}</td><td class="n">${euroContratto(g.totale)}</td></tr>${g.righe.map((r) => `<tr><td>${codiciElenco(d.elencoLavori!).perRiga && r.codice ? `${esc(r.codice)} · ` : ""}${esc(r.descrizione)}</td><td>${esc(r.unita ?? "")}</td><td class="n">${quantitaContratto(r.quantita)}</td><td class="n">${euroContratto(r.prezzo)}</td><td class="n">${euroContratto(r.importo)}</td></tr>`).join("")}`).join("")}
  <tr class="tot"><td colspan="4">Totale lavori</td><td class="n">${euroContratto(totaleElencoLavori(d.elencoLavori))}</td></tr>
  </tbody></table>
  <div class="firme"><div>L'Affidataria</div><div>Il Subappaltatore, per accettazione</div></div>
  </section>` : ""}
</body></html>`;
}

/**
 * L'elenco dei lavori da lasciare in cantiere (Dimora Torino, 31/10/2026): gli stessi lavori
 * dell'Allegato A, con unità e quantità ma senza prezzi, importi e totali. Per chi lavora in
 * cantiere e non deve vedere le cifre.
 */
export function elencoCantiereSenzaCifre(d: DatiContrattoSubappalto): Array<{ fase: string; righe: Array<{ descrizione: string; unita: string; quantita: string }> }> {
  return elencoPerFase(d.elencoLavori ?? []).map((g) => ({
    fase: g.fase,
    righe: g.righe.map((r) => ({ descrizione: r.descrizione, unita: r.unita ?? "", quantita: quantitaContratto(r.quantita) })),
  }));
}

export function costruisciElencoCantiereHtml(d: DatiContrattoSubappalto): string {
  const gruppi = elencoCantiereSenzaCifre(d);
  return `<!DOCTYPE html>
<html lang="it"><head><meta charset="UTF-8"><title>Elenco lavori ${esc(d.commessa.codice)}</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font-family: Arial, sans-serif; color: #111; font-size: 11pt; max-width: 800px; margin: 24px auto; }
  h1 { font-size: 16pt; margin-bottom: 4px; color: #2b6cb0; }
  .sotto { color: #555; margin-bottom: 16px; font-size: 10pt; }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  th, td { border: 1px solid #999; padding: 4px 6px; vertical-align: top; }
  th { background: #eee; text-align: left; }
  td.n { text-align: right; white-space: nowrap; }
  tr.fase td { background: #f5f5f5; font-weight: bold; }
</style></head><body>
  <h1>ELENCO LAVORI</h1>
  <p class="sotto">${esc(d.committente.ragioneSociale)} · ditta ${esc(d.subappaltatore.ragioneSociale)} · commessa ${esc(d.commessa.codice)} · cantiere ${esc(d.commessa.indirizzoCantiere || "—")}</p>
  <table><thead><tr><th>Lavoro</th><th>U.M.</th><th>Quantità</th></tr></thead><tbody>
  ${gruppi.map((g) => `<tr class="fase"><td colspan="3">${esc(g.fase)}</td></tr>${g.righe.map((r) => `<tr><td>${esc(r.descrizione)}</td><td>${esc(r.unita)}</td><td class="n">${esc(r.quantita)}</td></tr>`).join("")}`).join("")}
  </tbody></table>
</body></html>`;
}

/**
 * Gli articoli il cui testo standard dipende dai dati del contratto (importi, date, nomi): si personalizzano
 * solo nel singolo contratto, mai come standard dell'azienda (altrimenti gli importi di uno finirebbero in tutti).
 * Si riconoscono confrontando il testo prodotto da due contratti con dati diversi.
 */
export function articoliConDatiDelContratto(): Set<string> {
  const base = (n: number): DatiContrattoSubappalto => ({
    numero: `N${n}`, dataStipula: `202${n}-01-0${n}`,
    committente: { ragioneSociale: `Impresa ${n}`, partitaIva: `${n}`, indirizzo: `Via ${n}`, rappresentante: `R${n}` },
    subappaltatore: { ragioneSociale: `Ditta ${n}`, partitaIva: `${n}`, indirizzo: `Via ${n}`, email: "", pec: "" },
    ivaPct: 0, commessa: { codice: `C${n}`, descrizione: `D${n}`, indirizzoCantiere: `Cantiere ${n}`, cliente: `Cliente ${n}` },
    descrizioneLavori: `Lavori ${n}`, importo: 1000 * n, oneriSicurezza: 10 * n, ritenutaPct: n, dataInizio: `202${n}-02-0${n}`,
    dataFinePrevista: `202${n}-03-0${n}`, responsabileImpresa: `Resp ${n}`, referenteSubappaltatore: `Ref ${n}`, obblighi: null,
    modalitaPagamento: null, penali: null, garanzie: null, durataGaranziaMesi: 10 + n, note: null,
    elencoLavori: [{ fase: "F", descrizione: `L${n}`, unita: "m", quantita: n, prezzo: 1000, importo: 1000 * n }],
  });
  const a = articoliContratto(base(1)), b = articoliContratto(base(2));
  const out = new Set<string>();
  a.forEach((x, i) => { if (x.paragrafi.join("\n") !== b[i]?.paragrafi.join("\n")) out.add(x.titolo); });
  // Fatturazione dipende dall'IVA della ditta, che nei due contratti di prova è uguale; «Altre pattuizioni» è
  // tutto testo del singolo contratto (le note).
  out.add("Fatturazione");
  out.add("Altre pattuizioni");
  return out;
}

/** I dati da cui si calcolano i testi base degli articoli: senza le aggiunte del singolo contratto (obblighi
 * specifici, garanzie, note), che restano in coda da sole e non devono finire nei testi personalizzati. */
export function datiPerTestiBase(d: DatiContrattoSubappalto): DatiContrattoSubappalto {
  return { ...d, obblighi: null, garanzie: null, note: null };
}
