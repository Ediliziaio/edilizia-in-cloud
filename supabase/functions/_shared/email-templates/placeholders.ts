// ============================================================================
// placeholders — registry dei placeholder disponibili per ogni template
// ============================================================================
// Pure-TS (nessuna dipendenza Deno/esm.sh) per essere condiviso tra
// Edge Functions Deno e UI React (importabile da src/lib/emailTemplates.ts
// che ne fa re-export via path alias).
//
// Ogni template_key ha una lista di placeholder supportati. La UI mostra
// questa lista accanto all'editor per guidare il super_admin; il resolver
// usa la stessa definizione per compilare subject/html_body/text_body.
// ============================================================================

import { SYSTEM_EMAIL_META } from "./system-email-meta.generated";

export interface PlaceholderDef {
  /** Nome della variabile (usato come `{{key}}` nel template). */
  key: string;
  /** Etichetta leggibile per UI (italiano). */
  label: string;
  /** Esempio concreto mostrato nell'editor. */
  example: string;
  /** Se true il template non ha senso senza questo placeholder. */
  required: boolean;
  /** Categoria per raggruppare nella sidebar editor. */
  category: "destinatario" | "contenuto" | "link" | "azienda";
}

export interface TemplateMeta {
  /** Label umana italiana (es. "Email di benvenuto"). */
  label: string;
  /** Descrizione breve di quando viene inviata. */
  description: string;
  /** Categoria alto livello per raggruppare nella lista. */
  category: "onboarding" | "account" | "documenti" | "notifiche";
  /** Icona lucide-react da usare in UI (nome componente). */
  iconName: string;
  /** Placeholder disponibili per questo template. */
  placeholders: PlaceholderDef[];
  /** Dati mock per il preview (chiave → valore d'esempio). */
  mockProps: Record<string, string>;
}

/**
 * Placeholder comuni a ogni template, derivati dal `Branding` della company
 * (sempre disponibili anche senza props specifici).
 */
const BRANDING_PLACEHOLDERS: PlaceholderDef[] = [
  {
    key: "companyName",
    label: "Nome azienda",
    example: "Rossi Costruzioni SRL",
    required: false,
    category: "azienda",
  },
];

const BRANDING_MOCK: Record<string, string> = {
  companyName: "Rossi Costruzioni SRL",
};

