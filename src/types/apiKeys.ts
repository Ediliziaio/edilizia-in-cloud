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
    label: "Ordini",
    description: "Accesso al modulo ordini",
    scopes: [
      { id: "orders:read", label: "Leggi ordini", description: "Visualizza lista e dettaglio ordini" },
      { id: "orders:write", label: "Modifica ordini", description: "Crea, aggiorna ed elimina ordini" },
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
    ],
  },
  {
    id: "reports",
    label: "Report",
    description: "Accesso alle statistiche",
    scopes: [
      { id: "reports:read", label: "Leggi report", description: "Accedi a statistiche e KPI" },
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
