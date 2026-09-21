/**
 * Le condizioni generali di contratto che l'azienda si trova già scritte.
 *
 * Un preventivo firmato È il contratto: se il documento non porta con sé le
 * condizioni, quel contratto non dice niente su tempi, varianti, garanzie,
 * pagamenti e recesso. Al 20/09/2026 nessuna azienda vera ne aveva scritte:
 * 82 modelli del preventivo generico, zero righe di condizioni.
 *
 * Qui c'è il testo di base, per settore, con i merge tag già al posto giusto.
 * È un punto di partenza scritto sulle norme italiane più ricorrenti nei lavori
 * edili — NON è consulenza legale: chi lo usa lo rilegge e lo adatta con il
 * proprio consulente, e l'editor glielo dice.
 *
 * Forma del testo: markdown povero, quello che i PDF sanno impaginare —
 * `#` sezione, `##` articolo, `-` elenco, riga semplice = paragrafo.
 */

export type SettoreCondizioni =
  | "ristrutturazione" | "bagni" | "tetti" | "climatizzazione" | "elettrico"
  | "termoidraulico" | "pavimenti" | "piscine" | "serramenti" | "fotovoltaico"
  | "generico";

/** Il titolo dell'articolo che raccoglie le clausole da approvare a parte (art. 1341 c.c.). */
export const TITOLO_CLAUSOLE_SPECIFICHE = "Clausole da approvare specificamente";

/** Come si chiama il lavoro, nel testo: «i lavori», «la fornitura e posa»… */
const OGGETTO: Record<SettoreCondizioni, string> = {
  ristrutturazione: "i lavori di ristrutturazione",
  bagni: "i lavori di rifacimento del bagno",
  tetti: "i lavori di copertura",
  climatizzazione: "la fornitura e installazione degli impianti di climatizzazione",
  elettrico: "i lavori sull'impianto elettrico",
  termoidraulico: "i lavori sull'impianto termoidraulico",
  pavimenti: "la fornitura e posa dei pavimenti e rivestimenti",
  piscine: "la realizzazione della piscina",
  serramenti: "la fornitura e posa dei serramenti",
  fotovoltaico: "la fornitura e installazione dell'impianto fotovoltaico",
  generico: "i lavori e le forniture",
};

