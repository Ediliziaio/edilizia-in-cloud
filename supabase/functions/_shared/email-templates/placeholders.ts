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
        example: "https://app.ediliziaincloud.it/login",
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
      loginUrl: "https://app.ediliziaincloud.it/login",
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
        example: "https://app.ediliziaincloud.it/reset?token=abc",
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
      resetUrl: "https://app.ediliziaincloud.it/reset?token=abc123",
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
        example: "https://app.ediliziaincloud.it/fatture/abc",
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
      invoiceUrl: "https://app.ediliziaincloud.it/fatture/abc",
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
        example: "https://app.ediliziaincloud.it/preventivi/firma/abc",
        required: true,
        category: "link",
      },
      ...BRANDING_PLACEHOLDERS,
    ],
    mockProps: {
      recipientName: "Mario Bianchi",
      quoteNumber: "PRV-2026/042",
      totalFormatted: "3.800,00 €",
      acceptanceUrl: "https://app.ediliziaincloud.it/preventivi/firma/abc",
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
        example: "https://app.ediliziaincloud.it/ddt/abc",
        required: true,
        category: "link",
      },
      ...BRANDING_PLACEHOLDERS,
    ],
    mockProps: {
      recipientName: "Mario Bianchi",
      ddtNumber: "DDT-2026/015",
      ddtDate: "12/04/2026",
      ddtUrl: "https://app.ediliziaincloud.it/ddt/abc",
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
        example: "https://app.ediliziaincloud.it/fatture/abc",
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
      invoiceUrl: "https://app.ediliziaincloud.it/fatture/abc",
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
        example: "https://app.ediliziaincloud.it/invito?token=abc",
        required: true,
        category: "link",
      },
      ...BRANDING_PLACEHOLDERS,
    ],
    mockProps: {
      recipientName: "Luca Verdi",
      inviterName: "Marco Rossi",
      roleLabel: "Operaio",
      acceptUrl: "https://app.ediliziaincloud.it/invito?token=abc",
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
        example: "https://app.ediliziaincloud.it/verify?token=abc",
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
      verifyUrl: "https://app.ediliziaincloud.it/verify?token=abc123",
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
        example: "https://app.ediliziaincloud.it/fatture/abc/ricevuta",
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
      receiptUrl: "https://app.ediliziaincloud.it/fatture/abc/ricevuta",
      ...BRANDING_MOCK,
    },
  },
};

/** Tutti i template_key supportati dall'editor. */
export const EDITABLE_TEMPLATE_KEYS = Object.keys(TEMPLATE_META);

/**
 * Ritorna i metadati del template (placeholder, mock, label).
 * Se la chiave non è registrata restituisce null.
 */
export function getTemplateMeta(templateKey: string): TemplateMeta | null {
  return TEMPLATE_META[templateKey] ?? null;
}
