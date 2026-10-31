/**
 * Otto documenti d'esempio per il lettore unico di Silvio (fase 1, lotto 1.2): due contratti,
 * un capitolato, un PDF generico, una foto, una piantina e due testi. Tutto INVENTATO (il
 * repository è pubblico): nomi, indirizzi, codici e cifre non sono di nessuno.
 *
 * Per ognuno c'è anche la risposta del provider finto, come la darebbe un modello che
 * legge bene, con qualche scivolone voluto: una data calcolata e non scritta, una
 * citazione che nel documento non c'è, una chiave fuori registro, un importo senza prova.
 * Il lettore deve tenere i valori giusti e declassare gli altri.
 */

export type TipoFile = "pdf" | "jpeg" | "png" | "testo";

export interface DocumentoDiProva {
  nome: string;
  tipo: TipoFile;
  fonte: "contratto" | "documento" | "testo";
  /** Le pagine del PDF, riga per riga. */
  pagine?: string[][];
  /** Il testo libero. */
  testo?: string;
  /** La risposta del modello finto. */
  risposta: unknown;
}

const v = (valore: unknown, citazione: string | null, dove: string | null = null, fiducia = 0.9) =>
  ({ valore, citazione, dove, fiducia });

export const CONTRATTO_PUBBLICO: DocumentoDiProva = {
  nome: "Contratto_appalto_Tigli.pdf",
  tipo: "pdf",
  fonte: "contratto",
  pagine: [
    [
      "CONTRATTO D'APPALTO N. 2027/014",
      "tra il Condominio Via dei Tigli 12, con sede in Via dei Tigli 12, 20900 Monza (MB), di seguito «Committente»",
      "e Impresa Esempio S.r.l., di seguito «Appaltatore»",
      "Oggetto: riqualificazione energetica delle facciate e della copertura",
      "CIG: 9A1B2C3D4E   CUP: J41B27000080001",
    ],
    [
      "Art. 3 - Importo",
      "L'importo dei lavori è di € 184.500,00 (centottantaquattromilacinquecento/00) oltre IVA al 10%.",
      "Art. 4 - Tempi",
      "I lavori avranno inizio il 01/03/2027 e dovranno essere ultimati entro 120 giorni naturali e consecutivi.",
      "Art. 5 - Penali",
      "Per ogni giorno di ritardo si applica una penale pari allo 0,5 per mille dell'importo contrattuale, fino a un massimo del 10%.",
    ],
    [
      "Art. 7 - Pagamenti",
      "È riconosciuta un'anticipazione del 20% dell'importo contrattuale.",
      "I SAL saranno emessi ogni volta che i lavori raggiungono un importo di € 40.000,00, con pagamento a 60 giorni dalla data della fattura.",
      "Su ogni SAL si opera una ritenuta di garanzia dello 0,50%.",
      "Art. 9 - Subappalto",
      "Il subappalto è ammesso nei limiti del 50% dell'importo contrattuale.",
      "Direttore dei lavori: ing. Paolo Verdi, dl.verdi@esempio.invalid",
    ],
  ],
  risposta: {
    aree: {
      identita: {
        "identita.description": v("Riqualificazione energetica delle facciate e della copertura", "riqualificazione energetica delle facciate e della copertura", "pagina 1"),
      },
      cliente: {
        "cliente.nome": v({ client_company: "Condominio Via dei Tigli 12" }, "tra il Condominio Via dei Tigli 12", "pagina 1"),
      },
      cantiere: {
        "cantiere.indirizzo": v("Via dei Tigli 12, 20900 Monza (MB)", "Via dei Tigli 12, 20900 Monza (MB)", "pagina 1"),
      },
      economia: {
        "economia.total_amount": v(184500, "L'importo dei lavori è di € 184.500,00", "pagina 2", 0.95),
        "economia.vat_rate": v(10, "oltre IVA al 10%", "pagina 2"),
        "economia.condizioni_contratto": {
          valore: {
            numero_contratto: v("2027/014", "CONTRATTO D'APPALTO N. 2027/014", "pagina 1"),
            durata_giorni: v(120, "entro 120 giorni naturali e consecutivi", "pagina 2"),
            penale_giorno_permille: v(0.5, "una penale pari allo 0,5 per mille dell'importo contrattuale", "pagina 2"),
            penale_massima_pct: v(10, "fino a un massimo del 10%", "pagina 2"),
            ritenuta_garanzia_pct: v(0.5, "ritenuta di garanzia dello 0,50%", "pagina 3"),
            anticipo_pct: v(20, "un'anticipazione del 20% dell'importo contrattuale", "pagina 3"),
            pagamento_giorni: v(60, "con pagamento a 60 giorni dalla data della fattura", "pagina 3"),
            subappalto_ammesso: v(true, "Il subappalto è ammesso", "pagina 3"),
            subappalto_massimo_pct: v(50, "nei limiti del 50% dell'importo contrattuale", "pagina 3"),
            cig: v("9A1B2C3D4E", "CIG: 9A1B2C3D4E", "pagina 1"),
            cup: v("J41B27000080001", "CUP: J41B27000080001", "pagina 1"),
          },
          fiducia: 0.9,
        },
      },
      pagamenti: {
        "pagamenti.rate": v(
          [{ label: "Anticipazione", type: "deposit", percent: 20, trigger_evento: "firma_contratto" }],
          "È riconosciuta un'anticipazione del 20% dell'importo contrattuale.", "pagina 3", 0.8,
        ),
      },
      fasi: {
        "fasi.work_start_date": v("2027-03-01", "I lavori avranno inizio il 01/03/2027", "pagina 2"),
        // Calcolata dal modello (120 giorni dal 1° marzo): nel documento la data non c'è.
        "fasi.work_end_date": v("2027-06-28", "entro 120 giorni naturali e consecutivi", "pagina 2", 0.8),
      },
      sal_scadenze: {
        "sal_scadenze.sal": v({ cadenza: "a importo", importo_minimo_eur: 40000 },
          "ogni volta che i lavori raggiungono un importo di € 40.000,00", "pagina 3"),
      },
      comunicazione: {
        "comunicazione.direttore_lavori": v({ dl_notification_email: "dl.verdi@esempio.invalid" }, "dl.verdi@esempio.invalid", "pagina 3"),
      },
    },
  },
};