/** L'articolo che cambia da un settore all'altro: quello che in quel mestiere crea le liti. */
const ARTICOLO_DI_SETTORE: Record<SettoreCondizioni, { titolo: string; righe: string[] }> = {
  ristrutturazione: {
    titolo: "Stato dei luoghi e imprevisti",
    righe: [
      "Il preventivo è redatto sullo stato dei luoghi visibile al sopralluogo. Quanto emerge solo con le demolizioni — impianti non a norma, solai o murature ammalorate, tracce di umidità, materiali da smaltire come rifiuto speciale — non è compreso e viene quotato a parte prima di procedere.",
      "Lo sgombero dei locali e la custodia di mobili e oggetti sono a carico del Committente, salvo diverso accordo scritto.",
    ],
  },
  bagni: {
    titolo: "Finiture, impianti e imprevisti",
    righe: [
      "Sanitari, rubinetteria e rivestimenti si intendono scelti entro la data concordata: scelte successive possono spostare i tempi e i prezzi. Piccole differenze di tonalità fra lotti di ceramica non costituiscono difetto.",
      "Quanto emerge con le demolizioni — impianti non a norma, perdite, solai ammalorati — non è compreso e viene quotato a parte prima di procedere.",
    ],
  },
  tetti: {
    titolo: "Meteo, ponteggi e materiali da smaltire",
    righe: [
      "I lavori in copertura si eseguono in condizioni meteo idonee: le giornate perse per pioggia, neve o vento non sono ritardi imputabili all'impresa.",
      "Ponteggi, piattaforme e occupazione di suolo pubblico sono compresi solo se indicati nel preventivo, insieme alla relativa durata.",
      "L'eventuale presenza di amianto (lastre in cemento-amianto, canne fumarie) comporta un intervento di rimozione e smaltimento a ditta autorizzata, con piano di lavoro all'ASL: non è compreso e viene quotato a parte.",
    ],
  },
  climatizzazione: {
    titolo: "Posizionamento, autorizzazioni e conformità",
    righe: [
      "Il posizionamento delle unità esterne e i percorsi delle linee sono concordati in fase di sopralluogo. Eventuali autorizzazioni condominiali, paesaggistiche o del regolamento edilizio sono a carico del Committente.",
      "L'impresa rilascia la dichiarazione di conformità (D.M. 37/2008) e compila il libretto d'impianto; la registrazione dei gas fluorurati è eseguita da personale certificato (Reg. UE 517/2014).",
    ],
  },
  elettrico: {
    titolo: "Conformità dell'impianto",
    righe: [
      "A fine lavori l'impresa rilascia la dichiarazione di conformità prevista dal D.M. 37/2008 per la parte di impianto eseguita.",
      "Se l'impianto esistente non è a norma, l'adeguamento del quadro, del salvavita o dell'impianto di terra è compreso solo se indicato nel preventivo. L'eventuale aumento di potenza del contatore va richiesto dal Committente al proprio fornitore.",
    ],
  },
  termoidraulico: {
    titolo: "Conformità, canne fumarie e smaltimenti",
    righe: [
      "A fine lavori l'impresa rilascia la dichiarazione di conformità prevista dal D.M. 37/2008 e compila il libretto d'impianto.",
      "L'idoneità della canna fumaria esistente è verificata prima dell'installazione: se non idonea, il rifacimento non è compreso e viene quotato a parte. Lo smaltimento del vecchio generatore è compreso solo se indicato nel preventivo.",
    ],
  },
  pavimenti: {
    titolo: "Sottofondi, tonalità e tempi di asciugatura",
    righe: [
      "La posa presuppone un sottofondo asciutto, planare e stabile: livellamenti, rasature e massetti sono compresi solo se indicati nel preventivo.",
      "Differenze di tonalità e venatura fra lotti diversi, e fra il campione e la fornitura, sono caratteristiche del materiale e non costituiscono difetto. I tempi di asciugatura di massetti e colle vanno rispettati: il Committente non può anticipare l'uso dei locali.",
    ],
  },
  piscine: {
    titolo: "Scavo, autorizzazioni e collaudo",
    righe: [
      "Lo scavo è quotato su terreno di normale consistenza: roccia, falda, riporti o terre da smaltire come rifiuto comportano costi aggiuntivi, quotati prima di procedere. L'allontanamento delle terre di scavo è compreso solo se indicato.",
      "Titoli edilizi, autorizzazioni paesaggistiche e adempimenti verso il Comune sono a carico del Committente, salvo diverso accordo scritto.",
      "Il collaudo di tenuta della vasca e la messa in funzione dell'impianto di trattamento concludono i lavori; la manutenzione ordinaria e il trattamento chimico dell'acqua restano a carico del Committente.",
    ],
  },
  serramenti: {
    titolo: "Misure, posa e opere murarie",
    righe: [
      "Le misure definitive si rilevano in cantiere prima dell'ordine: fanno fede quelle del rilievo. Sono ammesse le tolleranze dimensionali previste dalle norme di prodotto.",
      "La posa comprende le opere indicate nel preventivo. Ripristini murari, tinteggiature, davanzali, zanzariere e oscuranti sono compresi solo se espressamente elencati. Lo smaltimento dei serramenti rimossi è compreso solo se indicato.",
      "Gli ordini di serramenti su misura sono realizzati su specifica del Committente: una volta confermati non sono annullabili né sostituibili.",
    ],
  },
  fotovoltaico: {
    titolo: "Connessione alla rete, pratiche e produzione",
    righe: [
      "L'impresa predispone e presenta la pratica di connessione al distributore e gli adempimenti verso il GSE indicati nel preventivo. I tempi del distributore e del GSE non dipendono dall'impresa e non sono computati nei tempi di esecuzione.",
      "Le stime di produzione, autoconsumo e risparmio sono calcoli previsionali basati su dati di irraggiamento e sui consumi dichiarati dal Committente: sono indicazioni, non un risultato garantito.",
      "L'idoneità statica della copertura e l'eventuale presenza di amianto sono verificate prima dell'installazione; gli interventi conseguenti non sono compresi e vengono quotati a parte.",
    ],
  },
  generico: {
    titolo: "Stato dei luoghi e imprevisti",
    righe: [
      "Il preventivo è redatto sullo stato dei luoghi visibile al sopralluogo. Quanto non era visibile e emerge in corso d'opera non è compreso e viene quotato a parte prima di procedere.",
    ],
  },
};

/**
 * Le condizioni generali del settore, in markdown.
 *
 * Gli articoli sono numerati: la numerazione serve all'ultimo articolo, quello
 * delle clausole da approvare a parte, e al riquadro della doppia firma nel PDF.
 */
