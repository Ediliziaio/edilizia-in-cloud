/**
 * MP-EMAIL-AI-01 — Set di fixture email per testare la cascata L1.
 *
 * Copertura tutte le 13 categorie + casi edge.
 * Le mock email rappresentano traffico realistico per un'impresa edile italiana.
 *
 * Ogni fixture ha:
 *   - `input`: ciò che vede il classifier
 *   - `expected_categoria`: la categoria attesa
 *   - `expected_matched_by_prefix`: prefisso atteso di matched_by (opzionale)
 *   - `expect_l1_resolves`: true se L1 DEVE risolverla (per stats hit rate)
 */

import type { EmailCategoria, EmailInput } from "../types";

export interface EmailFixture {
  id: string;
  description: string;
  input: EmailInput;
  expected_categoria: EmailCategoria;
  expected_matched_by_prefix?: string;
  /** Se true, conta nel calcolo della % L1 hit rate. */
  expect_l1_resolves: boolean;
  /** Se categoria non importa (es. ambigui by design), default false. */
  ambiguous?: boolean;
}

export const EMAIL_FIXTURES: EmailFixture[] = [
  // ─── Fatture (5 esempi) ────────────────────────────────────────────────────
  {
    id: "f1",
    description: "Fattura elettronica SDI da fornitore",
    input: {
      from_email: "amministrazione@fornitore-edile.it",
      subject: "Fattura n. 2026/0142 — Forniture Q1",
      snippet: "In allegato fattura elettronica del 28/05/2026 per le forniture del primo trimestre. Saldo entro 30gg.",
    },
    expected_categoria: "fattura",
    expected_matched_by_prefix: "regex:fattura",
    expect_l1_resolves: true,
  },
  {
    id: "f2",
    description: "Nota di credito",
    input: {
      from_email: "contabilita@edilforniture.it",
      subject: "Nota di credito #45/2026 reso materiale",
      snippet: "Nota di credito emessa per reso del DDT 12 del 15/05.",
    },
    expected_categoria: "fattura",
    expected_matched_by_prefix: "regex:fattura",
    expect_l1_resolves: true,
  },
  {
    id: "f3",
    description: "Proforma",
    input: {
      from_email: "info@forn-isolanti.it",
      subject: "Fattura proforma n.123 - pannelli isolanti",
      snippet: "Buongiorno, in allegato la proforma per i pannelli isolanti richiesti.",
    },
    expected_categoria: "fattura",
    expected_matched_by_prefix: "regex:fattura",
    expect_l1_resolves: true,
  },
  {
    id: "f4",
    description: "Sollecito pagamento fattura",
    input: {
      from_email: "crediti@grossista.it",
      subject: "SOLLECITO pagamento fattura scaduta",
      snippet: "La fattura n.89 del 30/03 risulta insoluta. Vi invitiamo a saldare entro 7gg.",
    },
    expected_categoria: "fattura",
    expected_matched_by_prefix: "regex:fattura",
    expect_l1_resolves: true,
  },
  {
    id: "f5",
    description: "Aruba SDI ricezione",
    input: {
      from_email: "sdi@arubapec.it",
      subject: "Ricevuta consegna SDI fattura",
      snippet: "Identificativo invio: 123456. Ricevuta di consegna allo SdI dell'Agenzia delle Entrate.",
    },
    expected_categoria: "fattura",
    expected_matched_by_prefix: "regex:fattura",
    expect_l1_resolves: true,
  },

  // ─── Preventivi (3) ────────────────────────────────────────────────────────
  {
    id: "p1",
    description: "Richiesta preventivo da privato",
    input: {
      from_email: "mario.rossi@gmail.com",
      subject: "Richiesta preventivo ristrutturazione bagno",
      snippet: "Buongiorno, vi contatto per chiedervi un preventivo per la ristrutturazione del bagno. Vorrei un sopralluogo se possibile.",
    },
    expected_categoria: "preventivo",
    expected_matched_by_prefix: "regex:preventivo",
    expect_l1_resolves: true,
  },
  {
    id: "p2",
    description: "Capitolato tecnico per gara",
    input: {
      from_email: "ufficio.gare@comune.milano.it",
      subject: "Capitolato gara appalto ristrutturazione scuola",
      snippet: "Inviamo capitolato e computo metrico per la gara di appalto in oggetto.",
    },
    expected_categoria: "preventivo",
    expected_matched_by_prefix: "regex:preventivo",
    expect_l1_resolves: true,
  },
  {
    id: "p3",
    description: "Offerta commerciale fornitore (preventivo INVERSO)",
    input: {
      from_email: "vendite@ceramiche-italia.it",
      subject: "Offerta commerciale piastrelle gres",
      snippet: "In risposta alla vostra richiesta, alleghiamo la nostra offerta commerciale.",
    },
    expected_categoria: "preventivo",
    expected_matched_by_prefix: "regex:preventivo",
    expect_l1_resolves: true,
  },

  // ─── Fornitori — DDT/ordini (3) ───────────────────────────────────────────
  {
    id: "fo1",
    description: "DDT consegna materiale",
    input: {
      from_email: "logistica@cementiamoroso.it",
      subject: "DDT 234 - consegna cemento via Roma 12",
      snippet: "In allegato il documento di trasporto per la consegna prevista domani mattina.",
    },
    expected_categoria: "fornitore",
    expected_matched_by_prefix: "regex:fornitore",
    expect_l1_resolves: true,
  },
  {
    id: "fo2",
    description: "Conferma ordine fornitore",
    input: {
      from_email: "ordini@laterizi-mediterraneo.it",
      subject: "Conferma ordine #4567 - mattoni",
      snippet: "Confermiamo il vostro ordine. Spedizione prevista lunedì.",
    },
    expected_categoria: "fornitore",
    expected_matched_by_prefix: "regex:fornitore",
    expect_l1_resolves: true,
  },
  {
    id: "fo3",
    description: "Spedizione materiale",
    input: {
      from_email: "spedizioni@grossisti.it",
      subject: "Spedizione in arrivo - tracking ABC123",
      snippet: "Consegna materiale prevista in cantiere domani 28/05/2026.",
    },
    expected_categoria: "fornitore",
    expected_matched_by_prefix: "regex:fornitore",
    expect_l1_resolves: true,
  },

  // ─── Operai / HR (3) ───────────────────────────────────────────────────────
  {
    id: "o1",
    description: "Richiesta ferie operaio",
    input: {
      from_email: "luigi.bianchi@gmail.com",
      subject: "Richiesta ferie 15-22 agosto",
      snippet: "Buongiorno, chiedo le ferie dal 15 al 22 agosto. Grazie.",
    },
    expected_categoria: "operaio",
    expected_matched_by_prefix: "regex:operaio",
    expect_l1_resolves: true,
  },
  {
    id: "o2",
    description: "Visita medica obbligatoria",
    input: {
      from_email: "medico.sicurezza@studiomedico.it",
      subject: "Convocazione visita medica annuale operai",
      snippet: "Si comunica che è programmata la visita medica per la squadra cantiere via Roma.",
    },
    expected_categoria: "operaio",
    expected_matched_by_prefix: "regex:operaio",
    expect_l1_resolves: true,
  },
  {
    id: "o3",
    description: "Formazione sicurezza scadenza",
    input: {
      from_email: "formazione@entebilaterale.it",
      subject: "Scadenza formazione sicurezza maestranze",
      snippet: "Promemoria: la formazione sicurezza in scadenza per la vostra squadra.",
    },
    expected_categoria: "operaio",
    expected_matched_by_prefix: "regex:operaio",
    expect_l1_resolves: true,
  },

  // ─── Opportunità / Lead (2) ────────────────────────────────────────────────
  {
    id: "op1",
    description: "Contatto da Google Ads",
    input: {
      from_email: "noreply@form-submission.com",
      subject: "Nuova richiesta dal sito web",
      snippet: "Nuovo lead da Google: Marco Verdi, telefono 3331234567, interessato a ristrutturazione.",
    },
    // Questa ha localpart noreply → "notifica" via headers PRIMA del match opportunita
    // L1 prevedibile: notifica (headers vince)
    expected_categoria: "notifica",
    expected_matched_by_prefix: "header:noreply-localpart",
    expect_l1_resolves: true,
  },
  {
    id: "op2",
    description: "Richiesta informazioni da sito web",
    input: {
      from_email: "marco.verdi@gmail.com",
      subject: "Richiesta informazioni vostri servizi",
      snippet: "Buongiorno, sono interessato ai vostri servizi di ristrutturazione. Mi contattate?",
    },
    expected_categoria: "opportunita",
    expected_matched_by_prefix: "regex:opportunita",
    expect_l1_resolves: true,
  },

  // ─── Pratica amministrativa (3) ────────────────────────────────────────────
  {
    id: "pr1",
    description: "Comunicazione INPS",
    input: {
      from_email: "comunicazioni@inps.it",
      subject: "Versamento contributi INPS scadenza F24",
      snippet: "Si comunica che è in scadenza il versamento dei contributi INPS.",
    },
    expected_categoria: "pratica",
    expected_matched_by_prefix: "regex:pratica",
    expect_l1_resolves: true,
  },
  {
    id: "pr2",
    description: "DURC Cassa Edile",
    input: {
      from_email: "info@cassaedile.it",
      subject: "Rinnovo DURC scadenza",
      snippet: "Il vostro DURC è in scadenza. Procedere al rinnovo.",
    },
    expected_categoria: "pratica",
    expected_matched_by_prefix: "regex:pratica",
    expect_l1_resolves: true,
  },
  {
    id: "pr3",
    description: "PEC pratica edilizia",
    input: {
      from_email: "comunicazioni@comune.milano.pec.it",
      subject: "Comunicazione CILA pratica edilizia",
      snippet: "In riferimento alla pratica edilizia CILA n.12/2026.",
    },
    expected_categoria: "pratica",
    expected_matched_by_prefix: "header:pec-domain",
    expect_l1_resolves: true,
  },

  // ─── Newsletter (3) ────────────────────────────────────────────────────────
  {
    id: "n1",
    description: "Newsletter con List-Unsubscribe",
    input: {
      from_email: "newsletter@ediliziaedo.it",
      subject: "Newsletter settimanale - novità edilizia",
      snippet: "Le ultime novità del settore edilizia nella nostra newsletter.",
      headers: {
        "list-unsubscribe": "<https://ediliziaedo.it/unsub?id=123>",
        "precedence": "bulk",
      },
    },
    expected_categoria: "newsletter",
    expected_matched_by_prefix: "header:list-unsubscribe",
    expect_l1_resolves: true,
  },
  {
    id: "n2",
    description: "Magazine settimanale (regex match)",
    input: {
      from_email: "info@magazine-costruzioni.it",
      subject: "Magazine #45 - top 5 novità edilizia 2026",
      snippet: "Leggi gli articoli della settimana sul nostro blog.",
    },
    expected_categoria: "newsletter",
    expected_matched_by_prefix: "regex:newsletter",
    expect_l1_resolves: true,
  },
  {
    id: "n3",
    description: "Newsletter Precedence header",
    input: {
      from_email: "marketing@grossista.it",
      subject: "Le offerte del mese",
      snippet: "Tutte le promozioni di questo mese.",
      headers: { "precedence": "bulk" },
    },
    expected_categoria: "newsletter",
    expected_matched_by_prefix: "header:precedence",
    expect_l1_resolves: true,
  },

  // ─── Social (2) ────────────────────────────────────────────────────────────
  {
    id: "s1",
    description: "Notifica LinkedIn",
    input: {
      from_email: "messages-noreply@linkedinmail.com",
      fromDomain: "linkedinmail.com",
      subject: "Hai un nuovo messaggio su LinkedIn",
      snippet: "Marco Bianchi ti ha inviato un messaggio.",
    },
    expected_categoria: "social",
    expected_matched_by_prefix: "header:social-domain",
    expect_l1_resolves: true,
  },
  {
    id: "s2",
    description: "Notifica Facebook",
    input: {
      from_email: "notification+kr4n9zts@facebookmail.com",
      fromDomain: "facebookmail.com",
      subject: "Marco ha commentato il tuo post",
      snippet: "Vai a vedere il commento.",
    },
    expected_categoria: "social",
    expected_matched_by_prefix: "header:social-domain",
    expect_l1_resolves: true,
  },

  // ─── Notifica (3) ──────────────────────────────────────────────────────────
  {
    id: "nt1",
    description: "Mailer-daemon bounce",
    input: {
      from_email: "mailer-daemon@mail.server.it",
      subject: "Delivery Status Notification (Failure)",
      snippet: "Posta non recapitata. Address rejected.",
    },
    expected_categoria: "notifica",
    expected_matched_by_prefix: "header:noreply-localpart",
    expect_l1_resolves: true,
  },
  {
    id: "nt2",
    description: "No-reply notifica generica",
    input: {
      from_email: "noreply@stripe.com",
      subject: "Pagamento ricevuto",
      snippet: "Hai ricevuto un pagamento di €450.",
    },
    expected_categoria: "notifica",
    expected_matched_by_prefix: "header:noreply-localpart",
    expect_l1_resolves: true,
  },
  {
    id: "nt3",
    description: "Auto-submitted reply",
    input: {
      from_email: "info@gov.it",
      subject: "Risposta automatica",
      snippet: "Email ricevuta. Risposta automatica.",
      headers: { "auto-submitted": "auto-generated" },
    },
    expected_categoria: "notifica",
    expected_matched_by_prefix: "header:auto-submitted",
    expect_l1_resolves: true,
  },

  // ─── Spam (2) ──────────────────────────────────────────────────────────────
  {
    id: "sp1",
    description: "Spam scam classico",
    input: {
      from_email: "promo@suspicious-domain.xyz",
      subject: "HAI VINTO! Clicca subito",
      snippet: "Congratulations! You've won 1 million dollars. Click here now.",
    },
    expected_categoria: "spam",
    expected_matched_by_prefix: "regex:spam",
    expect_l1_resolves: true,
  },
  {
    id: "sp2",
    description: "Spam promo aggressiva",
    input: {
      from_email: "offers@sales.io",
      subject: "Offerta lampo - prezzo stracciato compra adesso!",
      snippet: "Sconto esclusivo del 90%! Compra adesso, offerta del secolo!",
    },
    expected_categoria: "spam",
    expected_matched_by_prefix: "regex:spam",
    expect_l1_resolves: true,
  },

  // ─── Supporto (1) ──────────────────────────────────────────────────────────
  {
    id: "su1",
    description: "Ticket supporto numerato",
    input: {
      from_email: "support@strumenti.it",
      subject: "Ticket #4567 problema tecnico software",
      snippet: "In riferimento al ticket aperto per il problema tecnico segnalato.",
    },
    expected_categoria: "supporto",
    expected_matched_by_prefix: "regex:supporto",
    expect_l1_resolves: true,
  },

  // ─── Ambigui / sfuggono a L1 (passano a L3) ────────────────────────────────
  {
    id: "amb1",
    description: "Email generica senza segnali — NON RISOLVE L1",
    input: {
      from_email: "info@misteriosa.it",
      subject: "Buongiorno",
      snippet: "Volevo chiedervi una cosa.",
    },
    expected_categoria: "altro", // o qualunque cosa L3 dirà
    expect_l1_resolves: false,
    ambiguous: true,
  },
  {
    id: "amb2",
    description: "Email cortese sense generica — NON RISOLVE L1",
    input: {
      from_email: "g.persona@gmail.com",
      subject: "Riunione",
      snippet: "Ci possiamo vedere giovedì?",
    },
    expected_categoria: "altro",
    expect_l1_resolves: false,
    ambiguous: true,
  },
];

/** Helper per contare le categorie attese nei fixture. */
export function countExpectedByCategoria(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of EMAIL_FIXTURES) {
    counts[f.expected_categoria] = (counts[f.expected_categoria] || 0) + 1;
  }
  return counts;
}

/** Numero di fixture che DEVONO risolvere a L1 (per calcolo % hit rate). */
export function countL1Expected(): number {
  return EMAIL_FIXTURES.filter((f) => f.expect_l1_resolves).length;
}