export const CONTRATTO_PRIVATO: DocumentoDiProva = {
  nome: "Scrittura privata Rossi.pdf",
  tipo: "pdf",
  fonte: "contratto",
  pagine: [
    [
      "SCRITTURA PRIVATA PER LAVORI EDILI",
      "Il sig. Mario Rossi, residente in Via Inventata 5, 20121 Milano, tel. 333 1234567, email mario.rossi@esempio.invalid (committente)",
      "affida all'impresa i lavori di rifacimento del bagno e della cucina nell'appartamento di Via Inventata 5, Milano.",
      "Corrispettivo: euro 38.000,00 oltre IVA 10%.",
    ],
    [
      "Modalità di pagamento: 30% alla firma del presente accordo, 40% a metà dei lavori, 30% a fine lavori.",
      "Inizio lavori: 15 gennaio 2027. Per ogni giorno di ritardo nella consegna è dovuta una penale di 50 euro.",
      "Non è consentito il subappalto. Garanzia sui lavori: 2 anni.",
    ],
  ],
  risposta: {
    aree: {
      identita: {
        "identita.description": v("Rifacimento bagno e cucina", "lavori di rifacimento del bagno e della cucina", "pagina 1"),
        "identita.tipo_lavoro": v("bagno", "rifacimento del bagno e della cucina", "pagina 1", 0.75),
      },
      cliente: {
        "cliente.nome": v({ client_name: "Mario Rossi" }, "Il sig. Mario Rossi", "pagina 1"),
        "cliente.contatto": v({ client_phone: "333 1234567", client_email: "Mario.Rossi@esempio.invalid" }, "tel. 333 1234567, email mario.rossi@esempio.invalid", "pagina 1"),
        "cliente.client_address": v("Via Inventata 5, 20121 Milano", "residente in Via Inventata 5, 20121 Milano", "pagina 1"),
      },
      cantiere: {
        "cantiere.indirizzo": v({ indirizzo_lavori: "Via Inventata 5, Milano" }, "nell'appartamento di Via Inventata 5, Milano", "pagina 1"),
      },
      economia: {
        // Il modello scrive l'importo come testo all'italiana: si legge lo stesso.
        "economia.total_amount": v("38.000,00", "Corrispettivo: euro 38.000,00 oltre IVA 10%", "pagina 1"),
        "economia.vat_rate": v(10, "Corrispettivo: euro 38.000,00 oltre IVA 10%", "pagina 1"),
        "economia.condizioni_contratto": {
          valore: {
            penale_giorno_eur: v(50, "è dovuta una penale di 50 euro", "pagina 2"),
            subappalto_ammesso: v(false, "Non è consentito il subappalto", "pagina 2"),
            garanzia_anni: v(2, "Garanzia sui lavori: 2 anni", "pagina 2"),
          },
          fiducia: 0.85,
        },
      },
      pagamenti: {
        "pagamenti.rate": v([
          { label: "Alla firma", type: "deposit", percent: 30, trigger_evento: "firma_contratto" },
          { label: "A metà lavori", type: "deposit", percent: 40, trigger_evento: "a_meta_lavori" },
          { label: "Saldo", type: "balance", percent: 30, trigger_evento: "fine_lavori" },
        ], "30% alla firma del presente accordo, 40% a metà dei lavori, 30% a fine lavori", "pagina 2"),
      },
      fasi: {
        "fasi.work_start_date": v("2027-01-15", "Inizio lavori: 15 gennaio 2027", "pagina 2"),
        // Inventata: nel documento non c'è.
        "fasi.expected_date": v("2027-03-15", "consegna prevista a metà marzo", "pagina 2", 0.7),
      },
    },
  },
};