export function condizioniStandard(settore: SettoreCondizioni = "generico"): string {
  const oggetto = OGGETTO[settore] ?? OGGETTO.generico;
  const settoriale = ARTICOLO_DI_SETTORE[settore] ?? ARTICOLO_DI_SETTORE.generico;

  const articoli: Array<{ titolo: string; righe: string[] }> = [
    {
      titolo: "Oggetto",
      righe: [
        `{{azienda.ragione_sociale}} (di seguito «l'Impresa») si impegna a eseguire ${oggetto} descritti nel preventivo {{preventivo.numero}} del {{preventivo.data}} per {{cliente.nome_completo}} (di seguito «il Committente»), presso {{cantiere.indirizzo}}.`,
        "Sono compresi soltanto i lavori, le forniture e le quantità indicati nel preventivo. Quanto non è elencato si intende escluso.",
      ],
    },
    {
      titolo: "Documenti del contratto",
      righe: [
        "Fanno parte del contratto, nell'ordine: il preventivo con il dettaglio delle lavorazioni, gli eventuali allegati tecnici e queste condizioni generali. In caso di contrasto prevale il preventivo per le quantità e i prezzi, queste condizioni per il resto.",
      ],
    },
    {
      titolo: "Corrispettivo, IVA e detrazioni fiscali",
      righe: [
        "Il corrispettivo è quello indicato nel preventivo: {{preventivo.totale}}. L'aliquota IVA applicata è quella indicata nel documento e dipende dal tipo di intervento e di immobile; se i presupposti dichiarati dal Committente risultano diversi, l'IVA viene ricalcolata come per legge.",
        "Le detrazioni fiscali eventualmente richiamate nel preventivo sono indicate a titolo informativo, sulla base della normativa vigente alla data del documento. La spettanza del beneficio dipende da requisiti soggettivi e da adempimenti del Committente: l'Impresa non ne garantisce il riconoscimento e non risponde di decadenze o modifiche normative.",
      ],
    },
    {
      titolo: "Pagamenti",
      righe: [
        "Il pagamento avviene secondo il piano concordato: {{preventivo.piano_pagamenti}}",
        "In caso di ritardo nei pagamenti l'Impresa può sospendere i lavori, previa comunicazione scritta, fino alla regolarizzazione; la sospensione prolunga i tempi di esecuzione di un periodo pari al ritardo e non costituisce inadempimento dell'Impresa. Sui ritardi si applicano gli interessi di legge.",
      ],
    },
    {
      titolo: "Tempi di esecuzione",
      righe: [
        "I tempi indicati nel preventivo sono stimati e decorrono dalla firma, dal ricevimento dell'acconto e dalla disponibilità effettiva del cantiere.",
        "Non sono imputabili all'Impresa i ritardi dovuti a cause non dipendenti da essa: maltempo, forza maggiore, indisponibilità dei luoghi, ritardi del Committente nelle scelte o nei pagamenti, ritardi di enti e gestori, indisponibilità di materiali sul mercato.",
      ],
    },
    {
      titolo: "Varianti e lavori non previsti",
      righe: [
        "Ogni variante o lavorazione aggiuntiva è concordata per iscritto prima dell'esecuzione, con l'indicazione del maggior prezzo e del maggior tempo. Le quantità del preventivo sono quelle rilevate al sopralluogo: le differenze riscontrate in corso d'opera sono contabilizzate a misura, ai prezzi unitari del preventivo.",
      ],
    },
    {
      titolo: "Obblighi del Committente",
      righe: [
        "Il Committente garantisce l'accesso ai luoghi negli orari di lavoro concordati, la disponibilità di acqua ed energia elettrica, uno spazio per il deposito dei materiali e lo sgombero delle aree interessate.",
        "Titoli abilitativi, autorizzazioni condominiali, permessi di occupazione del suolo pubblico e adempimenti verso gli enti sono a carico del Committente, salvo quelli espressamente assunti dall'Impresa nel preventivo.",
      ],
    },
    {
      titolo: "Sicurezza e regolarità",
      righe: [
        "L'Impresa opera nel rispetto del D.lgs. 81/2008, è in regola con gli obblighi contributivi e assicurativi ed è coperta da polizza di responsabilità civile. Quando l'intervento lo richiede, il Committente nomina i coordinatori per la sicurezza e l'Impresa consegna il proprio piano operativo.",
        "L'Impresa può affidare a terzi parte delle lavorazioni, restando l'unica responsabile verso il Committente.",
      ],
    },
    { titolo: settoriale.titolo, righe: settoriale.righe },
    {
      titolo: "Consegna e verifica dei lavori",
      righe: [
        "A fine lavori le parti verificano insieme l'opera. Eventuali difformità vanno annotate in quel momento; quelle non annotate e riconoscibili si intendono accettate. Il Committente non può occupare o utilizzare l'opera prima della verifica e del saldo, salvo diverso accordo scritto.",
      ],
    },
    {
      titolo: "Garanzie",
      righe: [
        "L'Impresa garantisce l'opera per i vizi e le difformità ai sensi degli artt. 1667 e 1669 c.c. I materiali e i prodotti forniti sono coperti dalla garanzia del produttore.",
        "Se il Committente è un consumatore, resta ferma la garanzia legale di conformità dei beni prevista dal Codice del Consumo (artt. 135-bis e seguenti, D.lgs. 206/2005).",
        "Sono esclusi dalla garanzia i difetti dovuti a uso improprio, mancata manutenzione, interventi di terzi, modifiche non autorizzate e normale usura.",
      ],
    },
    {
      titolo: "Riserva di proprietà",
      righe: [
        "I materiali e i beni forniti restano di proprietà dell'Impresa fino al pagamento integrale del corrispettivo.",
      ],
    },
    {
      titolo: "Recesso del consumatore",
      righe: [
        "Se il Committente è un consumatore e il contratto è concluso fuori dei locali commerciali dell'Impresa o a distanza, egli ha diritto di recedere entro 14 giorni dalla conclusione, senza motivazione e senza costi, ai sensi degli artt. 52 e seguenti del D.lgs. 206/2005. Per esercitarlo può usare il modulo allegato a questo documento o una qualsiasi dichiarazione esplicita, inviata a {{azienda.email}}.",
        "Se il Committente chiede espressamente che i lavori inizino prima della scadenza dei 14 giorni, in caso di recesso è tenuto a pagare quanto già eseguito, in proporzione al contratto; a lavori interamente eseguiti con il suo accordo espresso, il diritto di recesso si perde.",
      ],
    },
    {
      titolo: "Trattamento dei dati personali",
      righe: [
        "I dati del Committente sono trattati da {{azienda.ragione_sociale}}, titolare del trattamento, per l'esecuzione del contratto e per gli adempimenti di legge, e conservati per il tempo previsto dalle norme fiscali e civilistiche. Il Committente può esercitare i diritti degli artt. 15-22 del Reg. UE 2016/679 scrivendo a {{azienda.email}}.",
      ],
    },
    {
      titolo: "Legge applicabile e foro competente",
      righe: [
        "Il contratto è regolato dalla legge italiana. Per ogni controversia è competente il foro della sede dell'Impresa; se il Committente è un consumatore, è competente in via esclusiva il foro del suo luogo di residenza o domicilio eletto.",
      ],
    },
  ];

  const corpo = articoli
    .map((a, i) => `## Art. ${i + 1} — ${a.titolo}\n${a.righe.join("\n")}`)
    .join("\n\n");

  // Le clausole che la legge vuole approvate a parte, con una seconda firma
  // (art. 1341 c.c.). Verso un consumatore la doppia firma non sana una clausola
  // vessatoria — valgono gli artt. 33 e seguenti del Codice del Consumo — ma
  // l'elenco resta, perché è ciò che rende il documento un contratto completo.
  const numeri = {
    pagamenti: 4, tempi: 5, varianti: 6, consegna: articoli.findIndex((a) => a.titolo === "Consegna e verifica dei lavori") + 1,
    proprieta: articoli.findIndex((a) => a.titolo === "Riserva di proprietà") + 1,
    foro: articoli.length,
  };
  const specifiche = `# ${TITOLO_CLAUSOLE_SPECIFICHE}

Ai sensi degli artt. 1341 e 1342 c.c. il Committente approva specificamente le clausole seguenti, con una seconda firma:
- Art. ${numeri.pagamenti} — Pagamenti (sospensione dei lavori in caso di ritardo)
- Art. ${numeri.tempi} — Tempi di esecuzione (cause non imputabili all'Impresa)
- Art. ${numeri.varianti} — Varianti e lavori non previsti (contabilizzazione a misura)
- Art. ${numeri.consegna} — Consegna e verifica dei lavori (difformità non annotate)
- Art. ${numeri.proprieta} — Riserva di proprietà
- Art. ${numeri.foro} — Legge applicabile e foro competente`;

  return `# Condizioni generali di contratto\n\n${corpo}\n\n${specifiche}`;
}