// ── Registry per template_key ───────────────────────────────────────────────
export const TEMPLATE_META: Record<string, TemplateMeta> = {
  welcome: {
    label: "Email di benvenuto",
    description:
      "Inviata a un nuovo utente al primo accesso o dopo l'accettazione di un invito.",
    category: "onboarding",
    iconName: "UserPlus",
    placeholders: [
      {
        key: "recipientName",
        label: "Nome destinatario",
        example: "Marco",
        required: true,
        category: "destinatario",
      },
      {
        key: "loginUrl",
        label: "URL primo accesso",
        example: "https://app.ediliziaincloud.com/login",
        required: true,
        category: "link",
      },
      {
        key: "roleLabel",
        label: "Ruolo assegnato",
        example: "Amministratore",
        required: false,
        category: "destinatario",
      },
      ...BRANDING_PLACEHOLDERS,
    ],
    mockProps: {
      recipientName: "Marco",
      loginUrl: "https://app.ediliziaincloud.com/login",
      roleLabel: "Amministratore",
      ...BRANDING_MOCK,
    },
  },

  password_reset: {
    label: "Recupero password",
    description:
      "Inviata quando un utente richiede il reset della password. Contiene un link one-shot.",
    category: "account",
    iconName: "KeyRound",
    placeholders: [
      {
        key: "recipientName",
        label: "Nome destinatario",
        example: "Marco",
        required: true,
        category: "destinatario",
      },
      {
        key: "resetUrl",
        label: "URL reset password",
        example: "https://app.ediliziaincloud.com/reset?token=abc",
        required: true,
        category: "link",
      },
      {
        key: "ttlMinutes",
        label: "Minuti validità link",
        example: "60",
        required: false,
        category: "contenuto",
      },
      ...BRANDING_PLACEHOLDERS,
    ],
    mockProps: {
      recipientName: "Marco",
      resetUrl: "https://app.ediliziaincloud.com/reset?token=abc123",
      ttlMinutes: "60",
      ...BRANDING_MOCK,
    },
  },

  invoice_sent: {
    label: "Invio fattura",
    description:
      "Inviata al cliente quando si invia una fattura dalla piattaforma.",
    category: "documenti",
    iconName: "Receipt",
    placeholders: [
      {
        key: "recipientName",
        label: "Nome destinatario",
        example: "Mario Bianchi",
        required: true,
        category: "destinatario",
      },
      {
        key: "invoiceNumber",
        label: "Numero fattura",
        example: "2026/001",
        required: true,
        category: "contenuto",
      },
      {
        key: "totalFormatted",
        label: "Importo formattato",
        example: "1.500,00 €",
        required: true,
        category: "contenuto",
      },
      {
        key: "dueDate",
        label: "Data scadenza",
        example: "30/04/2026",
        required: false,
        category: "contenuto",
      },
      {
        key: "invoiceUrl",
        label: "URL download PDF",
        example: "https://app.ediliziaincloud.com/fatture/abc",
        required: true,
        category: "link",
      },
      ...BRANDING_PLACEHOLDERS,
    ],
    mockProps: {
      recipientName: "Mario Bianchi",
      invoiceNumber: "2026/001",
      totalFormatted: "1.500,00 €",
      dueDate: "30/04/2026",
      invoiceUrl: "https://app.ediliziaincloud.com/fatture/abc",
      ...BRANDING_MOCK,
    },
  },

  quote_sent: {
    label: "Invio preventivo",
    description:
      "Inviata al cliente quando si manda un preventivo per firma o accettazione.",
    category: "documenti",
    iconName: "FileSignature",
    placeholders: [
      {
        key: "recipientName",
        label: "Nome destinatario",
        example: "Mario Bianchi",
        required: true,
        category: "destinatario",
      },
      {
        key: "quoteNumber",
        label: "Numero preventivo",
        example: "PRV-2026/042",
        required: true,
        category: "contenuto",
      },
      {
        key: "totalFormatted",
        label: "Importo formattato",
        example: "3.800,00 €",
        required: true,
        category: "contenuto",
      },
      {
        key: "acceptanceUrl",
        label: "URL accettazione",
        example: "https://app.ediliziaincloud.com/preventivi/firma/abc",
        required: true,
        category: "link",
      },
      ...BRANDING_PLACEHOLDERS,
    ],
    mockProps: {
      recipientName: "Mario Bianchi",
      quoteNumber: "PRV-2026/042",
      totalFormatted: "3.800,00 €",
      acceptanceUrl: "https://app.ediliziaincloud.com/preventivi/firma/abc",
      ...BRANDING_MOCK,
    },
  },

  ddt_sent: {
    label: "Invio DDT",
    description:
      "Inviata al cliente con il documento di trasporto (bolla) in allegato.",
    category: "documenti",
    iconName: "Truck",
    placeholders: [
      {
        key: "recipientName",
        label: "Nome destinatario",
        example: "Mario Bianchi",
        required: true,
        category: "destinatario",
      },
      {
        key: "ddtNumber",
        label: "Numero DDT",
        example: "DDT-2026/015",
        required: true,
        category: "contenuto",
      },
      {
        key: "ddtDate",
        label: "Data DDT",
        example: "12/04/2026",
        required: false,
        category: "contenuto",
      },
      {
        key: "ddtUrl",
        label: "URL download PDF",
        example: "https://app.ediliziaincloud.com/ddt/abc",
        required: true,
        category: "link",
      },
      ...BRANDING_PLACEHOLDERS,
    ],
    mockProps: {
      recipientName: "Mario Bianchi",
      ddtNumber: "DDT-2026/015",
      ddtDate: "12/04/2026",
      ddtUrl: "https://app.ediliziaincloud.com/ddt/abc",
      ...BRANDING_MOCK,
    },
  },

  invoice_due_soon: {
    label: "Scadenza fattura",
    description:
      "Promemoria automatico (cron giornaliero) per fatture in scadenza o scadute.",
    category: "notifiche",
    iconName: "CalendarClock",
    placeholders: [
      {
        key: "recipientName",
        label: "Nome destinatario",
        example: "Mario Bianchi",
        required: true,
        category: "destinatario",
      },
      {
        key: "invoiceNumber",
        label: "Numero fattura",
        example: "2026/001",
        required: true,
        category: "contenuto",
      },
      {
        key: "totalFormatted",
        label: "Importo formattato",
        example: "1.500,00 €",
        required: true,
        category: "contenuto",
      },
      {
        key: "dueDate",
        label: "Data scadenza",
        example: "30/04/2026",
        required: true,
        category: "contenuto",
      },
      {
        key: "daysToDue",
        label: "Giorni a scadenza",
        example: "5",
        required: false,
        category: "contenuto",
      },
      {
        key: "invoiceUrl",
        label: "URL fattura",
        example: "https://app.ediliziaincloud.com/fatture/abc",
        required: true,
        category: "link",
      },
      ...BRANDING_PLACEHOLDERS,
    ],
    mockProps: {
      recipientName: "Mario Bianchi",
      invoiceNumber: "2026/001",
      totalFormatted: "1.500,00 €",
      dueDate: "30/04/2026",
      daysToDue: "5",
      invoiceUrl: "https://app.ediliziaincloud.com/fatture/abc",
      ...BRANDING_MOCK,
    },
  },

  user_invited: {
    label: "Invito utente",
    description:
      "Inviata quando un company_admin invita un nuovo membro in azienda.",
    category: "onboarding",
    iconName: "MailCheck",
    placeholders: [
      {
        key: "recipientName",
        label: "Nome invitato",
        example: "Luca Verdi",
        required: false,
        category: "destinatario",
      },
      {
        key: "inviterName",
        label: "Nome chi invita",
        example: "Marco Rossi",
        required: false,
        category: "destinatario",
      },
      {
        key: "roleLabel",
        label: "Ruolo assegnato",
        example: "Operaio",
        required: false,
        category: "destinatario",
      },
      {
        key: "acceptUrl",
        label: "URL accettazione invito",
        example: "https://app.ediliziaincloud.com/invito?token=abc",
        required: true,
        category: "link",
      },
      ...BRANDING_PLACEHOLDERS,
    ],
    mockProps: {
      recipientName: "Luca Verdi",
      inviterName: "Marco Rossi",
      roleLabel: "Operaio",
      acceptUrl: "https://app.ediliziaincloud.com/invito?token=abc",
      ...BRANDING_MOCK,
    },
  },

  account_verify: {
    label: "Conferma email",
    description:
      "Inviata dopo la registrazione per verificare l'indirizzo email prima di attivare l'account.",
    category: "account",
    iconName: "MailCheck",
    placeholders: [
      {
        key: "recipientName",
        label: "Nome destinatario",
        example: "Marco",
        required: true,
        category: "destinatario",
      },
      {
        key: "verifyUrl",
        label: "URL di verifica",
        example: "https://app.ediliziaincloud.com/verify?token=abc",
        required: true,
        category: "link",
      },
      {
        key: "expiresIn",
        label: "Scadenza link",
        example: "24 ore",
        required: false,
        category: "contenuto",
      },
      ...BRANDING_PLACEHOLDERS,
    ],
    mockProps: {
      recipientName: "Marco",
      verifyUrl: "https://app.ediliziaincloud.com/verify?token=abc123",
      expiresIn: "24 ore",
      ...BRANDING_MOCK,
    },
  },

  payment_received: {
    label: "Pagamento ricevuto",
    description:
      "Conferma al cliente la ricezione di un pagamento (totale o parziale) di una fattura.",
    category: "documenti",
    iconName: "BadgeCheck",
    placeholders: [
      {
        key: "recipientName",
        label: "Nome destinatario",
        example: "Mario Bianchi",
        required: true,
        category: "destinatario",
      },
      {
        key: "invoiceNumber",
        label: "Numero fattura",
        example: "2026/001",
        required: true,
        category: "contenuto",
      },
      {
        key: "amountFormatted",
        label: "Importo ricevuto",
        example: "1.500,00 €",
        required: true,
        category: "contenuto",
      },
      {
        key: "paidAtFormatted",
        label: "Data pagamento",
        example: "22/04/2026",
        required: true,
        category: "contenuto",
      },
      {
        key: "paymentMethod",
        label: "Metodo di pagamento",
        example: "Bonifico",
        required: false,
        category: "contenuto",
      },
      {
        key: "remainingFormatted",
        label: "Residuo (se parziale)",
        example: "500,00 €",
        required: false,
        category: "contenuto",
      },
      {
        key: "receiptUrl",
        label: "URL ricevuta",
        example: "https://app.ediliziaincloud.com/fatture/abc/ricevuta",
        required: false,
        category: "link",
      },
      ...BRANDING_PLACEHOLDERS,
    ],
    mockProps: {
      recipientName: "Mario Bianchi",
      invoiceNumber: "2026/001",
      amountFormatted: "1.500,00 €",
      paidAtFormatted: "22/04/2026",
      paymentMethod: "Bonifico",
      remainingFormatted: "",
      receiptUrl: "https://app.ediliziaincloud.com/fatture/abc/ricevuta",
      ...BRANDING_MOCK,
    },
  },

  // ─── v8.6.88 — Lifecycle Email Automation ────────────────────────────────
  lifecycle_d3_no_activation: {
    label: "Lifecycle · D+3 attivazione non completata",
    description: "Inviata 3 giorni dopo signup se l'utente non ha completato il setup (no clienti / no commesse).",
    category: "onboarding",
    iconName: "Sparkles",
    placeholders: [
      { key: "recipientName", label: "Nome destinatario", example: "Marco", required: true, category: "destinatario" },
      { key: "companyName", label: "Nome azienda destinataria", example: "Rossi Costruzioni", required: false, category: "destinatario" },
      { key: "loginUrl", label: "URL accesso piattaforma", example: "https://app.ediliziaincloud.com/azienda", required: true, category: "link" },
      { key: "completedSteps", label: "Step completati (es. 1/6)", example: "2/6", required: false, category: "contenuto" },
      ...BRANDING_PLACEHOLDERS,
    ],
    mockProps: {
      recipientName: "Marco",
      companyName: "Rossi Costruzioni",
      loginUrl: "https://app.ediliziaincloud.com/azienda",
      completedSteps: "1/6",
      ...BRANDING_MOCK,
    },
  },

  lifecycle_d7_features: {
    label: "Lifecycle · D+7 features deep-dive",
    description: "Inviata 1 settimana dopo signup. Presenta 3 feature chiave (AI, render, automazioni) con video tutorial.",
    category: "onboarding",
    iconName: "Sparkles",
    placeholders: [
      { key: "recipientName", label: "Nome destinatario", example: "Marco", required: true, category: "destinatario" },
      { key: "companyName", label: "Nome azienda", example: "Rossi Costruzioni", required: false, category: "destinatario" },
      { key: "tutorialUrl", label: "URL video tutorial", example: "https://app.ediliziaincloud.com/help/tutorial", required: false, category: "link" },
      ...BRANDING_PLACEHOLDERS,
    ],
    mockProps: {
      recipientName: "Marco",
      companyName: "Rossi Costruzioni",
      tutorialUrl: "https://app.ediliziaincloud.com/help/tutorial",
      ...BRANDING_MOCK,
    },
  },

  lifecycle_trial_ending: {
    label: "Lifecycle · Trial in scadenza (D-3)",
    description: "Inviata 3 giorni prima della fine del trial. Riepilogo valore generato + CTA upgrade.",
    category: "onboarding",
    iconName: "Clock",
    placeholders: [
      { key: "recipientName", label: "Nome destinatario", example: "Marco", required: true, category: "destinatario" },
      { key: "companyName", label: "Nome azienda", example: "Rossi Costruzioni", required: false, category: "destinatario" },
      { key: "daysRemaining", label: "Giorni rimanenti", example: "3", required: true, category: "contenuto" },
      { key: "ordersCount", label: "Numero commesse create", example: "5", required: false, category: "contenuto" },
      { key: "customersCount", label: "Numero clienti", example: "12", required: false, category: "contenuto" },
      { key: "upgradeUrl", label: "URL upgrade piano", example: "https://app.ediliziaincloud.com/azienda/impostazioni/abbonamento", required: true, category: "link" },
      ...BRANDING_PLACEHOLDERS,
    ],
    mockProps: {
      recipientName: "Marco",
      companyName: "Rossi Costruzioni",
      daysRemaining: "3",
      ordersCount: "5",
      customersCount: "12",
      upgradeUrl: "https://app.ediliziaincloud.com/azienda/impostazioni/abbonamento",
      ...BRANDING_MOCK,
    },
  },

  lifecycle_monthly_summary: {
    label: "Lifecycle · Riepilogo mensile retention",
    description: "Inviata il primo di ogni mese. Riassume il valore generato (commesse, fatturato, ore risparmiate).",
    category: "notifiche",
    iconName: "ChartBar",
    placeholders: [
      { key: "recipientName", label: "Nome destinatario", example: "Marco", required: true, category: "destinatario" },
      { key: "monthName", label: "Mese di riferimento", example: "Aprile 2026", required: true, category: "contenuto" },
      { key: "ordersCount", label: "Commesse del mese", example: "8", required: false, category: "contenuto" },
      { key: "revenueFormatted", label: "Fatturato mese", example: "12.450,00 €", required: false, category: "contenuto" },
      { key: "hoursSaved", label: "Ore risparmiate stimate", example: "32", required: false, category: "contenuto" },
      { key: "dashboardUrl", label: "URL dashboard", example: "https://app.ediliziaincloud.com/azienda", required: false, category: "link" },
      ...BRANDING_PLACEHOLDERS,
    ],
    mockProps: {
      recipientName: "Marco",
      monthName: "Aprile 2026",
      ordersCount: "8",
      revenueFormatted: "12.450,00 €",
      hoursSaved: "32",
      dashboardUrl: "https://app.ediliziaincloud.com/azienda",
      ...BRANDING_MOCK,
    },
  },

  lifecycle_payment_failed: {
    label: "Lifecycle · Pagamento fallito (dunning)",
    description: "Inviata quando un pagamento Stripe fallisce. CTA per aggiornare il metodo via Customer Portal.",
    category: "account",
    iconName: "CreditCard",
    placeholders: [
      { key: "recipientName", label: "Nome destinatario", example: "Marco", required: true, category: "destinatario" },
      { key: "companyName", label: "Nome azienda", example: "Rossi Costruzioni", required: false, category: "destinatario" },
      { key: "amountFormatted", label: "Importo non riuscito", example: "127,00 €", required: false, category: "contenuto" },
      { key: "attemptNumber", label: "Tentativo numero", example: "2", required: false, category: "contenuto" },
      { key: "portalUrl", label: "URL portale fatturazione", example: "https://app.ediliziaincloud.com/azienda/impostazioni/abbonamento", required: true, category: "link" },
      ...BRANDING_PLACEHOLDERS,
    ],
    mockProps: {
      recipientName: "Marco",
      companyName: "Rossi Costruzioni",
      amountFormatted: "127,00 €",
      attemptNumber: "2",
      portalUrl: "https://app.ediliziaincloud.com/azienda/impostazioni/abbonamento",
      ...BRANDING_MOCK,
    },
  },

  setup_incomplete: {
    label: "Setup non completato (+48h)",
    description: "Promemoria condizionale a chi ha creato l'account ma non ha completato il setup dopo 48h.",
    category: "onboarding",
    iconName: "ListChecks",
    placeholders: [
      { key: "recipientName", label: "Nome destinatario", example: "Marco", required: true, category: "destinatario" },
      { key: "setupUrl", label: "URL ripresa setup", example: "https://app.ediliziaincloud.com/setup", required: true, category: "link" },
      ...BRANDING_PLACEHOLDERS,
    ],
    mockProps: { recipientName: "Marco", setupUrl: "https://app.ediliziaincloud.com/setup", ...BRANDING_MOCK },
  },

  password_changed: {
    label: "Password modificata",
    description: "Email di sicurezza inviata subito dopo il cambio password. Dà un canale se non è stato l'utente.",
    category: "account",
    iconName: "ShieldCheck",
    placeholders: [
      { key: "recipientName", label: "Nome destinatario", example: "Marco", required: true, category: "destinatario" },
      { key: "changedDate", label: "Data del cambio", example: "12/04/2026", required: true, category: "contenuto" },
      { key: "changedTime", label: "Ora del cambio", example: "14:32", required: true, category: "contenuto" },
      { key: "supportEmail", label: "Email di supporto", example: "support@ediliziaincloud.it", required: true, category: "contenuto" },
      ...BRANDING_PLACEHOLDERS,
    ],
    mockProps: { recipientName: "Marco", changedDate: "12/04/2026", changedTime: "14:32", supportEmail: "supporto@ediliziaincloud.com", ...BRANDING_MOCK },
  },

  invite_reminder: {
    label: "Promemoria invito (+48h)",
    description: "Promemoria condizionale a chi è stato invitato ma non ha ancora accettato dopo 48h.",
    category: "onboarding",
    iconName: "MailWarning",
    placeholders: [
      { key: "recipientName", label: "Nome destinatario", example: "Luca", required: true, category: "destinatario" },
      { key: "inviterName", label: "Nome di chi ha invitato", example: "Marco", required: true, category: "destinatario" },
      { key: "inviteUrl", label: "URL accetta invito", example: "https://app.ediliziaincloud.com/invito?token=abc", required: true, category: "link" },
      ...BRANDING_PLACEHOLDERS,
    ],
    mockProps: { recipientName: "Luca", inviterName: "Marco", inviteUrl: "https://app.ediliziaincloud.com/invito?token=abc", ...BRANDING_MOCK },
  },

  terms_accepted: {
    label: "Conferma accettazione termini",
    description: "Copia dei documenti accettati alla registrazione (prova legale B2B): T&C, Privacy, DPA, Cookie + modulo operai.",
    category: "legal",
    iconName: "FileCheck",
    placeholders: [
      { key: "recipientName", label: "Nome destinatario", example: "Marco", required: true, category: "destinatario" },
      { key: "acceptedDate", label: "Data accettazione", example: "12/04/2026", required: true, category: "contenuto" },
      { key: "acceptedTime", label: "Ora accettazione", example: "14:32", required: true, category: "contenuto" },
      { key: "tcUrl", label: "URL Termini e Condizioni", example: "https://www.ediliziaincloud.com/legal/termini-v3.pdf", required: true, category: "link" },
      { key: "tcVersion", label: "Versione T&C", example: "3.0", required: true, category: "contenuto" },
      { key: "privacyUrl", label: "URL Privacy Policy", example: "https://www.ediliziaincloud.com/legal/privacy-v3.pdf", required: true, category: "link" },
      { key: "privacyVersion", label: "Versione Privacy", example: "3.0", required: true, category: "contenuto" },
      { key: "dpaUrl", label: "URL DPA", example: "https://www.ediliziaincloud.com/legal/dpa-v2.pdf", required: true, category: "link" },
      { key: "dpaVersion", label: "Versione DPA", example: "2.0", required: true, category: "contenuto" },
      { key: "cookieUrl", label: "URL Cookie Policy", example: "https://www.ediliziaincloud.com/legal/cookie-v1.pdf", required: true, category: "link" },
      { key: "cookieVersion", label: "Versione Cookie", example: "1.0", required: true, category: "contenuto" },
      { key: "moduloOperaiUrl", label: "URL Modulo Privacy Operai", example: "https://www.ediliziaincloud.com/legal/modulo-operai.pdf", required: true, category: "link" },
      ...BRANDING_PLACEHOLDERS,
    ],
    mockProps: {
      recipientName: "Marco", acceptedDate: "12/04/2026", acceptedTime: "14:32",
      tcUrl: "https://www.ediliziaincloud.com/legal/termini-v3.pdf", tcVersion: "3.0",
      privacyUrl: "https://www.ediliziaincloud.com/legal/privacy-v3.pdf", privacyVersion: "3.0",
      dpaUrl: "https://www.ediliziaincloud.com/legal/dpa-v2.pdf", dpaVersion: "2.0",
      cookieUrl: "https://www.ediliziaincloud.com/legal/cookie-v1.pdf", cookieVersion: "1.0",
      moduloOperaiUrl: "https://www.ediliziaincloud.com/legal/modulo-operai.pdf",
      ...BRANDING_MOCK,
    },
  },

  purchase_confirmed: {
    label: "Conferma acquisto (abbonamento attivato)",
    description: "Inviata alla prima attivazione a pagamento dell'abbonamento. Dettagli piano + importo + rinnovo.",
    category: "billing",
    iconName: "BadgeCheck",
    placeholders: [
      { key: "recipientName", label: "Nome destinatario", example: "Marco", required: true, category: "destinatario" },
      { key: "planName", label: "Nome piano", example: "Pro", required: true, category: "contenuto" },
      { key: "amountFormatted", label: "Importo formattato", example: "49,00 €", required: false, category: "contenuto" },
      { key: "periodicity", label: "Periodicità", example: "mensile", required: false, category: "contenuto" },
      { key: "renewalDate", label: "Prossimo rinnovo", example: "12/05/2026", required: false, category: "contenuto" },
      { key: "invoiceUrl", label: "URL fattura", example: "https://app.ediliziaincloud.com/fattura/123", required: false, category: "link" },
      { key: "appUrl", label: "URL app", example: "https://app.ediliziaincloud.com/azienda", required: true, category: "link" },
      ...BRANDING_PLACEHOLDERS,
    ],
    mockProps: {
      recipientName: "Marco", planName: "Pro", amountFormatted: "49,00 €", periodicity: "mensile",
      renewalDate: "12/05/2026", invoiceUrl: "https://app.ediliziaincloud.com/fattura/123",
      appUrl: "https://app.ediliziaincloud.com/azienda", ...BRANDING_MOCK,
    },
  },
};

// Aggiunge le 58 email di sistema (copy riscritti) al catalogo del builder.
// Le chiavi sovrapposte (welcome, password_reset, lifecycle_*, ...) vengono
// aggiornate; le ~45 nuove vengono aggiunte. Vedi system-email-meta.generated.ts.
Object.assign(TEMPLATE_META, SYSTEM_EMAIL_META as Record<string, TemplateMeta>);

/** Tutti i template_key supportati dall'editor. */
export const EDITABLE_TEMPLATE_KEYS = Object.keys(TEMPLATE_META);

/**
 * Ritorna i metadati del template (placeholder, mock, label).
 * Se la chiave non è registrata restituisce null.
 */
export function getTemplateMeta(templateKey: string): TemplateMeta | null {
  return TEMPLATE_META[templateKey] ?? null;
}