export const CAPITOLATO: DocumentoDiProva = {
  nome: "Capitolato copertura capannone.pdf",
  tipo: "pdf",
  fonte: "documento",
  pagine: [
    [
      "CAPITOLATO SPECIALE D'APPALTO",
      "Rifacimento della copertura del capannone di Via dei Pioppi 8, Lodi (superficie 240 mq)",
      "Le lavorazioni comprendono, nell'ordine: montaggio dei ponteggi; rimozione del manto esistente; isolamento termico; posa del nuovo manto in lamiera; lattoneria.",
    ],
    [
      "I materiali saranno stoccati nel cortile interno, lato nord.",
      "Sui pagamenti si applica la ritenuta di garanzia dello 0,5 %.",
      "Il prezzo a corpo è fissato in € 96.000 (novantaseimila) IVA esclusa.",
    ],
  ],
  risposta: {
    aree: {
      identita: {
        "identita.description": v("Rifacimento della copertura del capannone", "Rifacimento della copertura del capannone", "pagina 1"),
        "identita.tipo_lavoro": v("tetti", "Rifacimento della copertura", "pagina 1"),
      },
      cantiere: {
        "cantiere.indirizzo": v("Via dei Pioppi 8, Lodi", "capannone di Via dei Pioppi 8, Lodi", "pagina 1"),
        "cantiere.materials_location": v("Cortile interno, lato nord", "I materiali saranno stoccati nel cortile interno, lato nord.", "pagina 2"),
      },
      economia: {
        "economia.total_amount": v(96000, "€ 96.000 (novantaseimila) IVA esclusa", "pagina 2"),
        "economia.condizioni_contratto": { valore: { ritenuta_garanzia_pct: v(0.5, "ritenuta di garanzia dello 0,5 %", "pagina 2") }, fiducia: 0.9 },
      },
      fasi: {
        "fasi.order_work_phases": v(
          [
            { name: "Montaggio dei ponteggi" }, { name: "Rimozione del manto esistente" }, { name: "Isolamento termico" },
            { name: "Posa del nuovo manto in lamiera" }, { name: "Lattoneria" },
          ],
          "montaggio dei ponteggi; rimozione del manto esistente; isolamento termico; posa del nuovo manto in lamiera; lattoneria",
          "pagina 1", 0.85,
        ),
      },
    },
  },
};

export const RELAZIONE_SOPRALLUOGO: DocumentoDiProva = {
  nome: "Relazione sopralluogo Verdi.pdf",
  tipo: "pdf",
  fonte: "documento",
  pagine: [[
    "RELAZIONE DI SOPRALLUOGO del 12/11/2026",
    "Cliente: Anna Verdi - cell. 347 7654321 - anna.verdi@esempio.invalid",
    "Immobile: villetta in Via delle Rose 21, 24100 Bergamo",
    "Richiesta: sostituzione di 12 finestre in legno con serramenti in PVC, colore bianco.",
    "Accesso al cantiere da cancello carraio; materiale scaricabile nel box.",
  ]],
  risposta: {
    aree: {
      identita: {
        "identita.description": v("Sostituzione di 12 finestre", "sostituzione di 12 finestre in legno", "pagina 1"),
        "identita.work_description": v("Sostituzione di 12 finestre in legno con serramenti in PVC bianco",
          "sostituzione di 12 finestre in legno con serramenti in PVC, colore bianco", "pagina 1"),
        "identita.tipo_lavoro": v("serramenti", "serramenti in PVC", "pagina 1"),
      },
      cliente: {
        "cliente.nome": v({ client_name: "Anna Verdi" }, "Cliente: Anna Verdi", "pagina 1"),
        "cliente.contatto": v({ client_phone: "347 7654321", client_email: "anna.verdi@esempio.invalid" }, "cell. 347 7654321 - anna.verdi@esempio.invalid", "pagina 1"),
      },
      cantiere: {
        "cantiere.indirizzo": v("Via delle Rose 21, 24100 Bergamo", "villetta in Via delle Rose 21, 24100 Bergamo", "pagina 1"),
        "cantiere.materials_location": v("Nel box", "materiale scaricabile nel box", "pagina 1"),
        // Fuori registro: deve finire negli avvisi.
        "cantiere.accesso": v("cancello carraio", "Accesso al cantiere da cancello carraio", "pagina 1"),
      },
      persone: {
        // Nel registro, ma non si ricava da un documento: avviso.
        "persone.assigned_to": v("Anna Verdi", "Cliente: Anna Verdi", "pagina 1"),
      },
    },
    avvisi: ["la relazione non dice l'importo"],
  },
};