/** Retrocompatibilità: il testo generico, come prima. */
export const CONDIZIONI_STANDARD_MD = condizioniStandard("generico");

// ─── Leggere le condizioni: dal markdown povero alle righe da impaginare ─────

export type RigaCondizioni = { tipo: "h1" | "h2" | "li" | "p"; testo: string };

/**
 * Le condizioni riga per riga: `#` sezione, `##` articolo, `-` elenco, il resto
 * paragrafo. Ogni motore dei documenti le impagina a modo suo, ma le legge
 * così: un motore che stampava il testo com'era mostrava «## Art. 1» al cliente.
 */
export function righeDelleCondizioni(testo: string): RigaCondizioni[] {
  return String(testo ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r): RigaCondizioni => {
      const h = /^(#{1,4})\s+(.+)$/.exec(r);
      if (h) return { tipo: h[1].length === 1 ? "h1" : "h2", testo: h[2].trim() };
      const li = /^[-*•]\s+(.+)$/.exec(r);
      if (li) return { tipo: "li", testo: li[1].trim() };
      return { tipo: "p", testo: r };
    });
}

const eIlTitoloDelleClausole = (r: RigaCondizioni) =>
  (r.tipo === "h1" || r.tipo === "h2") && /1341|approvare specificamente/i.test(r.testo);

