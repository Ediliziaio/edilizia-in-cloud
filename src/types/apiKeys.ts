export interface ApiKey {
  id: string;
  company_id: string;
  name: string;
  key_prefix: string;
  key_hash?: string;
  scopes: string[];
  is_active: boolean;
  last_used_at: string | null;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  revoked_at: string | null;
  rate_limit_per_minute: number;
  rate_limit_per_day: number;
}

export interface ApiScopeGroup {
  id: string;
  label: string;
  description: string;
  scopes: ApiScope[];
}

export interface ApiScope {
  id: string;
  label: string;
  description: string;
}

export const API_SCOPE_GROUPS: ApiScopeGroup[] = [
  {
    id: "crm",
    label: "CRM",
    description: "Accesso a contatti e opportunità",
    scopes: [
      { id: "contacts:read", label: "Leggi contatti", description: "Visualizza lista e dettaglio contatti" },
      { id: "contacts:write", label: "Modifica contatti", description: "Crea, aggiorna ed elimina contatti" },
      { id: "opportunities:read", label: "Leggi opportunità", description: "Visualizza opportunità e pipeline" },
      { id: "opportunities:write", label: "Modifica opportunità", description: "Crea, aggiorna ed elimina opportunità" },
    ],
  },
  {
    id: "orders",
    label: "Commesse",
    description: "Accesso alle commesse/cantieri",
    scopes: [
      { id: "orders:read", label: "Leggi commesse", description: "Riepiloghi, flusso, cantieri a rischio" },
      { id: "orders:write", label: "Crea commesse", description: "Crea commesse via assistente AI" },
    ],
  },
  {
    id: "quotes",
    label: "Preventivi",
    description: "Preventivi e follow-up",
    scopes: [
      { id: "quotes:read", label: "Leggi preventivi", description: "Riepiloghi, da ricontattare, probabilità di chiusura" },
    ],
  },
  {
    id: "warehouse",
    label: "Magazzino & fornitori",
    description: "Scorte, stockout, fornitori, proposte d'ordine",
    scopes: [
      { id: "warehouse:read", label: "Leggi magazzino", description: "Stato scorte, stockout, fornitori" },
      { id: "warehouse:write", label: "Proposte d'ordine", description: "Crea proposte di ordine a fornitore (bozze)" },
    ],
  },
  {
    id: "hr",
    label: "Personale",
    description: "Team, presenze, assenze",
    scopes: [
      { id: "hr:read", label: "Leggi personale", description: "Team, dipendenti di oggi" },
      { id: "hr:write", label: "Registra assenze", description: "Registra assenze dei dipendenti" },
    ],
  },
  {
    id: "safety",
    label: "Sicurezza & documenti",
    description: "DURC, scadenze documentali, subappaltatori",
    scopes: [
      { id: "safety:read", label: "Leggi sicurezza", description: "DURC, documenti in scadenza, subappaltatori" },
    ],
  },
  {
    id: "calendar",
    label: "Calendario",
    description: "Accesso ad appuntamenti e disponibilità",
    scopes: [
      { id: "appointments:read", label: "Leggi appuntamenti", description: "Visualizza appuntamenti e disponibilità" },
      { id: "appointments:write", label: "Modifica appuntamenti", description: "Crea e cancella appuntamenti" },
    ],
  },
  {
    id: "tasks",
    label: "Task",
    description: "Accesso alle attività",
    scopes: [
      { id: "tasks:read", label: "Leggi task", description: "Visualizza task assegnate" },
      { id: "tasks:write", label: "Modifica task", description: "Crea, aggiorna e completa task" },
    ],
  },
  {
    id: "products",
    label: "Prodotti",
    description: "Accesso al catalogo prodotti",
    scopes: [
      { id: "products:read", label: "Leggi prodotti", description: "Visualizza catalogo e prezzi" },
      { id: "products:write", label: "Modifica listino", description: "Aggiunge voci al listino/prezzario aziendale" },
    ],
  },
  {
    id: "reports",
    label: "Report",
    description: "Accesso alle statistiche",
    scopes: [
      { id: "reports:read", label: "Leggi report", description: "Accedi a statistiche e KPI" },
      // stats:read è lo scope che lo strumento MCP «statistiche_azienda» controlla.
      { id: "stats:read", label: "Statistiche azienda", description: "KPI, fatturato e conteggi via assistente AI" },
    ],
  },
  {
    id: "comunicazione",
    label: "Comunicazione",
    description: "Posta in arrivo e invio email",
    scopes: [
      { id: "email:read", label: "Leggi posta da lavorare", description: "Email in arrivo che richiedono risposta/azione" },
      { id: "email:send", label: "Invia email", description: "Invio REALE di email — dallo strumento AI o via API" },
    ],
  },
  {
    id: "azioni_sensibili",
    label: "Azioni con invio o costo",
    description: "Strumenti dell'assistente che inviano davvero o hanno un costo AI",
    scopes: [
      { id: "actions:sensitive", label: "Invii e strumenti a pagamento", description: "Invia messaggi/solleciti reali, strumenti con costo AI — spento di serie" },
    ],
  },
  {
    id: "advanced",
    label: "Avanzate",
    description: "Permessi speciali",
    scopes: [
      { id: "webhooks:manage", label: "Gestisci webhook", description: "Crea e gestisci webhook via API" },
    ],
  },
];

export const ALL_SCOPE_IDS = API_SCOPE_GROUPS.flatMap((g) => g.scopes.map((s) => s.id));