/** I primi byte di un JPEG e di un PNG: alla funzione basta riconoscerli. */
export const BYTE_JPEG = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01];
export const BYTE_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d];

export const FOTO_BAGNO: DocumentoDiProva = {
  nome: "foto_bagno.jpg",
  tipo: "jpeg",
  fonte: "documento",
  risposta: {
    aree: {
      identita: {
        "identita.internal_notes": v("Bagno di circa 2,10 × 2,80 m con vasca da rimuovere e piastrelle da demolire",
          "vasca", "foto", 0.85),
        "identita.tipo_lavoro": v("bagno", "vasca", "foto", 0.8),
      },
      economia: {
        // Dalla foto il prezzo non si legge: senza citazione resta una proposta debole.
        "economia.total_amount": v(9000, null, "foto", 0.5),
      },
    },
  },
};

export const PIANTINA: DocumentoDiProva = {
  nome: "piantina_appartamento.png",
  tipo: "png",
  fonte: "documento",
  risposta: {
    aree: {
      identita: {
        "identita.work_description": v("Appartamento: soggiorno 24,5 mq, cucina 10 mq, camera 14 mq, bagno 5,5 mq",
          "SOGGIORNO 24,5 mq · CUCINA 10 mq · CAMERA 14 mq · BAGNO 5,5 mq", "piantina", 0.85),
      },
    },
  },
};

export const TESTO_BAGNO: DocumentoDiProva = {
  nome: "testo scritto",
  tipo: "testo",
  fonte: "testo",
  testo: "rifare bagno 6 mq a Monza in via Inventata 3, 12k, inizio lunedì 8 marzo 2027",
  risposta: {
    aree: {
      identita: {
        "identita.description": v("Rifacimento bagno 6 mq", "rifare bagno 6 mq", "testo"),
        "identita.tipo_lavoro": v("bagno", "rifare bagno", "testo"),
      },
      cantiere: { "cantiere.indirizzo": v("via Inventata 3, Monza", "a Monza in via Inventata 3", "testo") },
      economia: { "economia.total_amount": v(12000, "12k", "testo", 0.8) },
      fasi: { "fasi.work_start_date": v("2027-03-08", "inizio lunedì 8 marzo 2027", "testo") },
    },
  },
};

export const TESTO_TINTEGGIATURA: DocumentoDiProva = {
  nome: "testo scritto",
  tipo: "testo",
  fonte: "testo",
  testo: "Tinteggiatura interna appartamento di 90 mq per la sig.ra Bianchi (tel. 333 0000000), prezzo concordato 4.500 euro più IVA al 22%.",
  risposta: {
    aree: {
      identita: { "identita.description": v("Tinteggiatura interna appartamento 90 mq", "Tinteggiatura interna appartamento di 90 mq", "testo") },
      cliente: {
        "cliente.nome": v({ client_name: "Bianchi" }, "per la sig.ra Bianchi", "testo"),
        "cliente.contatto": v({ client_phone: "333 0000000" }, "tel. 333 0000000", "testo"),
        // Inventato: la via non c'è nel testo.
        "cantiere.indirizzo": v("via Garibaldi 1", "via Garibaldi 1", "testo", 0.6),
      },
      economia: {
        "economia.total_amount": v(4500, "prezzo concordato 4.500 euro", "testo"),
        "economia.vat_rate": v(22, "più IVA al 22%", "testo"),
        // Fuori registro.
        "economia.margine_previsto": v(1200, null, "testo"),
      },
      fasi: {
        // Senza citazione: l'inizio il testo non lo dice.
        "fasi.work_start_date": v("2027-01-10", null, "testo", 0.6),
      },
    },
  },
};

export const OTTO_DOCUMENTI: readonly DocumentoDiProva[] = [
  CONTRATTO_PUBBLICO, CONTRATTO_PRIVATO, CAPITOLATO, RELAZIONE_SOPRALLUOGO, FOTO_BAGNO, PIANTINA, TESTO_BAGNO, TESTO_TINTEGGIATURA,
];