/**
 * Le clausole che il cliente approva con una seconda firma (art. 1341 c.c.): le
 * voci elencate sotto quel titolo. Si leggono dal testo, così valgono anche per
 * le condizioni scritte dall'azienda — senza quel titolo, niente seconda firma.
 */
export function clausoleDaApprovare(righe: RigaCondizioni[]): string[] {
  const inizio = righe.findIndex(eIlTitoloDelleClausole);
  if (inizio < 0) return [];
  const voci: string[] = [];
  for (const r of righe.slice(inizio + 1)) {
    if (r.tipo === "h1" || r.tipo === "h2") break;
    if (r.tipo === "li") voci.push(r.testo);
  }
  return voci;
}

/**
 * Le righe da stampare nel testo: senza il titolo generale (la pagina ha il suo)
 * e senza la sezione delle clausole, che va nel riquadro della seconda firma.
 */
export function righeDaStampare(righe: RigaCondizioni[], { conRiquadroFirma }: { conRiquadroFirma: boolean }): RigaCondizioni[] {
  const senzaTitolo = righe.length > 0 && righe[0].tipo === "h1" ? righe.slice(1) : righe;
  if (!conRiquadroFirma) return senzaTitolo;
  const inizio = senzaTitolo.findIndex(eIlTitoloDelleClausole);
  if (inizio < 0) return senzaTitolo;
  let fine = senzaTitolo.length;
  for (let i = inizio + 1; i < senzaTitolo.length; i++) {
    if (senzaTitolo[i].tipo === "h1" || senzaTitolo[i].tipo === "h2") { fine = i; break; }
  }
  return [...senzaTitolo.slice(0, inizio), ...senzaTitolo.slice(fine)];
}

/** Articolo per articolo: ogni titolo con il suo testo, per non lasciare titoli orfani. */
export function perArticoli(righe: RigaCondizioni[]): RigaCondizioni[][] {
  const gruppi: RigaCondizioni[][] = [];
  for (const r of righe) {
    if (r.tipo === "h1" || r.tipo === "h2" || gruppi.length === 0) gruppi.push([]);
    gruppi[gruppi.length - 1].push(r);
  }
  return gruppi;
}

// ─── Il modulo di recesso ────────────────────────────────────────────────────

/**
 * Il modulo di recesso tipo (Allegato I, parte B, D.lgs. 206/2005), da consegnare
 * insieme al contratto quando le condizioni prevedono il recesso del consumatore:
 * se non lo si consegna, il termine per recedere non è più di 14 giorni ma si
 * allunga di un anno. Un testo solo, per tutti i documenti.
 */
export const MODULO_RECESSO = {
  titolo: "Modulo di recesso",
  istruzioni: "Da compilare e restituire soltanto se si intende recedere dal contratto, nei termini indicati nelle condizioni generali. Non serve motivarlo.",
  dichiarazione: (riferimento: string | null) =>
    `Con la presente io/noi notifico/notifichiamo il recesso dal contratto relativo ai lavori e alle forniture di cui al preventivo${riferimento ? ` ${riferimento}` : ""}.`,
  campi: ["Data del contratto", "Nome e cognome del consumatore", "Indirizzo del consumatore"],
  firme: ["Data", "Firma del consumatore (solo se su carta)"],
} as const;
