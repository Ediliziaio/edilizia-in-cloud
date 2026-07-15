// src/lib/flow-node-catalog.ts
// Catalogo completo di tutti i trigger, azioni e condizioni disponibili nel flow builder.
// Self-contained — no dependency on automationBuilder.ts
// OUTPUT VARIABLES ALIGNED TO REAL DB COLUMN NAMES

// ─── Tipi base ──────────────────────────────────────────────────────────────

export interface VariableDefinition {
  id: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'uuid';
  example?: string;
}

export type ConfigFieldType =
  | 'text'
  | 'textarea'
  | 'select'
  | 'number'
  | 'boolean'
  | 'date'
  | 'time'
  | 'user_select'
  | 'user_multi_select'
  | 'entity_select'
  // Picker con dati reali (stile GHL) renderizzati da FlowBuilderConfigPanel:
  | 'meta_page_select'       // pagina Facebook collegata (meta_assets selected)
  | 'meta_form_multi_select' // moduli lead Meta (meta_lead_forms, filtrati per pagina)
  | 'pipeline_select'        // pipeline CRM (marketing_pipelines)
  | 'pipeline_stage_select'  // fase della pipeline scelta (marketing_pipeline_stages)
  | 'tag_input'
  | 'json_editor'
  | 'richhtml' // editor email visuale (WYSIWYG) → HTML
  | 'tags'; // backward compat alias for tag_input

export interface ConfigFieldOption {
  value: string;
  label: string;
}

export interface ConfigFieldSchema {
  id: string;
  label: string;
  type: ConfigFieldType;
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  options?: ConfigFieldOption[];
  supportsVariables?: boolean;
  min?: number;
  max?: number;
  defaultValue?: any;
}

export interface TriggerDefinition {
  id: string;
  label: string;
  description: string;
  icon: string;
  categoria: string;
  dbTable?: string;
  dbEvent?:
    | 'INSERT' | 'UPDATE' | 'DELETE' | 'SCHEDULED'
    // ── Eventi di PIATTAFORMA (solo area superadmin) ──
    // Nomi canonici emessi in `automation_trigger_events.trigger_event` dagli
    // emettitori lato server (create-company, admin-change-plan, stripe-webhook,
    // platform-lifecycle-cron). NON sono operazioni DB: rappresentano l'evento
    // di business. L'executor mappa l'id catalogo italiano → questo nome.
    | 'PLATFORM_COMPANY_CREATED'
    | 'PLATFORM_PLAN_CHANGED'
    | 'PLATFORM_SUBSCRIPTION_CANCELLED'
    | 'PLATFORM_TRIAL_EXPIRING'
    | 'PLATFORM_AI_CREDITS_LOW'
    | 'PLATFORM_TICKET_OPENED'
    | 'PLATFORM_COMPANY_PAUSED'
    | 'PLATFORM_DEAL_WON'
    | 'PLATFORM_PAYMENT_RECEIVED'
    | 'PLATFORM_INVOICE_OVERDUE';
  outputVariables: VariableDefinition[];
  configSchema: ConfigFieldSchema[];
}

export interface ActionDefinition {
  id: string;
  label: string;
  description: string;
  icon: string;
  categoria: string;
  outputVariables?: VariableDefinition[];
  configSchema: ConfigFieldSchema[];
}

export interface ConditionDefinition {
  id: string;
  label: string;
  description: string;
  icon: string;
  configSchema: ConfigFieldSchema[];
}

// ─── TRIGGER CATALOG ────────────────────────────────────────────────────────
// ALL outputVariables use REAL DB column names

export const TRIGGER_CATALOG: TriggerDefinition[] = [

  // ═══ CRM & CONTATTI ═══
  {
    id: 'contatto_creato',
    label: 'Nuovo contatto creato',
    description: 'Scatta quando viene aggiunto un nuovo contatto/lead al CRM',
    icon: 'UserPlus',
    categoria: 'crm',
    dbTable: 'marketing_contacts',
    dbEvent: 'INSERT',
    outputVariables: [
      { id: 'contatto.id', label: 'ID Contatto', type: 'uuid' },
      { id: 'contatto.first_name', label: 'Nome', type: 'string', example: 'Mario' },
      { id: 'contatto.last_name', label: 'Cognome', type: 'string', example: 'Rossi' },
      { id: 'contatto.full_name', label: 'Nome completo', type: 'string', example: 'Mario Rossi' },
      { id: 'contatto.email', label: 'Email', type: 'string', example: 'mario@azienda.it' },
      { id: 'contatto.phone', label: 'Telefono', type: 'string' },
      { id: 'contatto.source', label: 'Fonte acquisizione', type: 'string', example: 'Facebook' },
      { id: 'contatto.city', label: 'Città', type: 'string' },
      { id: 'contatto.province', label: 'Provincia', type: 'string', example: 'MI' },
      { id: 'contatto.region', label: 'Regione', type: 'string', example: 'Lombardia' },
      { id: 'contatto.company_name', label: 'Azienda', type: 'string' },
      { id: 'contatto.created_at', label: 'Data creazione', type: 'date' },
    ],
    configSchema: [
      {
        id: 'fonte_filtro', label: 'Filtra per fonte (opzionale)', type: 'select', required: false,
        options: [
          { value: '', label: 'Qualsiasi fonte' },
          { value: 'facebook', label: 'Facebook' },
          { value: 'google', label: 'Google' },
          { value: 'sito_web', label: 'Sito web' },
          { value: 'manuale', label: 'Inserimento manuale' },
          { value: 'whatsapp', label: 'WhatsApp' },
          { value: 'referral', label: 'Referral' },
        ],
        helpText: 'Se impostato, il trigger scatta solo per contatti da questa fonte',
      },
    ],
  },
  {
    id: 'contatto_aggiornato',
    label: 'Contatto aggiornato',
    description: 'Scatta quando vengono modificati i dati di un contatto',
    icon: 'Edit',
    categoria: 'crm',
    dbTable: 'marketing_contacts',
    dbEvent: 'UPDATE',
    outputVariables: [
      { id: 'contatto.id', label: 'ID Contatto', type: 'uuid' },
      { id: 'contatto.first_name', label: 'Nome', type: 'string' },
      { id: 'contatto.last_name', label: 'Cognome', type: 'string' },
      { id: 'contatto.full_name', label: 'Nome completo', type: 'string', example: 'Mario Rossi' },
      { id: 'contatto.email', label: 'Email', type: 'string' },
      { id: 'contatto.campo_modificato', label: 'Campo modificato', type: 'string' },
    ],
    configSchema: [
      {
        id: 'campo_filtro', label: 'Scatta solo quando cambia il campo', type: 'select', required: false,
        options: [
          { value: '', label: 'Qualsiasi campo' },
          { value: 'status', label: 'Stato' },
          { value: 'assigned_to', label: 'Responsabile assegnato' },
          { value: 'email', label: 'Email' },
          { value: 'phone', label: 'Telefono' },
        ],
      },
    ],
  },
  {
    id: 'contatto_assegnato',
    label: 'Contatto assegnato a agente',
    description: 'Scatta quando un contatto viene assegnato a un responsabile',
    icon: 'Handshake',
    categoria: 'crm',
    dbTable: 'marketing_contacts',
    dbEvent: 'UPDATE',
    outputVariables: [
      { id: 'contatto.id', label: 'ID Contatto', type: 'uuid' },
      { id: 'contatto.first_name', label: 'Nome', type: 'string' },
      { id: 'contatto.last_name', label: 'Cognome', type: 'string' },
      { id: 'contatto.full_name', label: 'Nome completo', type: 'string', example: 'Mario Rossi' },
      { id: 'contatto.assigned_to', label: 'Assegnato a (user ID)', type: 'uuid' },
    ],
    configSchema: [],
  },
  {
    id: 'tag_aggiunto',
    label: 'Tag aggiunto al contatto',
    description: 'Scatta quando viene aggiunto un tag a un contatto (evento tag_added, già emesso dal CRM)',
    icon: 'Tag',
    categoria: 'crm',
    dbTable: 'marketing_contacts',
    dbEvent: 'UPDATE',
    outputVariables: [
      { id: 'contatto.id', label: 'ID Contatto', type: 'uuid' },
      { id: 'contatto.full_name', label: 'Nome completo', type: 'string' },
      { id: 'contatto.tags', label: 'Tag attuali', type: 'string' },
    ],
    configSchema: [],
  },
  {
    id: 'tag_rimosso',
    label: 'Tag rimosso dal contatto',
    description: 'Scatta quando viene rimosso un tag da un contatto (evento tag_removed)',
    icon: 'Tag',
    categoria: 'crm',
    dbTable: 'marketing_contacts',
    dbEvent: 'UPDATE',
    outputVariables: [
      { id: 'contatto.id', label: 'ID Contatto', type: 'uuid' },
      { id: 'contatto.full_name', label: 'Nome completo', type: 'string' },
      { id: 'contatto.tags', label: 'Tag attuali', type: 'string' },
    ],
    configSchema: [],
  },
  {
    id: 'compleanno_contatto',
    label: 'Compleanno contatto',
    description: 'Scatta il giorno del compleanno del contatto (o N giorni prima). Controllo giornaliero.',
    icon: 'Cake',
    categoria: 'crm',
    dbTable: 'marketing_contacts',
    dbEvent: 'SCHEDULED',
    outputVariables: [
      { id: 'contatto.id', label: 'ID Contatto', type: 'uuid' },
      { id: 'contatto.full_name', label: 'Nome completo', type: 'string' },
      { id: 'contatto.date_of_birth', label: 'Data di nascita', type: 'date' },
    ],
    configSchema: [
      { id: 'days_before', label: 'Giorni di anticipo', type: 'number', required: false, defaultValue: 0, helpText: '0 = il giorno stesso del compleanno' },
    ],
  },
  {
    id: 'data_personalizzata',
    label: 'Ricorrenza su campo data',
    description: 'Scatta quando un campo data del contatto cade oggi (± offset). Es. anniversario contratto.',
    icon: 'CalendarClock',
    categoria: 'crm',
    dbTable: 'marketing_contacts',
    dbEvent: 'SCHEDULED',
    outputVariables: [
      { id: 'contatto.id', label: 'ID Contatto', type: 'uuid' },
      { id: 'contatto.full_name', label: 'Nome completo', type: 'string' },
    ],
    configSchema: [
      { id: 'date_field', label: 'Campo data (colonna DB)', type: 'text', required: true, placeholder: 'es. created_at, date_of_birth' },
      { id: 'days_offset', label: 'Offset giorni', type: 'number', required: false, defaultValue: 0, helpText: 'Positivo = N giorni dopo la data; negativo = prima' },
    ],
  },

  // ═══ OPPORTUNITÀ & PIPELINE ═══
  {
    id: 'opportunita_creata',
    label: 'Nuova opportunità creata',
    description: 'Scatta alla creazione di una nuova opportunità/deal',
    icon: 'Briefcase',
    categoria: 'crm',
    dbTable: 'marketing_opportunities',
    dbEvent: 'INSERT',
    outputVariables: [
      { id: 'opportunita.id', label: 'ID Opportunità', type: 'uuid' },
      { id: 'opportunita.name', label: 'Nome opportunità', type: 'string' },
      { id: 'opportunita.value', label: 'Valore (€)', type: 'number', example: '5000' },
      { id: 'opportunita.stage_id', label: 'Stage attuale (ID)', type: 'uuid' },
      { id: 'opportunita.assigned_to', label: 'Responsabile (user ID)', type: 'uuid' },
      { id: 'opportunita.contact_id', label: 'ID Contatto', type: 'uuid' },
      { id: 'opportunita.expected_close_date', label: 'Data chiusura prevista', type: 'date' },
    ],
    configSchema: [
      { id: 'valore_minimo', label: 'Solo opportunità con valore superiore a (€)', type: 'number', required: false, placeholder: 'Es: 1000', helpText: 'Lascia vuoto per qualsiasi valore' },
    ],
  },
  {
    id: 'opportunita_stage_cambiato',
    label: 'Stage opportunità cambiato',
    description: 'Scatta quando un deal cambia stage nella pipeline',
    icon: 'BarChart3',
    categoria: 'crm',
    dbTable: 'marketing_opportunities',
    dbEvent: 'UPDATE',
    outputVariables: [
      { id: 'opportunita.id', label: 'ID Opportunità', type: 'uuid' },
      { id: 'opportunita.name', label: 'Nome opportunità', type: 'string' },
      { id: 'opportunita.value', label: 'Valore (€)', type: 'number' },
      { id: 'opportunita.stage_id', label: 'Nuovo stage (ID)', type: 'uuid' },
      { id: 'opportunita.stage_precedente', label: 'Stage precedente (ID)', type: 'uuid' },
    ],
    configSchema: [
      { id: 'stage_da', label: 'Da stage (opzionale)', type: 'select', required: false, options: [
        { value: '', label: 'Qualsiasi' }, { value: 'nuovo_lead', label: 'Nuovo Lead' }, { value: 'contattato', label: 'Contattato' },
        { value: 'appuntamento', label: 'Appuntamento' }, { value: 'offerta_inviata', label: 'Offerta inviata' },
        { value: 'negoziazione', label: 'Negoziazione' }, { value: 'vinto', label: 'Vinto' }, { value: 'perso', label: 'Perso' },
      ]},
      { id: 'stage_a', label: 'A stage (richiesto)', type: 'select', required: true, options: [
        { value: 'contattato', label: 'Contattato' }, { value: 'appuntamento', label: 'Appuntamento fissato' },
        { value: 'offerta_inviata', label: 'Offerta inviata' }, { value: 'negoziazione', label: 'In negoziazione' },
        { value: 'vinto', label: 'Vinto ✅' }, { value: 'perso', label: 'Perso ❌' },
      ], helpText: 'Il trigger scatta solo quando si arriva in questo stage' },
    ],
  },
  {
    id: 'opportunita_vinta',
    label: 'Opportunità vinta',
    description: 'Scatta quando un deal viene marcato come "Vinto"',
    icon: 'Trophy',
    categoria: 'crm',
    dbTable: 'marketing_opportunities',
    dbEvent: 'UPDATE',
    outputVariables: [
      { id: 'opportunita.id', label: 'ID Opportunità', type: 'uuid' },
      { id: 'opportunita.name', label: 'Nome opportunità', type: 'string' },
      { id: 'opportunita.value', label: 'Valore (€)', type: 'number' },
      { id: 'opportunita.contact_id', label: 'ID Contatto', type: 'uuid' },
      { id: 'opportunita.assigned_to', label: 'Responsabile (user ID)', type: 'uuid' },
    ],
    configSchema: [],
  },
  {
    id: 'opportunita_persa',
    label: 'Opportunità persa',
    description: 'Scatta quando un deal viene marcato come "Perso"',
    icon: 'XCircle',
    categoria: 'crm',
    dbTable: 'marketing_opportunities',
    dbEvent: 'UPDATE',
    outputVariables: [
      { id: 'opportunita.id', label: 'ID Opportunità', type: 'uuid' },
      { id: 'opportunita.name', label: 'Nome opportunità', type: 'string' },
      { id: 'opportunita.loss_reason', label: 'Motivo perdita', type: 'string' },
      { id: 'opportunita.contact_id', label: 'ID Contatto', type: 'uuid' },
    ],
    configSchema: [],
  },
  {
    id: 'opportunita_stale',
    label: 'Opportunità ferma (stale)',
    description: 'Scatta quando un\'opportunità aperta non viene toccata da N giorni. Controllo giornaliero.',
    icon: 'Hourglass',
    categoria: 'crm',
    dbTable: 'marketing_opportunities',
    dbEvent: 'SCHEDULED',
    outputVariables: [
      { id: 'opportunita.id', label: 'ID Opportunità', type: 'uuid' },
      { id: 'contatto.id', label: 'ID Contatto', type: 'uuid' },
      { id: 'contatto.full_name', label: 'Nome completo', type: 'string' },
    ],
    configSchema: [
      { id: 'stale_days', label: 'Giorni senza attività', type: 'number', required: false, defaultValue: 30, helpText: 'Scatta se l\'opportunità aperta non viene aggiornata da almeno N giorni' },
    ],
  },

  // ═══ APPUNTAMENTI & CALENDARIO ═══
  {
    id: 'appuntamento_creato',
    label: 'Appuntamento creato',
    description: 'Scatta alla creazione di un nuovo appuntamento',
    icon: 'Calendar',
    categoria: 'crm',
    dbTable: 'appointments',
    dbEvent: 'INSERT',
    outputVariables: [
      { id: 'appuntamento.id', label: 'ID Appuntamento', type: 'uuid' },
      { id: 'appuntamento.title', label: 'Titolo', type: 'string' },
      { id: 'appuntamento.appointment_date', label: 'Data', type: 'date' },
      { id: 'appuntamento.appointment_time', label: 'Ora', type: 'string' },
      { id: 'appuntamento.contact_id', label: 'ID Contatto', type: 'uuid' },
      { id: 'appuntamento.assigned_to', label: 'Responsabile (user ID)', type: 'uuid' },
      { id: 'appuntamento.formatted_address', label: 'Luogo', type: 'string' },
    ],
    configSchema: [
      { id: 'tipo_filtro', label: 'Tipo appuntamento (opzionale)', type: 'select', required: false, options: [
        { value: '', label: 'Tutti i tipi' }, { value: 'sopralluogo', label: 'Sopralluogo' },
        { value: 'video_call', label: 'Video call' }, { value: 'telefonata', label: 'Telefonata' }, { value: 'in_sede', label: 'In sede' },
      ]},
    ],
  },
  {
    id: 'appuntamento_confermato',
    label: 'Appuntamento confermato',
    description: 'Scatta quando un appuntamento viene confermato dal cliente',
    icon: 'CalendarCheck',
    categoria: 'crm',
    dbTable: 'appointments',
    dbEvent: 'UPDATE',
    outputVariables: [
      { id: 'appuntamento.id', label: 'ID Appuntamento', type: 'uuid' },
      { id: 'appuntamento.title', label: 'Titolo', type: 'string' },
      { id: 'appuntamento.appointment_date', label: 'Data', type: 'date' },
      { id: 'appuntamento.appointment_time', label: 'Ora', type: 'string' },
      { id: 'appuntamento.contact_id', label: 'ID Contatto', type: 'uuid' },
    ],
    configSchema: [],
  },
  {
    id: 'appuntamento_completato',
    label: 'Appuntamento completato (show-up)',
    description: "Il cliente si è presentato all'appuntamento",
    icon: 'Target',
    categoria: 'crm',
    dbTable: 'appointments',
    dbEvent: 'UPDATE',
    outputVariables: [
      { id: 'appuntamento.id', label: 'ID Appuntamento', type: 'uuid' },
      { id: 'appuntamento.contact_id', label: 'ID Contatto', type: 'uuid' },
      { id: 'appuntamento.internal_notes', label: 'Note appuntamento', type: 'string' },
      { id: 'appuntamento.status', label: 'Stato', type: 'string' },
    ],
    configSchema: [],
  },
  {
    id: 'appuntamento_no_show',
    label: 'Appuntamento no-show',
    description: "Il cliente non si è presentato all'appuntamento",
    icon: 'XCircle',
    categoria: 'crm',
    dbTable: 'appointments',
    dbEvent: 'UPDATE',
    outputVariables: [
      { id: 'appuntamento.id', label: 'ID Appuntamento', type: 'uuid' },
      { id: 'appuntamento.contact_id', label: 'ID Contatto', type: 'uuid' },
      { id: 'appuntamento.title', label: 'Titolo', type: 'string' },
    ],
    configSchema: [],
  },
  {
    id: 'appuntamento_annullato',
    label: 'Appuntamento annullato',
    description: 'Scatta quando un appuntamento viene annullato/cancellato',
    icon: 'CalendarX',
    categoria: 'crm',
    dbTable: 'appointments',
    dbEvent: 'UPDATE',
    outputVariables: [
      { id: 'appuntamento.id', label: 'ID Appuntamento', type: 'uuid' },
      { id: 'appuntamento.contact_id', label: 'ID Contatto', type: 'uuid' },
      { id: 'appuntamento.title', label: 'Titolo', type: 'string' },
    ],
    configSchema: [],
  },
  {
    id: 'appuntamento_imminente',
    label: 'Appuntamento imminente (promemoria)',
    description: 'Scatta X ore/minuti prima di un appuntamento',
    icon: 'Clock',
    categoria: 'crm',
    dbEvent: 'SCHEDULED',
    outputVariables: [
      { id: 'appuntamento.id', label: 'ID Appuntamento', type: 'uuid' },
      { id: 'appuntamento.title', label: 'Titolo', type: 'string' },
      { id: 'appuntamento.appointment_date', label: 'Data', type: 'date' },
      { id: 'appuntamento.appointment_time', label: 'Ora', type: 'string' },
      { id: 'appuntamento.contact_id', label: 'ID Contatto', type: 'uuid' },
    ],
    configSchema: [
      { id: 'ore_prima', label: "Ore prima dell'appuntamento", type: 'number', required: true, defaultValue: 24, min: 1, max: 168, helpText: 'Es: 24 = reminder il giorno prima' },
    ],
  },

  // ═══ ORDINI ═══
  {
    id: 'ordine_creato',
    label: 'Nuovo ordine creato',
    description: 'Scatta alla creazione di un nuovo ordine',
    icon: 'Package',
    categoria: 'ordini',
    dbTable: 'orders',
    dbEvent: 'INSERT',
    outputVariables: [
      { id: 'ordine.id', label: 'ID Ordine', type: 'uuid' },
      { id: 'ordine.order_code', label: 'Codice ordine', type: 'string', example: 'ORD-2024-001' },
      { id: 'ordine.total_amount', label: 'Importo totale (€)', type: 'number' },
      { id: 'ordine.customer_id', label: 'ID Cliente', type: 'uuid' },
      { id: 'ordine.current_status_id', label: 'Stato (ID)', type: 'uuid' },
      { id: 'ordine.created_at', label: 'Data creazione', type: 'date' },
    ],
    configSchema: [
      { id: 'importo_minimo', label: 'Solo ordini superiori a (€)', type: 'number', required: false, placeholder: 'Es: 500' },
    ],
  },
  {
    id: 'ordine_stato_cambiato',
    label: 'Stato ordine cambiato',
    description: 'Scatta quando un ordine cambia stato',
    icon: 'RotateCcw',
    categoria: 'ordini',
    dbTable: 'orders',
    dbEvent: 'UPDATE',
    outputVariables: [
      { id: 'ordine.id', label: 'ID Ordine', type: 'uuid' },
      { id: 'ordine.order_code', label: 'Codice ordine', type: 'string' },
      { id: 'ordine.current_status_id', label: 'Nuovo stato (ID)', type: 'uuid' },
      { id: 'ordine.customer_id', label: 'ID Cliente', type: 'uuid' },
      { id: 'ordine.total_amount', label: 'Importo (€)', type: 'number' },
    ],
    configSchema: [
      { id: 'stato_a', label: 'Quando arriva allo stato', type: 'select', required: true, options: [
        { value: 'confermato', label: 'Confermato' }, { value: 'in_lavorazione', label: 'In lavorazione' },
        { value: 'spedito', label: 'Spedito' }, { value: 'consegnato', label: 'Consegnato' },
        { value: 'annullato', label: 'Annullato' }, { value: 'reso', label: 'Reso/Rimborso' },
      ]},
    ],
  },
  {
    id: 'ordine_in_ritardo',
    label: 'Ordine in ritardo sulla consegna',
    description: 'Scatta quando un ordine supera la data di consegna prevista',
    icon: 'AlertTriangle',
    categoria: 'ordini',
    dbEvent: 'SCHEDULED',
    outputVariables: [
      { id: 'ordine.id', label: 'ID Ordine', type: 'uuid' },
      { id: 'ordine.order_code', label: 'Codice ordine', type: 'string' },
      { id: 'ordine.giorni_ritardo', label: 'Giorni di ritardo', type: 'number' },
      { id: 'ordine.customer_id', label: 'ID Cliente', type: 'uuid' },
    ],
    configSchema: [
      { id: 'giorni_tolleranza', label: 'Giorni di tolleranza dopo la scadenza', type: 'number', required: true, defaultValue: 1, min: 0, max: 30 },
    ],
  },

  // ═══ FATTURAZIONE & INCASSI ═══
  {
    id: 'fattura_creata',
    label: 'Nuova fattura emessa',
    description: 'Scatta alla creazione/emissione di una fattura',
    icon: 'Receipt',
    categoria: 'fatturazione',
    dbTable: 'invoices',
    dbEvent: 'INSERT',
    outputVariables: [
      { id: 'fattura.id', label: 'ID Fattura', type: 'uuid' },
      { id: 'fattura.invoice_number', label: 'Numero fattura', type: 'string' },
      { id: 'fattura.total', label: 'Totale (€)', type: 'number' },
      { id: 'fattura.tax_amount', label: 'IVA (€)', type: 'number' },
      { id: 'fattura.client_company_name', label: 'Nome cliente', type: 'string' },
      { id: 'fattura.client_email', label: 'Email cliente', type: 'string' },
      { id: 'fattura.due_date', label: 'Data scadenza pagamento', type: 'date' },
    ],
    configSchema: [],
  },
  {
    id: 'fattura_scaduta',
    label: 'Fattura scaduta non pagata',
    description: 'Scatta quando una fattura supera la data di scadenza senza pagamento',
    icon: 'Clock',
    categoria: 'fatturazione',
    dbEvent: 'SCHEDULED',
    outputVariables: [
      { id: 'fattura.id', label: 'ID Fattura', type: 'uuid' },
      { id: 'fattura.invoice_number', label: 'Numero fattura', type: 'string' },
      { id: 'fattura.total', label: 'Totale (€)', type: 'number' },
      { id: 'fattura.client_company_name', label: 'Nome cliente', type: 'string' },
      { id: 'fattura.client_email', label: 'Email cliente', type: 'string' },
      { id: 'fattura.giorni_scaduta', label: 'Giorni di ritardo', type: 'number' },
    ],
    configSchema: [
      { id: 'giorni_dopo_scadenza', label: 'Scatta dopo N giorni dalla scadenza', type: 'number', required: true, defaultValue: 3, min: 1, max: 90 },
    ],
  },
  {
    id: 'pagamento_ricevuto',
    label: 'Pagamento ricevuto',
    description: 'Scatta quando viene registrato un incasso/pagamento',
    icon: 'CreditCard',
    categoria: 'fatturazione',
    dbEvent: 'INSERT',
    outputVariables: [
      { id: 'pagamento.id', label: 'ID Pagamento', type: 'uuid' },
      { id: 'pagamento.importo', label: 'Importo (€)', type: 'number' },
      { id: 'pagamento.metodo', label: 'Metodo pagamento', type: 'string', example: 'Bonifico' },
      { id: 'pagamento.fattura_id', label: 'ID Fattura', type: 'uuid' },
      { id: 'pagamento.data', label: 'Data pagamento', type: 'date' },
    ],
    configSchema: [
      { id: 'importo_minimo', label: 'Solo pagamenti superiori a (€)', type: 'number', required: false, placeholder: 'Lascia vuoto per qualsiasi importo' },
    ],
  },
  {
    id: 'costo_registrato',
    label: 'Costo/Spesa registrata',
    description: 'Scatta quando viene inserita una nuova spesa o costo aziendale',
    icon: 'DollarSign',
    categoria: 'fatturazione',
    dbEvent: 'INSERT',
    outputVariables: [
      { id: 'costo.id', label: 'ID Spesa', type: 'uuid' },
      { id: 'costo.importo', label: 'Importo (€)', type: 'number' },
      { id: 'costo.categoria', label: 'Categoria spesa', type: 'string' },
      { id: 'costo.descrizione', label: 'Descrizione', type: 'string' },
      { id: 'costo.fornitore', label: 'Fornitore', type: 'string' },
      { id: 'costo.creato_da', label: 'Inserito da (user ID)', type: 'uuid' },
    ],
    configSchema: [
      { id: 'importo_soglia', label: 'Solo spese superiori a (€) — per approvazione', type: 'number', required: false, placeholder: 'Es: 500' },
    ],
  },
  {
    id: 'costo_in_scadenza',
    label: 'Costo in scadenza',
    description: 'Scatta quando un costo/spesa ha la scadenza di pagamento entro N giorni. Controllo giornaliero.',
    icon: 'CalendarClock',
    categoria: 'fatturazione',
    dbEvent: 'SCHEDULED',
    outputVariables: [
      { id: 'costo.id', label: 'ID Spesa', type: 'uuid' },
      { id: 'costo.importo', label: 'Importo (€)', type: 'number' },
      { id: 'costo.descrizione', label: 'Descrizione', type: 'string' },
    ],
    configSchema: [
      { id: 'days_before', label: 'Giorni di preavviso', type: 'number', required: false, defaultValue: 7, helpText: 'Scatta se la scadenza è entro N giorni' },
    ],
  },

  // ═══ PREVENTIVI ═══
  {
    id: 'preventivo_creato',
    label: 'Preventivo creato',
    description: 'Scatta alla creazione di un nuovo preventivo/offerta',
    icon: 'FileText',
    categoria: 'preventivi',
    dbTable: 'quotes',
    dbEvent: 'INSERT',
    outputVariables: [
      { id: 'preventivo.id', label: 'ID Preventivo', type: 'uuid' },
      { id: 'preventivo.quote_number', label: 'Numero preventivo', type: 'string' },
      { id: 'preventivo.total', label: 'Importo totale (€)', type: 'number' },
      { id: 'preventivo.client_name', label: 'Nome cliente', type: 'string' },
      { id: 'preventivo.client_email', label: 'Email cliente', type: 'string' },
      { id: 'preventivo.expires_at', label: 'Data validità', type: 'date' },
    ],
    configSchema: [],
  },
  {
    id: 'preventivo_accettato',
    label: 'Preventivo accettato',
    description: 'Il cliente ha accettato il preventivo',
    icon: 'CheckSquare',
    categoria: 'preventivi',
    dbTable: 'quotes',
    dbEvent: 'UPDATE',
    outputVariables: [
      { id: 'preventivo.id', label: 'ID Preventivo', type: 'uuid' },
      { id: 'preventivo.quote_number', label: 'Numero preventivo', type: 'string' },
      { id: 'preventivo.total', label: 'Importo (€)', type: 'number' },
      { id: 'preventivo.client_name', label: 'Nome cliente', type: 'string' },
      { id: 'preventivo.client_email', label: 'Email cliente', type: 'string' },
      { id: 'preventivo.contact_id', label: 'ID Contatto', type: 'uuid' },
    ],
    configSchema: [],
  },
  {
    id: 'preventivo_rifiutato',
    label: 'Preventivo rifiutato',
    description: 'Il cliente ha rifiutato il preventivo',
    icon: 'XCircle',
    categoria: 'preventivi',
    dbTable: 'quotes',
    dbEvent: 'UPDATE',
    outputVariables: [
      { id: 'preventivo.id', label: 'ID Preventivo', type: 'uuid' },
      { id: 'preventivo.quote_number', label: 'Numero preventivo', type: 'string' },
      { id: 'preventivo.client_name', label: 'Nome cliente', type: 'string' },
      { id: 'preventivo.client_email', label: 'Email cliente', type: 'string' },
    ],
    configSchema: [],
  },
  {
    id: 'preventivo_in_scadenza',
    label: 'Preventivo in scadenza',
    description: 'Scatta N giorni prima della scadenza di un preventivo non ancora risposto',
    icon: 'Hourglass',
    categoria: 'preventivi',
    dbEvent: 'SCHEDULED',
    outputVariables: [
      { id: 'preventivo.id', label: 'ID Preventivo', type: 'uuid' },
      { id: 'preventivo.quote_number', label: 'Numero preventivo', type: 'string' },
      { id: 'preventivo.total', label: 'Importo (€)', type: 'number' },
      { id: 'preventivo.client_name', label: 'Nome cliente', type: 'string' },
      { id: 'preventivo.client_email', label: 'Email cliente', type: 'string' },
      { id: 'preventivo.giorni_alla_scadenza', label: 'Giorni alla scadenza', type: 'number' },
    ],
    configSchema: [
      { id: 'giorni_prima', label: 'Giorni prima della scadenza', type: 'number', required: true, defaultValue: 3, min: 1, max: 30 },
    ],
  },

  // ═══ TICKET ASSISTENZA ═══
  {
    id: 'ticket_creato',
    label: 'Nuovo ticket assistenza aperto',
    description: 'Scatta quando un cliente apre un nuovo ticket di supporto',
    icon: 'Ticket',
    categoria: 'assistenza',
    dbTable: 'tickets',
    dbEvent: 'INSERT',
    outputVariables: [
      { id: 'ticket.id', label: 'ID Ticket', type: 'uuid' },
      { id: 'ticket.subject', label: 'Oggetto', type: 'string' },
      { id: 'ticket.priority', label: 'Priorità', type: 'string' },
      { id: 'ticket.category', label: 'Categoria problema', type: 'string' },
      { id: 'ticket.customer_id', label: 'ID Cliente', type: 'uuid' },
      { id: 'ticket.assigned_to', label: 'Assegnato a', type: 'uuid' },
    ],
    configSchema: [
      { id: 'priorita_filtro', label: 'Solo ticket con priorità', type: 'select', required: false, options: [
        { value: '', label: 'Qualsiasi priorità' }, { value: 'urgente', label: 'Urgente 🔴' },
        { value: 'alta', label: 'Alta 🟠' }, { value: 'media', label: 'Media 🟡' }, { value: 'bassa', label: 'Bassa 🟢' },
      ]},
    ],
  },
  {
    id: 'ticket_stato_cambiato',
    label: 'Stato ticket cambiato',
    description: 'Scatta quando un ticket cambia stato (aperto→in_lavorazione→risolto)',
    icon: 'RotateCcw',
    categoria: 'assistenza',
    dbTable: 'tickets',
    dbEvent: 'UPDATE',
    outputVariables: [
      { id: 'ticket.id', label: 'ID Ticket', type: 'uuid' },
      { id: 'ticket.subject', label: 'Oggetto', type: 'string' },
      { id: 'ticket.status', label: 'Nuovo stato', type: 'string' },
      { id: 'ticket.customer_id', label: 'ID Cliente', type: 'uuid' },
      { id: 'ticket.assigned_to', label: 'Assegnato a (user ID)', type: 'uuid' },
    ],
    configSchema: [
      { id: 'stato_a', label: 'Quando passa allo stato', type: 'select', required: true, options: [
        { value: 'in_lavorazione', label: 'In lavorazione' }, { value: 'in_attesa_cliente', label: 'In attesa risposta cliente' },
        { value: 'risolto', label: 'Risolto ✅' }, { value: 'chiuso', label: 'Chiuso' },
      ]},
    ],
  },
  {
    id: 'ticket_senza_risposta',
    label: 'Ticket senza risposta da N ore',
    description: 'SLA alert: ticket aperto senza aggiornamenti da troppo tempo',
    icon: 'AlertTriangle',
    categoria: 'assistenza',
    dbEvent: 'SCHEDULED',
    outputVariables: [
      { id: 'ticket.id', label: 'ID Ticket', type: 'uuid' },
      { id: 'ticket.subject', label: 'Oggetto', type: 'string' },
      { id: 'ticket.ore_apertura', label: "Ore dall'apertura", type: 'number' },
      { id: 'ticket.customer_id', label: 'ID Cliente', type: 'uuid' },
      { id: 'ticket.assigned_to', label: 'Assegnato a (user ID)', type: 'uuid' },
    ],
    configSchema: [
      { id: 'ore_sla', label: 'SLA: ore massime senza risposta', type: 'number', required: true, defaultValue: 24, min: 1, max: 168, helpText: 'Es: 24 = scatta se il ticket è ancora aperto dopo 24h' },
    ],
  },

  // ═══ MAGAZZINO ═══
  {
    id: 'scorta_minima',
    label: 'Prodotto sotto scorta minima',
    description: 'Scatta quando la giacenza di un prodotto scende sotto il minimo',
    icon: 'AlertTriangle',
    categoria: 'magazzino',
    dbTable: 'warehouse_stock',
    dbEvent: 'UPDATE',
    outputVariables: [
      { id: 'prodotto.id', label: 'ID Prodotto', type: 'uuid' },
      { id: 'prodotto.name', label: 'Nome prodotto', type: 'string' },
      { id: 'prodotto.quantity', label: 'Giacenza attuale', type: 'number' },
      { id: 'prodotto.min_stock_level', label: 'Scorta minima impostata', type: 'number' },
      { id: 'prodotto.supplier_id', label: 'ID Fornitore', type: 'uuid' },
    ],
    configSchema: [],
  },
  {
    id: 'prodotto_esaurito',
    label: 'Prodotto esaurito (giacenza = 0)',
    description: 'Scatta quando un prodotto raggiunge giacenza zero',
    icon: 'XCircle',
    categoria: 'magazzino',
    dbTable: 'warehouse_stock',
    dbEvent: 'UPDATE',
    outputVariables: [
      { id: 'prodotto.id', label: 'ID Prodotto', type: 'uuid' },
      { id: 'prodotto.name', label: 'Nome prodotto', type: 'string' },
    ],
    configSchema: [],
  },
  {
    id: 'carico_magazzino',
    label: 'Nuovo carico in magazzino',
    description: 'Scatta quando arriva un nuovo carico di merce',
    icon: 'Warehouse',
    categoria: 'magazzino',
    dbTable: 'warehouse_stock_movements',
    dbEvent: 'INSERT',
    outputVariables: [
      { id: 'carico.id', label: 'ID Movimento', type: 'uuid' },
      { id: 'carico.stock_item_id', label: 'ID Articolo', type: 'uuid' },
      { id: 'carico.quantity', label: 'Quantità', type: 'number' },
    ],
    configSchema: [],
  },

  // ═══ MARKETING ═══
  {
    id: 'email_aperta',
    label: 'Email di marketing aperta',
    description: "Il contatto ha aperto un'email della campagna",
    icon: 'Mail',
    categoria: 'marketing',
    dbEvent: 'UPDATE',
    outputVariables: [
      { id: 'contatto.id', label: 'ID Contatto', type: 'uuid' },
      { id: 'contatto.first_name', label: 'Nome contatto', type: 'string' },
      { id: 'contatto.last_name', label: 'Cognome contatto', type: 'string' },
      { id: 'contatto.full_name', label: 'Nome completo', type: 'string', example: 'Mario Rossi' },
      { id: 'contatto.email', label: 'Email', type: 'string' },
      { id: 'campagna.id', label: 'ID Campagna', type: 'uuid' },
      { id: 'campagna.nome', label: 'Nome campagna', type: 'string' },
    ],
    configSchema: [
      { id: 'campagna_id', label: 'Campagna specifica (opzionale)', type: 'entity_select', required: false, helpText: 'Lascia vuoto per qualsiasi campagna' },
    ],
  },
  {
    id: 'email_cliccata',
    label: 'Link email cliccato',
    description: "Il contatto ha cliccato un link nell'email",
    icon: 'Mail',
    categoria: 'marketing',
    dbEvent: 'UPDATE',
    outputVariables: [
      { id: 'contatto.id', label: 'ID Contatto', type: 'uuid' },
      { id: 'contatto.first_name', label: 'Nome', type: 'string' },
      { id: 'contatto.last_name', label: 'Cognome', type: 'string' },
      { id: 'contatto.full_name', label: 'Nome completo', type: 'string', example: 'Mario Rossi' },
      { id: 'contatto.email', label: 'Email', type: 'string' },
      { id: 'campagna.nome', label: 'Nome campagna', type: 'string' },
      { id: 'link.url', label: 'URL cliccato', type: 'string' },
    ],
    configSchema: [],
  },
  {
    id: 'form_compilato',
    label: 'Form compilato',
    description: 'Un visitatore ha compilato un form di lead generation',
    icon: 'ListTodo',
    categoria: 'marketing',
    dbEvent: 'INSERT',
    outputVariables: [
      { id: 'contatto.id', label: 'ID Contatto', type: 'uuid' },
      { id: 'contatto.first_name', label: 'Nome', type: 'string' },
      { id: 'contatto.last_name', label: 'Cognome', type: 'string' },
      { id: 'contatto.full_name', label: 'Nome completo', type: 'string', example: 'Mario Rossi' },
      { id: 'contatto.email', label: 'Email', type: 'string' },
      { id: 'contatto.phone', label: 'Telefono', type: 'string' },
      { id: 'form.nome', label: 'Nome form', type: 'string' },
      { id: 'form.pagina', label: 'Pagina di origine', type: 'string' },
    ],
    configSchema: [
      { id: 'form_id', label: 'Form specifico (opzionale)', type: 'entity_select', required: false },
    ],
  },
  {
    id: 'whatsapp_ricevuto',
    label: 'Messaggio WhatsApp ricevuto',
    description: 'Un contatto ha inviato un messaggio WhatsApp',
    icon: 'MessageSquare',
    categoria: 'marketing',
    dbEvent: 'INSERT',
    outputVariables: [
      { id: 'messaggio.id', label: 'ID Messaggio', type: 'uuid' },
      { id: 'messaggio.testo', label: 'Testo messaggio', type: 'string' },
      { id: 'messaggio.mittente', label: 'Numero mittente', type: 'string' },
      { id: 'contatto.id', label: 'ID Contatto (se trovato)', type: 'uuid' },
      { id: 'contatto.first_name', label: 'Nome contatto', type: 'string' },
      { id: 'contatto.last_name', label: 'Cognome contatto', type: 'string' },
      { id: 'contatto.full_name', label: 'Nome completo', type: 'string', example: 'Mario Rossi' },
    ],
    configSchema: [],
  },
  {
    id: 'campagna_facebook_lead',
    label: 'Lead da campagna Facebook',
    description: 'Scatta quando un lead arriva da una campagna Facebook/Meta',
    icon: 'Users',
    categoria: 'marketing',
    dbEvent: 'INSERT',
    outputVariables: [
      { id: 'contatto.id', label: 'ID Contatto', type: 'uuid' },
      { id: 'contatto.first_name', label: 'Nome', type: 'string' },
      { id: 'contatto.last_name', label: 'Cognome', type: 'string' },
      { id: 'contatto.full_name', label: 'Nome completo', type: 'string', example: 'Mario Rossi' },
      { id: 'contatto.email', label: 'Email', type: 'string' },
      { id: 'contatto.phone', label: 'Telefono', type: 'string' },
      { id: 'campagna.nome', label: 'Nome campagna', type: 'string' },
    ],
    // Stile GHL: il trigger può essere ristretto a una pagina e/o ad alcuni
    // moduli lead. Vuoto = scatta per qualsiasi lead Meta dell'azienda.
    configSchema: [
      { id: 'page_id', label: 'Pagina Facebook', type: 'meta_page_select', required: false, helpText: 'Scatta solo per i lead di questa pagina. Vuoto = tutte le pagine collegate.' },
      { id: 'form_ids', label: 'Moduli lead', type: 'meta_form_multi_select', required: false, helpText: 'Scatta solo per i lead di questi moduli. Vuoto = tutti i moduli.' },
    ],
  },

  // ═══ HR & PERSONALE ═══
  {
    id: 'dipendente_creato',
    label: 'Nuovo dipendente aggiunto',
    description: 'Scatta quando viene inserito un nuovo dipendente/collaboratore',
    icon: 'UserPlus',
    categoria: 'hr',
    dbTable: 'profiles',  // FIX B7: tabella reale è profiles, non employees
    dbEvent: 'INSERT',
    outputVariables: [
      { id: 'dipendente.id', label: 'ID Dipendente', type: 'uuid' },
      { id: 'dipendente.first_name', label: 'Nome', type: 'string' },
      { id: 'dipendente.last_name', label: 'Cognome', type: 'string' },
      { id: 'dipendente.email', label: 'Email', type: 'string' },
      { id: 'dipendente.role_type', label: 'Ruolo', type: 'string' },
    ],
    configSchema: [],
  },
  {
    id: 'contratto_in_scadenza',
    label: 'Contratto dipendente in scadenza',
    description: 'Scatta N giorni prima della scadenza di un contratto',
    icon: 'FileText',
    categoria: 'hr',
    dbTable: 'profiles',  // FIX B7: collegato alla tabella profiles
    dbEvent: 'SCHEDULED',
    outputVariables: [
      { id: 'dipendente.id', label: 'ID Dipendente', type: 'uuid' },
      { id: 'dipendente.first_name', label: 'Nome', type: 'string' },
      { id: 'dipendente.last_name', label: 'Cognome', type: 'string' },
      { id: 'contratto.scadenza', label: 'Data scadenza contratto', type: 'date' },
      { id: 'contratto.giorni_rimanenti', label: 'Giorni rimanenti', type: 'number' },
    ],
    configSchema: [
      { id: 'giorni_prima', label: 'Giorni prima della scadenza', type: 'number', required: true, defaultValue: 30, min: 1, max: 180 },
    ],
  },
  {
    id: 'ferie_richiesta',
    label: 'Richiesta ferie/permesso inviata',
    description: 'Un dipendente ha inviato una richiesta di ferie o permesso',
    icon: 'Calendar',
    categoria: 'hr',
    dbEvent: 'INSERT',
    outputVariables: [
      { id: 'richiesta.id', label: 'ID Richiesta', type: 'uuid' },
      { id: 'dipendente.first_name', label: 'Nome dipendente', type: 'string' },
      { id: 'dipendente.last_name', label: 'Cognome dipendente', type: 'string' },
      { id: 'richiesta.tipo', label: 'Tipo (ferie/permesso)', type: 'string' },
      { id: 'richiesta.data_inizio', label: 'Dal', type: 'date' },
      { id: 'richiesta.data_fine', label: 'Al', type: 'date' },
      { id: 'richiesta.giorni', label: 'Numero giorni', type: 'number' },
    ],
    configSchema: [],
  },

  // ═══ CANTIERI ═══
  {
    id: 'cantiere_creato',
    label: 'Nuovo cantiere aperto',
    description: 'Scatta alla creazione di un nuovo cantiere/commessa',
    icon: 'Building2',
    categoria: 'cantieri',
    dbTable: 'orders',  // FIX B9: il cantiere è un record orders nel DB
    dbEvent: 'INSERT',
    outputVariables: [
      // FIX B9: namespace corretto ordine.* (il cantiere è un orders record)
      { id: 'ordine.id', label: 'ID Cantiere', type: 'uuid' },
      { id: 'ordine.order_code', label: 'Codice cantiere', type: 'string' },
      { id: 'ordine.description', label: 'Descrizione cantiere', type: 'string' },
      { id: 'ordine.total_amount', label: 'Importo commessa (€)', type: 'number' },
      { id: 'ordine.work_start_date', label: 'Data inizio prevista', type: 'date' },
      { id: 'ordine.work_end_date', label: 'Data fine prevista', type: 'date' },
      { id: 'ordine.assigned_to', label: 'Responsabile (user ID)', type: 'uuid' },
      { id: 'ordine.customer_id', label: 'ID Cliente', type: 'uuid' },
    ],
    configSchema: [],
  },
  {
    id: 'cantiere_fase_completata',
    label: 'Fase cantiere completata',
    description: 'Scatta quando viene completata una fase/milestone del cantiere',
    icon: 'CheckSquare',
    categoria: 'cantieri',
    dbEvent: 'UPDATE',
    outputVariables: [
      { id: 'fase.id', label: 'ID Fase', type: 'uuid' },
      { id: 'fase.nome', label: 'Nome fase', type: 'string' },
      { id: 'cantiere.id', label: 'ID Cantiere', type: 'uuid' },
      { id: 'cantiere.nome', label: 'Nome cantiere', type: 'string' },
    ],
    configSchema: [],
  },
  {
    id: 'cantiere_in_ritardo',
    label: 'Cantiere in ritardo sulla data di fine',
    description: 'Scatta quando un cantiere supera la data di fine prevista',
    icon: 'AlertTriangle',
    categoria: 'cantieri',
    dbEvent: 'SCHEDULED',
    outputVariables: [
      { id: 'cantiere.id', label: 'ID Cantiere', type: 'uuid' },
      { id: 'cantiere.nome', label: 'Nome cantiere', type: 'string' },
      { id: 'cantiere.giorni_ritardo', label: 'Giorni di ritardo', type: 'number' },
      { id: 'cantiere.responsabile_id', label: 'Responsabile (user ID)', type: 'uuid' },
    ],
    configSchema: [
      { id: 'giorni_tolleranza', label: 'Giorni di tolleranza', type: 'number', required: true, defaultValue: 0, min: 0, max: 30 },
    ],
  },

  // ═══ TASK ═══
  {
    id: 'task_creato',
    label: 'Nuova attività creata',
    description: 'Scatta alla creazione di un nuovo task/attività',
    icon: 'CheckSquare',
    categoria: 'task',
    dbEvent: 'INSERT',
    outputVariables: [
      { id: 'task.id', label: 'ID Task', type: 'uuid' },
      { id: 'task.title', label: 'Titolo', type: 'string' },
      { id: 'task.priority', label: 'Priorità', type: 'string' },
      { id: 'task.assigned_to', label: 'Assegnato a (user ID)', type: 'uuid' },
      { id: 'task.due_date', label: 'Data scadenza', type: 'date' },
    ],
    configSchema: [
      { id: 'priorita_filtro', label: 'Solo task con priorità', type: 'select', required: false, options: [
        { value: '', label: 'Qualsiasi' }, { value: 'urgente', label: 'Urgente' },
        { value: 'alta', label: 'Alta' }, { value: 'media', label: 'Media' }, { value: 'bassa', label: 'Bassa' },
      ]},
    ],
  },
  {
    id: 'task_completato',
    label: 'Attività completata',
    description: 'Scatta quando un task viene marcato come completato',
    icon: 'ClipboardCheck',
    categoria: 'task',
    dbEvent: 'UPDATE',
    outputVariables: [
      { id: 'task.id', label: 'ID Task', type: 'uuid' },
      { id: 'task.title', label: 'Titolo', type: 'string' },
      { id: 'task.completato_da', label: 'Completato da (user ID)', type: 'uuid' },
    ],
    configSchema: [],
  },
  {
    id: 'task_scaduto',
    label: 'Attività scaduta senza completamento',
    description: 'Scatta quando una attività supera la data di scadenza',
    icon: 'Clock',
    categoria: 'task',
    dbEvent: 'SCHEDULED',
    outputVariables: [
      { id: 'task.id', label: 'ID Task', type: 'uuid' },
      { id: 'task.title', label: 'Titolo', type: 'string' },
      { id: 'task.assigned_to', label: 'Assegnato a (user ID)', type: 'uuid' },
      { id: 'task.giorni_ritardo', label: 'Giorni di ritardo', type: 'number' },
    ],
    configSchema: [],
  },

  // ═══ SCHEDULATI / MANUALI ═══
  {
    id: 'cron_giornaliero',
    label: 'Ogni giorno (a orario fisso)',
    description: "Il flow si esegue automaticamente ogni giorno all'orario specificato",
    icon: 'Clock',
    categoria: 'generale',
    dbEvent: 'SCHEDULED',
    outputVariables: [
      { id: 'cron.data', label: 'Data esecuzione', type: 'date' },
      { id: 'cron.ora', label: 'Ora esecuzione', type: 'string' },
    ],
    configSchema: [
      { id: 'orario', label: 'Orario di esecuzione', type: 'time', required: true, defaultValue: '08:00', helpText: "Ora locale dell'azienda" },
    ],
  },
  {
    id: 'cron_settimanale',
    label: 'Ogni settimana (giorno fisso)',
    description: 'Il flow si esegue una volta alla settimana nel giorno specificato',
    icon: 'Calendar',
    categoria: 'generale',
    dbEvent: 'SCHEDULED',
    outputVariables: [
      { id: 'cron.data', label: 'Data esecuzione', type: 'date' },
      { id: 'cron.giorno', label: 'Giorno della settimana', type: 'string' },
    ],
    configSchema: [
      { id: 'giorno', label: 'Giorno della settimana', type: 'select', required: true, defaultValue: 'lunedi', options: [
        { value: 'lunedi', label: 'Lunedì' }, { value: 'martedi', label: 'Martedì' },
        { value: 'mercoledi', label: 'Mercoledì' }, { value: 'giovedi', label: 'Giovedì' },
        { value: 'venerdi', label: 'Venerdì' }, { value: 'sabato', label: 'Sabato' }, { value: 'domenica', label: 'Domenica' },
      ]},
      { id: 'orario', label: 'Orario', type: 'time', required: true, defaultValue: '08:00' },
    ],
  },
  {
    id: 'cron_mensile',
    label: 'Ogni mese (giorno fisso)',
    description: 'Il flow si esegue una volta al mese',
    icon: 'Calendar',
    categoria: 'generale',
    dbEvent: 'SCHEDULED',
    outputVariables: [
      { id: 'cron.data', label: 'Data esecuzione', type: 'date' },
      { id: 'cron.mese', label: 'Mese', type: 'string' },
    ],
    configSchema: [
      { id: 'giorno_mese', label: 'Giorno del mese', type: 'number', required: true, defaultValue: 1, min: 1, max: 28, helpText: 'Max 28 per evitare problemi con febbraio' },
      { id: 'orario', label: 'Orario', type: 'time', required: true, defaultValue: '08:00' },
    ],
  },
  {
    id: 'manuale',
    label: 'Avvio manuale',
    description: 'Il flow viene avviato manualmente da un utente (pulsante "Esegui")',
    icon: 'Play',
    categoria: 'generale',
    dbEvent: 'SCHEDULED',
    outputVariables: [
      { id: 'manuale.avviato_da', label: 'Avviato da (user ID)', type: 'uuid' },
      { id: 'manuale.timestamp', label: 'Timestamp avvio', type: 'date' },
    ],
    configSchema: [],
  },

  // ═══ PIATTAFORMA (solo area superadmin) ═══
  {
    id: 'azienda_creata',
    label: 'Nuova azienda registrata',
    description: 'Si attiva quando viene creata una nuova azienda sulla piattaforma',
    icon: 'Building',
    categoria: 'piattaforma',
    dbEvent: 'PLATFORM_COMPANY_CREATED',
    outputVariables: [
      { id: 'nome', label: 'Nome admin (per i saluti)', type: 'string', example: 'Marco' },
      { id: 'cognome', label: 'Cognome admin', type: 'string', example: 'Rossi' },
      { id: 'nome_completo', label: 'Nome completo admin', type: 'string', example: 'Marco Rossi' },
      { id: 'azienda', label: 'Nome azienda', type: 'string', example: 'Costruzioni Rossi' },
      { id: 'azienda.id', label: 'ID Azienda', type: 'uuid' },
      { id: 'azienda.name', label: 'Nome azienda (alt.)', type: 'string' },
      { id: 'azienda.email', label: 'Email admin', type: 'string' },
      { id: 'azienda.piano', label: 'Piano attuale', type: 'string' },
      { id: 'azienda.created_at', label: 'Data creazione', type: 'date' },
    ],
    configSchema: [],
  },
  {
    id: 'piano_cambiato',
    label: 'Piano modificato',
    description: 'Si attiva quando un\'azienda cambia piano (upgrade o downgrade)',
    icon: 'CreditCard',
    categoria: 'piattaforma',
    dbEvent: 'PLATFORM_PLAN_CHANGED',
    outputVariables: [
      { id: 'azienda.id', label: 'ID Azienda', type: 'uuid' },
      { id: 'azienda.name', label: 'Nome azienda', type: 'string' },
      { id: 'piano.vecchio', label: 'Piano precedente', type: 'string' },
      { id: 'piano.nuovo', label: 'Nuovo piano', type: 'string' },
    ],
    configSchema: [
      { id: 'tipo_cambio', label: 'Tipo cambio', type: 'select', required: false, options: [
        { value: '', label: 'Qualsiasi' },
        { value: 'upgrade', label: 'Solo upgrade' },
        { value: 'downgrade', label: 'Solo downgrade' },
      ]},
    ],
  },
  {
    id: 'abbonamento_cancellato',
    label: 'Abbonamento cancellato',
    description: 'Si attiva quando un\'azienda cancella l\'abbonamento',
    icon: 'XCircle',
    categoria: 'piattaforma',
    dbEvent: 'PLATFORM_SUBSCRIPTION_CANCELLED',
    outputVariables: [
      { id: 'azienda.id', label: 'ID Azienda', type: 'uuid' },
      { id: 'azienda.name', label: 'Nome azienda', type: 'string' },
      { id: 'abbonamento.piano', label: 'Piano cancellato', type: 'string' },
      { id: 'abbonamento.motivo', label: 'Motivo cancellazione', type: 'string' },
    ],
    configSchema: [],
  },
  {
    id: 'trial_in_scadenza',
    label: 'Trial in scadenza',
    description: 'Si attiva X giorni prima della scadenza del periodo di prova',
    icon: 'Clock',
    categoria: 'piattaforma',
    dbEvent: 'PLATFORM_TRIAL_EXPIRING',
    outputVariables: [
      { id: 'azienda.id', label: 'ID Azienda', type: 'uuid' },
      { id: 'azienda.name', label: 'Nome azienda', type: 'string' },
      { id: 'trial.scadenza', label: 'Data scadenza trial', type: 'date' },
      { id: 'trial.giorni_rimasti', label: 'Giorni rimasti', type: 'number' },
    ],
    configSchema: [
      { id: 'giorni_prima', label: 'Giorni prima della scadenza', type: 'number', required: true, defaultValue: 3, min: 1, max: 30 },
    ],
  },
  {
    id: 'crediti_ai_bassi',
    label: 'Crediti AI in esaurimento',
    description: 'Si attiva quando i crediti AI di un\'azienda scendono sotto la soglia',
    icon: 'AlertTriangle',
    categoria: 'piattaforma',
    dbEvent: 'PLATFORM_AI_CREDITS_LOW',
    outputVariables: [
      { id: 'azienda.id', label: 'ID Azienda', type: 'uuid' },
      { id: 'azienda.name', label: 'Nome azienda', type: 'string' },
      { id: 'crediti.saldo', label: 'Saldo attuale (€)', type: 'number' },
    ],
    configSchema: [
      { id: 'soglia_eur', label: 'Soglia minima (€)', type: 'number', required: true, defaultValue: 5, min: 0 },
    ],
  },
  {
    id: 'ticket_piattaforma_aperto',
    label: 'Ticket di assistenza aperto',
    description: 'Si attiva quando un\'azienda apre un nuovo ticket di supporto',
    icon: 'MessageSquare',
    categoria: 'piattaforma',
    dbEvent: 'PLATFORM_TICKET_OPENED',
    outputVariables: [
      { id: 'azienda.id', label: 'ID Azienda', type: 'uuid' },
      { id: 'azienda.name', label: 'Nome azienda', type: 'string' },
      { id: 'ticket.id', label: 'ID Ticket', type: 'uuid' },
      { id: 'ticket.titolo', label: 'Titolo ticket', type: 'string' },
      { id: 'ticket.priorita', label: 'Priorità', type: 'string' },
    ],
    configSchema: [
      { id: 'priorita_filtro', label: 'Filtra per priorità (opzionale)', type: 'select', required: false, options: [
        { value: '', label: 'Qualsiasi' },
        { value: 'urgente', label: 'Urgente' },
        { value: 'alta', label: 'Alta' },
        { value: 'normale', label: 'Normale' },
      ]},
    ],
  },
  {
    id: 'azienda_in_pausa',
    label: 'Azienda messa in pausa',
    description: 'Si attiva quando un\'azienda viene sospesa dalla piattaforma',
    icon: 'PauseCircle',
    categoria: 'piattaforma',
    dbEvent: 'PLATFORM_COMPANY_PAUSED',
    outputVariables: [
      { id: 'azienda.id', label: 'ID Azienda', type: 'uuid' },
      { id: 'azienda.name', label: 'Nome azienda', type: 'string' },
      { id: 'pausa.motivo', label: 'Motivo sospensione', type: 'string' },
    ],
    configSchema: [],
  },
  {
    id: 'cliente_contrattualizzato',
    label: 'Cliente contrattualizzato (deal vinto)',
    description: 'Si attiva quando un\'opportunità CRM viene marcata come vinta — ideale per onboarding automatico',
    icon: 'FileCheck',
    categoria: 'piattaforma',
    dbEvent: 'PLATFORM_DEAL_WON',
    outputVariables: [
      { id: 'azienda.id', label: 'ID Azienda creata', type: 'uuid' },
      { id: 'azienda.name', label: 'Nome azienda', type: 'string' },
      { id: 'contatto.email', label: 'Email contatto', type: 'string' },
      { id: 'contatto.first_name', label: 'Nome contatto', type: 'string' },
      { id: 'opportunita.id', label: 'ID Opportunità', type: 'uuid' },
      { id: 'opportunita.value', label: 'Valore contratto (€)', type: 'number' },
      { id: 'opportunita.piano', label: 'Piano scelto', type: 'string' },
    ],
    configSchema: [],
  },
  {
    id: 'pagamento_piattaforma_ricevuto',
    label: 'Pagamento abbonamento ricevuto',
    description: 'Si attiva quando viene registrato un pagamento abbonamento da parte di un\'azienda cliente (piattaforma)',
    icon: 'CheckCircle',
    categoria: 'piattaforma',
    dbEvent: 'PLATFORM_PAYMENT_RECEIVED',
    outputVariables: [
      { id: 'azienda.id', label: 'ID Azienda', type: 'uuid' },
      { id: 'azienda.name', label: 'Nome azienda', type: 'string' },
      { id: 'pagamento.importo', label: 'Importo (€)', type: 'number' },
      { id: 'pagamento.data', label: 'Data pagamento', type: 'date' },
      { id: 'pagamento.metodo', label: 'Metodo di pagamento', type: 'string' },
    ],
    configSchema: [],
  },
  {
    // ID rinominato per evitare collisione con il trigger 'fattura_scaduta'
    // di categoria 'fatturazione' (TRIGGER_MAP avrebbe sovrascritto l'uno con l'altro).
    id: 'fattura_piattaforma_scaduta',
    label: 'Fattura scaduta / non pagata',
    description: 'Si attiva quando una fattura supera la data di scadenza senza pagamento',
    icon: 'AlertCircle',
    categoria: 'piattaforma',
    dbEvent: 'PLATFORM_INVOICE_OVERDUE',
    outputVariables: [
      { id: 'azienda.id', label: 'ID Azienda', type: 'uuid' },
      { id: 'azienda.name', label: 'Nome azienda', type: 'string' },
      { id: 'fattura.importo', label: 'Importo fattura (€)', type: 'number' },
      { id: 'fattura.scadenza', label: 'Data scadenza', type: 'date' },
      { id: 'fattura.giorni_ritardo', label: 'Giorni di ritardo', type: 'number' },
    ],
    configSchema: [
      { id: 'giorni_ritardo_min', label: 'Scatta dopo X giorni di ritardo', type: 'number', required: true, defaultValue: 1, min: 1, max: 90 },
    ],
  },
];

// ─── ACTION CATALOG ──────────────────────────────────────────────────────────
// Placeholders use real DB variable names

export const ACTION_CATALOG: ActionDefinition[] = [

  // ═══ TASK & ATTIVITÀ ═══
  {
    id: 'crea_task',
    label: 'Crea attività',
    description: 'Crea un nuovo task nella sezione Attività',
    icon: 'CheckSquare',
    categoria: 'task',
    outputVariables: [{ id: 'task.id', label: 'ID Task creato', type: 'uuid' }],
    configSchema: [
      { id: 'titolo', label: 'Titolo attività', type: 'text', required: true, placeholder: 'Es: Chiamare {{contatto.first_name}} per follow-up', supportsVariables: true },
      { id: 'descrizione', label: 'Descrizione', type: 'textarea', required: false, supportsVariables: true },
      { id: 'priorita', label: 'Priorità', type: 'select', required: true, defaultValue: 'media', options: [
        { value: 'urgente', label: 'Urgente 🔴' }, { value: 'alta', label: 'Alta 🟠' },
        { value: 'media', label: 'Media 🟡' }, { value: 'bassa', label: 'Bassa 🟢' },
      ]},
      { id: 'assegnato_a', label: 'Assegna a', type: 'user_select', required: false, helpText: 'Lascia vuoto per assegnare al responsabile del trigger' },
      { id: 'scadenza_giorni', label: 'Scadenza (giorni dalla creazione)', type: 'number', required: false, min: 0, max: 365, placeholder: 'Es: 3' },
    ],
  },
  {
    id: 'aggiorna_task',
    label: 'Aggiorna stato attività',
    description: 'Cambia stato, priorità o assegnatario di un task esistente',
    icon: 'Edit',
    categoria: 'task',
    configSchema: [
      { id: 'task_id', label: 'ID Task (usa variabile)', type: 'text', required: true, supportsVariables: true, placeholder: '{{task.id}}', helpText: 'Di solito si usa la variabile {{task.id}} dal trigger' },
      { id: 'stato', label: 'Nuovo stato', type: 'select', required: false, options: [
        { value: 'da_fare', label: 'Da fare' }, { value: 'in_corso', label: 'In corso' },
        { value: 'in_attesa', label: 'In attesa' }, { value: 'completato', label: 'Completato' }, { value: 'annullato', label: 'Annullato' },
      ]},
      { id: 'priorita', label: 'Nuova priorità', type: 'select', required: false, options: [
        { value: '', label: 'Non cambiare' }, { value: 'urgente', label: 'Urgente' },
        { value: 'alta', label: 'Alta' }, { value: 'media', label: 'Media' }, { value: 'bassa', label: 'Bassa' },
      ]},
    ],
  },

  // ═══ COMUNICAZIONI ═══
  {
    id: 'invia_notifica_inapp',
    label: 'Invia notifica in-app',
    description: "Invia una notifica push all'utente nella piattaforma",
    icon: 'Bell',
    categoria: 'comunicazione',
    configSchema: [
      { id: 'user_id', label: 'Destinatario (user_id)', type: 'user_select', required: true, helpText: 'Puoi usare {{opportunita.assigned_to}} per notificare il responsabile' },
      { id: 'titolo', label: 'Titolo notifica', type: 'text', required: true, supportsVariables: true, placeholder: 'Es: Nuovo lead: {{contatto.first_name}} {{contatto.last_name}}' },
      { id: 'testo', label: 'Testo notifica', type: 'textarea', required: false, supportsVariables: true },
      { id: 'link', label: 'URL di destinazione (opzionale)', type: 'text', required: false, supportsVariables: true },
    ],
  },
  {
    id: 'invia_email',
    label: 'Invia email',
    description: "Invia un'email a un indirizzo specifico o variabile",
    icon: 'Mail',
    categoria: 'comunicazione',
    configSchema: [
      { id: 'destinatario', label: 'A (indirizzo email)', type: 'text', required: true, supportsVariables: true, placeholder: '{{contatto.email}}' },
      { id: 'cc', label: 'CC (opzionale)', type: 'text', required: false, supportsVariables: true },
      { id: 'oggetto', label: 'Oggetto', type: 'text', required: true, supportsVariables: true, placeholder: 'Es: Conferma appuntamento - {{appuntamento.appointment_date}}' },
      { id: 'corpo', label: 'Corpo email (HTML supportato)', type: 'textarea', required: true, supportsVariables: true, placeholder: "Gentile {{contatto.first_name}},\n\nLa tua richiesta è stata ricevuta..." },
      { id: 'template', label: 'Oppure usa template salvato', type: 'select', required: false, options: [{ value: '', label: 'Nessun template (usa testo sopra)' }], helpText: 'Se selezioni un template, sovrascrive il corpo sopra' },
    ],
  },
  {
    id: 'invia_whatsapp',
    label: 'Invia messaggio WhatsApp',
    description: 'Invia un messaggio WhatsApp tramite API integrata',
    icon: 'MessageSquare',
    categoria: 'comunicazione',
    configSchema: [
      { id: 'numero', label: 'Numero di telefono', type: 'text', required: true, supportsVariables: true, placeholder: '{{contatto.phone}}' },
      { id: 'messaggio', label: 'Testo messaggio', type: 'textarea', required: true, supportsVariables: true, placeholder: "Ciao {{contatto.first_name}}, ti confermiamo l'appuntamento di..." },
    ],
  },
  {
    // categoria 'piattaforma' → visibile SOLO nel builder admin (le aziende non
    // vedono questa categoria). Coerente col gate engine platform-only.
    id: 'invia_whatsapp_locale',
    label: 'Invia WhatsApp Locale',
    description: 'Invia da un numero WhatsApp non-ufficiale del pool piattaforma (solo marketing/outreach della piattaforma)',
    icon: 'MessageSquare',
    categoria: 'piattaforma',
    configSchema: [
      { id: 'numero', label: 'Numero di telefono', type: 'text', required: true, supportsVariables: true, placeholder: '{{contatto.phone}}' },
      { id: 'messaggio', label: 'Testo messaggio', type: 'textarea', required: true, supportsVariables: true, placeholder: "Ciao {{contatto.first_name}}, ..." },
    ],
  },
  {
    id: 'invia_sms',
    label: 'Invia SMS',
    description: 'Invia un SMS al numero specificato',
    icon: 'MessageSquare',
    categoria: 'comunicazione',
    configSchema: [
      { id: 'numero', label: 'Numero di telefono', type: 'text', required: true, supportsVariables: true, placeholder: '{{contatto.phone}}' },
      { id: 'testo', label: 'Testo SMS (max 160 caratteri)', type: 'textarea', required: true, supportsVariables: true },
    ],
  },
  {
    id: 'chiama_ai',
    label: 'Chiamata AI',
    description: 'Avvia una telefonata con un agente vocale AI al contatto del flusso',
    icon: 'Phone',
    categoria: 'comunicazione',
    configSchema: [
      { id: 'ai_agent_id', label: 'Agente vocale', type: 'entity_select', required: true, helpText: "Seleziona l'agente vocale che effettuerà la chiamata. Richiede un numero Telnyx collegato all'agente nella tab Telefonia." },
    ],
  },

  // ═══ CRM ═══
  {
    id: 'aggiungi_tag',
    label: 'Aggiungi tag a contatto',
    description: 'Aggiunge uno o più tag a un contatto per segmentazione',
    icon: 'Tag',
    categoria: 'crm',
    configSchema: [
      { id: 'contact_id', label: 'ID Contatto', type: 'text', required: true, supportsVariables: true, placeholder: '{{contatto.id}}' },
      { id: 'tags', label: 'Tag da aggiungere', type: 'tag_input', required: true, placeholder: 'cliente_vip, follow_up' },
    ],
  },
  {
    id: 'rimuovi_tag',
    label: 'Rimuovi tag da contatto',
    description: 'Rimuove uno o più tag da un contatto',
    icon: 'Tag',
    categoria: 'crm',
    configSchema: [
      { id: 'contact_id', label: 'ID Contatto', type: 'text', required: true, supportsVariables: true, placeholder: '{{contatto.id}}' },
      { id: 'tags', label: 'Tag da rimuovere', type: 'tag_input', required: true },
    ],
  },
  {
    id: 'crea_opportunita',
    label: 'Crea opportunità',
    description: 'Crea una nuova opportunità/deal nella pipeline',
    icon: 'DollarSign',
    categoria: 'crm',
    outputVariables: [{ id: 'opportunita.id', label: 'ID Opportunità creata', type: 'uuid' }],
    configSchema: [
      // NB: niente campo "ID Contatto" — l'opportunità viene creata SEMPRE sul
      // contatto iscritto al flusso (il motore usa l'entityId dell'enrollment).
      { id: 'nome', label: 'Nome opportunità', type: 'text', required: true, supportsVariables: true, placeholder: 'Es: {{contatto.full_name}} - Facebook' },
      { id: 'valore', label: 'Valore (€)', type: 'text', required: false, supportsVariables: true, placeholder: '{{preventivo.total}}' },
      // Pipeline/fase REALI dell'azienda (prima c'era uno stage hardcoded che
      // non corrispondeva a nessuna pipeline): l'executor legge pipeline_id +
      // stage_id (con fallback legacy su `stage` per i flussi vecchi).
      { id: 'pipeline_id', label: 'Pipeline', type: 'pipeline_select', required: true },
      { id: 'stage_id', label: 'Fase pipeline', type: 'pipeline_stage_select', required: true },
      { id: 'fonte', label: 'Fonte opportunità', type: 'text', required: false, supportsVariables: true, placeholder: 'Es: facebook', helpText: 'Comparirà come Fonte sulla scheda opportunità.' },
      { id: 'assegnato_a', label: 'Venditore', type: 'user_select', required: false },
      { id: 'call_center_id', label: 'Call center (opzionale)', type: 'user_select', required: false },
    ],
  },
  {
    id: 'sposta_opportunita',
    label: 'Sposta opportunità a stage',
    description: 'Cambia lo stage di una opportunità esistente nella pipeline',
    icon: 'BarChart3',
    categoria: 'crm',
    configSchema: [
      { id: 'opportunita_id', label: 'ID Opportunità', type: 'text', required: true, supportsVariables: true, placeholder: '{{opportunita.id}}' },
      { id: 'stage', label: 'Nuovo stage', type: 'select', required: true, options: [
        { value: 'contattato', label: 'Contattato' }, { value: 'appuntamento', label: 'Appuntamento fissato' },
        { value: 'offerta_inviata', label: 'Offerta inviata' }, { value: 'negoziazione', label: 'In negoziazione' },
        { value: 'vinto', label: 'Vinto ✅' }, { value: 'perso', label: 'Perso ❌' },
      ]},
    ],
  },
  {
    id: 'assegna_agente',
    label: 'Assegna responsabile',
    description: 'Assegna un responsabile a un contatto, opportunità o ticket',
    icon: 'UserCheck',
    categoria: 'crm',
    configSchema: [
      { id: 'entity_type', label: 'Tipo entità', type: 'select', required: true, options: [
        { value: 'contacts', label: 'Contatto' }, { value: 'opportunities', label: 'Opportunità' },
        { value: 'tickets', label: 'Ticket' }, { value: 'tasks', label: 'Task' },
      ]},
      { id: 'entity_id', label: 'ID entità', type: 'text', required: true, supportsVariables: true, placeholder: '{{contatto.id}}' },
      { id: 'strategia', label: 'Strategia assegnazione', type: 'select', required: true, options: [
        { value: 'specifico', label: 'Agente specifico' }, { value: 'round_robin', label: 'Round-robin (rotazione)' },
        { value: 'meno_carico', label: 'Meno carico di lavoro' },
      ]},
      { id: 'agente_id', label: 'Agente (se strategia = specifico)', type: 'user_select', required: false },
      { id: 'agenti_ids', label: 'Agenti tra cui distribuire (round-robin / meno carico)', type: 'user_multi_select', required: false, helpText: 'Seleziona 2+ venditori: i nuovi lead verranno distribuiti tra loro a rotazione (round-robin) o assegnati a chi ha meno opportunità aperte (meno carico).' },
    ],
  },
  {
    id: 'aggiorna_campo',
    label: 'Aggiorna campo entità',
    description: 'Aggiorna un campo specifico su qualsiasi entità del sistema',
    icon: 'Edit',
    categoria: 'crm',
    configSchema: [
      { id: 'tabella', label: 'Entità da aggiornare', type: 'select', required: true, options: [
        { value: 'contacts', label: 'Contatto' }, { value: 'opportunities', label: 'Opportunità' },
        { value: 'tickets', label: 'Ticket assistenza' }, { value: 'tasks', label: 'Task' },
        { value: 'orders', label: 'Ordine' }, { value: 'invoices', label: 'Fattura' }, { value: 'estimates', label: 'Preventivo' },
      ]},
      { id: 'entity_id', label: 'ID entità', type: 'text', required: true, supportsVariables: true, placeholder: '{{contatto.id}}' },
      { id: 'campo', label: 'Nome campo DB', type: 'text', required: true, placeholder: 'Es: status, assigned_to, notes' },
      { id: 'valore', label: 'Nuovo valore', type: 'text', required: true, supportsVariables: true },
    ],
  },

  // ═══ OPERATIVO ═══
  {
    id: 'crea_bozza_ordine',
    label: 'Crea bozza ordine',
    description: 'Genera automaticamente una bozza di ordine da preventivo o opportunità vinta',
    icon: 'Package',
    categoria: 'ordini',
    outputVariables: [{ id: 'ordine.id', label: 'ID Ordine bozza', type: 'uuid' }],
    configSchema: [
      { id: 'cliente_id', label: 'ID Cliente', type: 'text', required: true, supportsVariables: true, placeholder: '{{contatto.id}} o {{opportunita.contact_id}}' },
      { id: 'titolo', label: 'Descrizione ordine', type: 'text', required: true, supportsVariables: true, placeholder: 'Es: Ordine da preventivo {{preventivo.quote_number}}' },
      { id: 'importo', label: 'Importo (€)', type: 'text', required: false, supportsVariables: true, placeholder: '{{preventivo.total}}' },
      { id: 'note', label: 'Note interne', type: 'textarea', required: false, supportsVariables: true },
      { id: 'assegnato_a', label: 'Assegna a', type: 'user_select', required: false },
    ],
  },
  {
    id: 'crea_bozza_preventivo',
    label: 'Crea bozza preventivo',
    description: 'Genera automaticamente una bozza di preventivo',
    icon: 'FileText',
    categoria: 'preventivi',
    outputVariables: [{ id: 'preventivo.id', label: 'ID Preventivo bozza', type: 'uuid' }],
    configSchema: [
      { id: 'cliente_id', label: 'ID Cliente', type: 'text', required: true, supportsVariables: true, placeholder: '{{contatto.id}}' },
      { id: 'titolo', label: 'Titolo preventivo', type: 'text', required: true, supportsVariables: true, placeholder: 'Es: Preventivo per {{contatto.company_name}}' },
      { id: 'validita_giorni', label: 'Validità (giorni)', type: 'number', required: false, defaultValue: 30 },
      { id: 'assegnato_a', label: 'Assegna a', type: 'user_select', required: false },
    ],
  },
  {
    id: 'crea_cantiere',
    label: 'Crea cantiere/commessa',
    description: 'Apre automaticamente un nuovo cantiere (es. da preventivo accettato)',
    icon: 'Building2',
    categoria: 'cantieri',
    outputVariables: [{ id: 'cantiere.id', label: 'ID Cantiere creato', type: 'uuid' }],
    configSchema: [
      { id: 'nome', label: 'Nome cantiere', type: 'text', required: true, supportsVariables: true, placeholder: 'Es: Lavori per {{contatto.company_name}}' },
      { id: 'cliente_id', label: 'ID Cliente', type: 'text', required: true, supportsVariables: true, placeholder: '{{contatto.id}}' },
      { id: 'importo', label: 'Importo commessa (€)', type: 'text', required: false, supportsVariables: true, placeholder: '{{preventivo.total}}' },
      { id: 'responsabile_id', label: 'Responsabile', type: 'user_select', required: false },
      { id: 'data_inizio', label: 'Data inizio (giorni da oggi)', type: 'number', required: false, defaultValue: 7 },
    ],
  },
  {
    id: 'crea_appuntamento',
    label: 'Crea appuntamento',
    description: 'Fissa automaticamente un appuntamento nel calendario',
    icon: 'Calendar',
    categoria: 'crm',
    outputVariables: [{ id: 'appuntamento.id', label: 'ID Appuntamento creato', type: 'uuid' }],
    configSchema: [
      { id: 'titolo', label: 'Titolo appuntamento', type: 'text', required: true, supportsVariables: true, placeholder: 'Es: Sopralluogo {{cantiere.nome}}' },
      { id: 'contact_id', label: 'ID Contatto', type: 'text', required: false, supportsVariables: true, placeholder: '{{contatto.id}}' },
      { id: 'giorni_da_oggi', label: 'Fissa tra N giorni da oggi', type: 'number', required: true, defaultValue: 1, min: 0, max: 365 },
      { id: 'orario', label: 'Ora appuntamento', type: 'time', required: false, defaultValue: '10:00' },
      { id: 'tipo', label: 'Tipo', type: 'select', required: false, options: [
        { value: 'sopralluogo', label: 'Sopralluogo' }, { value: 'video_call', label: 'Video call' },
        { value: 'telefonata', label: 'Telefonata' }, { value: 'in_sede', label: 'In sede' },
      ]},
      { id: 'assegnato_a', label: 'Responsabile', type: 'user_select', required: false },
    ],
  },
  {
    id: 'crea_ticket',
    label: 'Crea ticket assistenza',
    description: 'Apre automaticamente un ticket di supporto',
    icon: 'Ticket',
    categoria: 'assistenza',
    outputVariables: [{ id: 'ticket.id', label: 'ID Ticket creato', type: 'uuid' }],
    configSchema: [
      { id: 'oggetto', label: 'Oggetto ticket', type: 'text', required: true, supportsVariables: true },
      { id: 'descrizione', label: 'Descrizione problema', type: 'textarea', required: false, supportsVariables: true },
      { id: 'priorita', label: 'Priorità', type: 'select', required: true, defaultValue: 'media', options: [
        { value: 'urgente', label: 'Urgente' }, { value: 'alta', label: 'Alta' },
        { value: 'media', label: 'Media' }, { value: 'bassa', label: 'Bassa' },
      ]},
      { id: 'cliente_id', label: 'ID Cliente', type: 'text', required: false, supportsVariables: true, placeholder: '{{contatto.id}}' },
      { id: 'assegnato_a', label: 'Assegna a', type: 'user_select', required: false },
    ],
  },
  {
    id: 'crea_fattura',
    label: 'Crea bozza fattura',
    description: 'Genera automaticamente una bozza di fattura (es. da ordine completato)',
    icon: 'Receipt',
    categoria: 'fatturazione',
    outputVariables: [{ id: 'fattura.id', label: 'ID Fattura bozza', type: 'uuid' }],
    configSchema: [
      { id: 'cliente_id', label: 'ID Cliente', type: 'text', required: true, supportsVariables: true },
      { id: 'importo', label: 'Importo (€)', type: 'text', required: true, supportsVariables: true, placeholder: '{{ordine.total_amount}}' },
      { id: 'descrizione', label: 'Descrizione prestazione', type: 'textarea', required: true, supportsVariables: true },
      { id: 'scadenza_giorni', label: 'Giorni alla scadenza', type: 'number', required: false, defaultValue: 30 },
    ],
  },

  // ═══ AI & WEBHOOK ═══
  {
    id: 'esegui_agente_ai',
    label: 'Esegui agente AI',
    description: 'Esegue un agente AI con contesto del trigger per analisi/risposta',
    icon: 'Zap',
    categoria: 'generale',
    configSchema: [
      { id: 'agent_id', label: 'Agente AI', type: 'entity_select', required: true, helpText: "Seleziona l'agente AI da eseguire" },
      { id: 'prompt', label: 'Prompt aggiuntivo (opzionale)', type: 'textarea', required: false, supportsVariables: true, placeholder: 'Analizza il lead {{contatto.first_name}} {{contatto.last_name}} e suggerisci la strategia migliore' },
      // Il motore leggeva già questi campi ma la UI non li esponeva.
      { id: 'ai_tone', label: 'Tono', type: 'select', required: false, options: [
        { value: 'professional', label: 'Professionale' }, { value: 'friendly', label: 'Amichevole' }, { value: 'formal', label: 'Formale' },
      ]},
      { id: 'ai_channel', label: 'Canale di risposta', type: 'select', required: false, options: [
        { value: 'email', label: 'Email' }, { value: 'whatsapp', label: 'WhatsApp' }, { value: 'sms', label: 'SMS' },
      ]},
      { id: 'ai_max_length', label: 'Lunghezza max (caratteri)', type: 'number', required: false, placeholder: '600' },
    ],
  },
  {
    id: 'chiama_webhook',
    label: 'Chiama webhook esterno',
    description: 'Invia una chiamata HTTP a un URL esterno (Zapier, Make, API custom)',
    icon: 'Webhook',
    categoria: 'generale',
    configSchema: [
      { id: 'url', label: 'URL endpoint', type: 'text', required: true, placeholder: 'https://hooks.zapier.com/...' },
      { id: 'metodo', label: 'Metodo HTTP', type: 'select', required: true, defaultValue: 'POST', options: [
        { value: 'POST', label: 'POST' }, { value: 'PUT', label: 'PUT' },
        { value: 'PATCH', label: 'PATCH' }, { value: 'GET', label: 'GET' },
      ]},
      { id: 'headers', label: 'Headers aggiuntivi (JSON)', type: 'json_editor', required: false, placeholder: '{"Authorization": "Bearer token123"}' },
    ],
  },
  {
    id: 'attendi',
    label: 'Attendi (delay)',
    description: 'Mette in pausa il flow per un tempo definito prima del passo successivo',
    icon: 'Clock',
    categoria: 'generale',
    configSchema: [
      { id: 'minuti', label: 'Minuti', type: 'number', required: false, min: 0, max: 59, defaultValue: 0 },
      { id: 'ore', label: 'Ore', type: 'number', required: false, min: 0, max: 23, defaultValue: 0 },
      { id: 'giorni', label: 'Giorni', type: 'number', required: false, min: 0, max: 30, defaultValue: 0 },
    ],
  },
  // FIX B3: spostati da CONDITION_CATALOG → ACTION_CATALOG con categoria 'logica'
  {
    id: 'vai_a',
    label: 'Vai a (Go To)',
    description: 'Salta a un altro punto del flow, collegandosi a un nodo esistente',
    icon: 'ArrowRight',
    categoria: 'logica',
    configSchema: [
      { id: 'target_node_id', label: 'Nodo destinazione', type: 'text', required: true, placeholder: 'ID del nodo destinazione', helpText: 'Seleziona il nodo a cui saltare' },
      { id: 'label', label: 'Etichetta (per il canvas)', type: 'text', required: false, placeholder: 'Es: Torna a inizio' },
    ],
  },
  {
    id: 'end_automation',
    label: 'Termina automazione',
    description: 'Chiude il flusso per questo contatto: i nodi successivi non vengono eseguiti. Utile come uscita esplicita di un ramo.',
    icon: 'CircleStop',
    categoria: 'logica',
    configSchema: [],
  },
  {
    id: 'wait_for_event',
    label: 'Aspetta evento / risposta',
    description: 'Mette in pausa il flusso finché il contatto non compie un\'azione (es. apre l\'email, risponde su WhatsApp) o scade il tempo massimo. Poi il flusso prosegue dal nodo successivo. Es: email → aspetta apertura 3 giorni → WhatsApp di follow-up.',
    icon: 'Hourglass',
    categoria: 'logica',
    configSchema: [
      { id: 'await_event', label: 'Evento da attendere', type: 'select', required: true, options: [
        { value: 'email_opened', label: 'Email aperta' },
        { value: 'email_clicked', label: 'Link email cliccato' },
        { value: 'whatsapp_message_received', label: 'Risposta WhatsApp ricevuta' },
        { value: 'appointment_booked', label: 'Appuntamento prenotato' },
        { value: 'quote_accepted', label: 'Preventivo accettato' },
        { value: 'payment_received', label: 'Pagamento ricevuto' },
        { value: 'opportunity_won', label: 'Opportunità vinta' },
        { value: 'form_submitted', label: 'Form compilato' },
        { value: 'contact_updated', label: 'Contatto aggiornato' },
        { value: 'tag_added', label: 'Tag aggiunto' },
      ]},
      { id: 'timeout_days', label: 'Tempo massimo (giorni)', type: 'number', required: false, defaultValue: 7, helpText: 'Se l\'evento non arriva entro N giorni, il flusso prosegue comunque (o si chiude se non ci sono nodi successivi)' },
    ],
  },
  {
    id: 'drip_sequenza',
    label: 'Sequenza Drip',
    description: 'Invia una serie di messaggi a intervalli programmati (drip campaign)',
    icon: 'Clock',
    categoria: 'logica',
    configSchema: [
      { id: 'intervallo_ore', label: 'Intervallo tra messaggi (ore)', type: 'number', required: true, defaultValue: 24, min: 1, max: 720, helpText: 'Es: 24 = un messaggio al giorno' },
      { id: 'num_messaggi', label: 'Numero totale messaggi', type: 'number', required: true, defaultValue: 3, min: 1, max: 20 },
      { id: 'label', label: 'Nome sequenza', type: 'text', required: false, placeholder: 'Es: Onboarding 7 giorni' },
    ],
  },

  // ═══ PIATTAFORMA (solo area superadmin) ═══
  // Azioni di categoria 'piattaforma': appaiono SOLO nel builder admin
  // (ADMIN_CATEGORY_ORDER include 'piattaforma') e MAI nel builder azienda.
  // L'executor (process-automation) le rifiuta se il contesto non è la
  // platform-admin company. Spostate qui da CONDITION_CATALOG: erano azioni,
  // non condizioni, e finivano per errore nella sezione "Logica" di OGNI builder.
  {
    id: 'invia_email_admin_azienda',
    label: 'Invia email all\'admin azienda',
    description: 'Invia un\'email all\'amministratore dell\'azienda coinvolta nel trigger',
    icon: 'Mail',
    categoria: 'piattaforma',
    configSchema: [
      { id: 'oggetto', label: 'Oggetto email', type: 'text', required: true, supportsVariables: true, placeholder: 'Es: Aggiornamento sul tuo account {{azienda.name}}' },
      { id: 'corpo', label: 'Corpo email', type: 'richhtml', required: true, supportsVariables: true },
      { id: 'mittente_nome', label: 'Nome mittente (opzionale)', type: 'text', required: false, placeholder: 'Es: Team EdiliziaInCloud' },
    ],
  },
  {
    id: 'crea_cs_task',
    label: 'Crea CS task',
    description: 'Crea un task nel pannello Customer Success assegnato a un membro del team',
    icon: 'ClipboardList',
    categoria: 'piattaforma',
    outputVariables: [
      { id: 'cs_task.id', label: 'ID CS Task creato', type: 'uuid' },
    ],
    configSchema: [
      { id: 'titolo', label: 'Titolo task', type: 'text', required: true, supportsVariables: true, placeholder: 'Es: Contattare {{azienda.name}} post-cancellazione' },
      { id: 'descrizione', label: 'Note', type: 'textarea', required: false, supportsVariables: true },
      { id: 'priorita', label: 'Priorità', type: 'select', required: true, defaultValue: 'media', options: [
        { value: 'urgente', label: 'Urgente' }, { value: 'alta', label: 'Alta' },
        { value: 'media', label: 'Media' }, { value: 'bassa', label: 'Bassa' },
      ]},
      { id: 'scadenza_giorni', label: 'Scadenza (giorni dalla creazione)', type: 'number', required: false, min: 0, max: 365 },
    ],
  },
  {
    id: 'cambia_piano_azienda',
    label: 'Cambia piano azienda',
    description: 'Modifica il piano di abbonamento di un\'azienda',
    icon: 'CreditCard',
    categoria: 'piattaforma',
    configSchema: [
      { id: 'nuovo_piano', label: 'Nuovo piano', type: 'text', required: true, placeholder: 'Es: starter, pro, enterprise', supportsVariables: true },
      { id: 'motivo', label: 'Motivo del cambio (log interno)', type: 'text', required: false },
    ],
  },
  {
    id: 'aggiungi_nota_azienda',
    label: 'Aggiungi nota all\'azienda',
    description: 'Aggiunge una nota interna al profilo azienda nel pannello admin',
    icon: 'StickyNote',
    categoria: 'piattaforma',
    configSchema: [
      { id: 'testo', label: 'Testo nota', type: 'textarea', required: true, supportsVariables: true },
    ],
  },
  {
    id: 'invia_notifica_team_admin',
    label: 'Notifica team admin',
    description: 'Invia una notifica interna ai membri del team superadmin',
    icon: 'Bell',
    categoria: 'piattaforma',
    configSchema: [
      { id: 'messaggio', label: 'Messaggio', type: 'text', required: true, supportsVariables: true, placeholder: 'Es: Attenzione: {{azienda.name}} ha cancellato' },
      { id: 'canale', label: 'Canale', type: 'select', required: true, defaultValue: 'in_app', options: [
        { value: 'in_app', label: 'Notifica in-app' },
        { value: 'email', label: 'Email team' },
      ]},
    ],
  },
  {
    id: 'crea_account_azienda',
    label: 'Crea account azienda nel software',
    description: 'Provisioning automatico: crea l\'account azienda, imposta il piano e invia le credenziali di accesso',
    icon: 'Building',
    categoria: 'piattaforma',
    outputVariables: [
      { id: 'nuovo_account.id', label: 'ID Account creato', type: 'uuid' },
      { id: 'nuovo_account.email_admin', label: 'Email admin account', type: 'string' },
    ],
    configSchema: [
      { id: 'piano', label: 'Piano da attivare', type: 'text', required: true, supportsVariables: true, placeholder: 'Es: starter, pro — oppure usa {{opportunita.piano}}' },
      { id: 'trial_giorni', label: 'Giorni di trial iniziale (0 = nessuno)', type: 'number', required: false, defaultValue: 0, min: 0, max: 90 },
      { id: 'invia_credenziali', label: 'Invia email con credenziali di accesso', type: 'select', required: true, defaultValue: 'si', options: [
        { value: 'si', label: 'Sì — invia email automatica' },
        { value: 'no', label: 'No — gestisco manualmente' },
      ]},
    ],
  },
  {
    id: 'invia_fattura',
    label: 'Genera e invia fattura',
    description: 'Crea una fattura per l\'azienda e la invia via email',
    icon: 'FileText',
    categoria: 'piattaforma',
    outputVariables: [
      { id: 'fattura.id', label: 'ID Fattura', type: 'uuid' },
      { id: 'fattura.numero', label: 'Numero fattura', type: 'string' },
    ],
    configSchema: [
      { id: 'descrizione', label: 'Descrizione voce', type: 'text', required: true, supportsVariables: true, placeholder: 'Es: Abbonamento {{opportunita.piano}} — {{azienda.name}}' },
      { id: 'importo', label: 'Importo (€)', type: 'number', required: true, supportsVariables: false, min: 0 },
      { id: 'scadenza_giorni', label: 'Scadenza pagamento (giorni)', type: 'number', required: true, defaultValue: 30, min: 0, max: 365 },
      { id: 'invia_email', label: 'Invia fattura via email al cliente', type: 'select', required: true, defaultValue: 'si', options: [
        { value: 'si', label: 'Sì' }, { value: 'no', label: 'No (solo genera)' },
      ]},
    ],
  },
  {
    id: 'attiva_onboarding',
    label: 'Avvia sequenza di onboarding',
    description: 'Iscrive il nuovo cliente a una sequenza di onboarding (email + task)',
    icon: 'Rocket',
    categoria: 'piattaforma',
    configSchema: [
      { id: 'sequenza', label: 'Sequenza onboarding', type: 'select', required: true, defaultValue: 'standard', options: [
        { value: 'standard', label: 'Onboarding standard (7 giorni)' },
        { value: 'rapido', label: 'Onboarding rapido (3 giorni)' },
        { value: 'enterprise', label: 'Onboarding enterprise (30 giorni)' },
      ]},
      { id: 'assegna_cs', label: 'Assegna Customer Success', type: 'user_select', required: false, helpText: 'Il CS sarà responsabile del follow-up' },
    ],
  },
];

// ─── CONDITION CATALOG ───────────────────────────────────────────────────────

export const CONDITION_CATALOG: ConditionDefinition[] = [
  {
    id: 'condition_se',
    label: 'SE condizione',
    description: 'Biforca il flow: esegue ramo "Sì" o "No" in base a una condizione',
    icon: 'GitBranch',
    configSchema: [
      { id: 'variabile', label: 'Variabile da controllare', type: 'text', required: true, supportsVariables: true, placeholder: '{{opportunita.value}}', helpText: 'Seleziona una variabile disponibile dagli step precedenti' },
      { id: 'operatore', label: 'Operatore', type: 'select', required: true, options: [
        { value: 'uguale', label: '= uguale a' }, { value: 'diverso', label: '≠ diverso da' },
        { value: 'contiene', label: 'contiene' }, { value: 'non_contiene', label: 'non contiene' },
        { value: 'maggiore', label: '> maggiore di' }, { value: 'minore', label: '< minore di' },
        { value: 'maggiore_uguale', label: '≥ maggiore o uguale a' }, { value: 'minore_uguale', label: '≤ minore o uguale a' },
        { value: 'vuoto', label: 'è vuoto' }, { value: 'non_vuoto', label: 'non è vuoto' },
        { value: 'inizia_con', label: 'inizia con' }, { value: 'finisce_con', label: 'finisce con' },
      ]},
      { id: 'valore', label: 'Valore di confronto', type: 'text', required: false, supportsVariables: true, placeholder: 'Es: 5000', helpText: 'Non necessario per "è vuoto" / "non è vuoto"' },
      { id: 'label', label: 'Etichetta condizione (per il canvas)', type: 'text', required: false, placeholder: 'Es: Valore > 5000€', helpText: 'Testo mostrato sul nodo nel canvas' },
    ],
  },
  {
    id: 'condition_multi',
    label: 'SE condizioni multiple (AND/OR)',
    description: 'Valuta più condizioni contemporaneamente con operatore AND o OR',
    icon: 'GitBranch',
    configSchema: [
      { id: 'operatore_logico', label: 'Tipo di combinazione', type: 'select', required: true, defaultValue: 'AND', options: [
        { value: 'AND', label: 'AND — tutte le condizioni devono essere vere' },
        { value: 'OR', label: 'OR — almeno una condizione deve essere vera' },
      ]},
      { id: 'condizioni', label: 'Condizioni (JSON array)', type: 'json_editor', required: true, placeholder: '[{"variabile":"{{opportunita.value}}","operatore":"maggiore","valore":"5000"}]', helpText: 'Ogni condizione: { variabile, operatore, valore }' },
    ],
  },
  {
    id: 'goal',
    label: 'Obiettivo (Goal)',
    description: 'Termina il ramo quando una condizione obiettivo viene raggiunta (es: il contatto ha comprato)',
    icon: 'Target',
    configSchema: [
      { id: 'variabile', label: 'Variabile obiettivo', type: 'text', required: true, supportsVariables: true, placeholder: '{{opportunita.status}}' },
      { id: 'operatore', label: 'Operatore', type: 'select', required: true, options: [
        { value: 'uguale', label: '= uguale a' }, { value: 'diverso', label: '≠ diverso da' },
        { value: 'non_vuoto', label: 'non è vuoto' }, { value: 'maggiore', label: '> maggiore di' },
      ]},
      { id: 'valore', label: 'Valore atteso', type: 'text', required: false, supportsVariables: true, placeholder: 'Es: vinto' },
      { id: 'label', label: 'Etichetta (per il canvas)', type: 'text', required: false, placeholder: 'Es: Ha comprato' },
    ],
  },
  {
    id: 'split_ab',
    label: 'Split A/B',
    description: 'Divide il traffico in 2 o più rami con percentuali configurabili per test A/B',
    icon: 'Shuffle',
    configSchema: [
      { id: 'rami', label: 'Numero di rami', type: 'number', required: true, defaultValue: 2, min: 2, max: 5 },
      { id: 'percentuali', label: 'Percentuali (es: 50,50 o 33,33,34)', type: 'text', required: true, defaultValue: '50,50', placeholder: '50,50', helpText: 'La somma deve essere 100%' },
      { id: 'label', label: 'Etichetta split', type: 'text', required: false, placeholder: 'Es: Test email' },
    ],
  },
  // NOTE: vai_a e drip_sequenza sono stati spostati in ACTION_CATALOG (FIX B3)

  // NB: le azioni di categoria 'piattaforma' (invia_email_admin_azienda,
  // crea_cs_task, cambia_piano_azienda, aggiungi_nota_azienda,
  // invia_notifica_team_admin, crea_account_azienda, invia_fattura,
  // attiva_onboarding) sono state spostate in ACTION_CATALOG: sono AZIONI,
  // non condizioni. Restando qui finivano nella sezione "Logica" di OGNI
  // builder (anche azienda) — leak di separazione ora chiuso.
];

// ─── Helper maps ─────────────────────────────────────────────────────────────

export const TRIGGER_MAP: Record<string, TriggerDefinition> =
  Object.fromEntries(TRIGGER_CATALOG.map(t => [t.id, t]));

export const ACTION_MAP: Record<string, ActionDefinition> =
  Object.fromEntries(ACTION_CATALOG.map(a => [a.id, a]));

export const TRIGGERS_BY_CATEGORY = TRIGGER_CATALOG.reduce((acc, t) => {
  if (!acc[t.categoria]) acc[t.categoria] = [];
  acc[t.categoria].push(t);
  return acc;
}, {} as Record<string, TriggerDefinition[]>);

export const ACTIONS_BY_CATEGORY = ACTION_CATALOG.reduce((acc, a) => {
  if (!acc[a.categoria]) acc[a.categoria] = [];
  acc[a.categoria].push(a);
  return acc;
}, {} as Record<string, ActionDefinition[]>);

// ─── Backward-compatible bridge ─────────────────────────────────────────────

export type FlowNodeKind = "trigger" | "action" | "condition" | "delay" | "goal" | "split" | "note" | "end";

export interface CatalogItem {
  id: string;
  label: string;
  description?: string;
  icon: string;
  category: string;
  categoryLabel: string;
  kind: FlowNodeKind;
  configSchema?: ConfigFieldSchema[];
  outputVariables?: VariableDefinition[];
}

const CATEGORY_LABELS: Record<string, string> = {
  crm: 'CRM & Vendite',
  marketing: 'Marketing',
  ordini: 'Ordini',
  fatturazione: 'Fatturazione',
  preventivi: 'Preventivi',
  assistenza: 'Assistenza',
  magazzino: 'Magazzino',
  hr: 'HR & Personale',
  cantieri: 'Cantieri',
  task: 'Task & Attività',
  comunicazione: 'Comunicazione',
  generale: 'Generale',
  piattaforma: 'Piattaforma',
  utility: 'Utilità',
};

function triggerToCatalogItem(t: TriggerDefinition): CatalogItem {
  return {
    id: t.id,
    label: t.label,
    description: t.description,
    icon: t.icon,
    category: t.categoria,
    categoryLabel: CATEGORY_LABELS[t.categoria] ?? t.categoria,
    kind: 'trigger',
    configSchema: t.configSchema,
    outputVariables: t.outputVariables,
  };
}

function actionKind(id: string): FlowNodeKind {
  if (id === 'condition_se' || id === 'condition_multi') return 'condition';
  if (id === 'attendi') return 'delay';
  if (id === 'goal') return 'goal';
  if (id === 'split_ab') return 'split';
  return 'action';
}

function actionToCatalogItem(a: ActionDefinition): CatalogItem {
  return {
    id: a.id,
    label: a.label,
    description: a.description,
    icon: a.icon,
    category: a.categoria,
    categoryLabel: CATEGORY_LABELS[a.categoria] ?? a.categoria,
    kind: actionKind(a.id),
    configSchema: a.configSchema,
    outputVariables: a.outputVariables,
  };
}

function conditionToCatalogItem(c: ConditionDefinition): CatalogItem {
  const kindMap: Record<string, FlowNodeKind> = {
    goal: 'goal',
    split_ab: 'split',
    vai_a: 'action',
    drip_sequenza: 'action',
  };
  return {
    id: c.id,
    label: c.label,
    description: c.description,
    icon: c.icon,
    category: 'logica',
    categoryLabel: 'Logica & Flusso',
    kind: kindMap[c.id] ?? 'condition',
    configSchema: c.configSchema,
  };
}

// Bridge arrays
const TRIGGER_CATALOG_ITEMS: CatalogItem[] = TRIGGER_CATALOG.map(triggerToCatalogItem);
const ACTION_CATALOG_ITEMS: CatalogItem[] = ACTION_CATALOG.map(actionToCatalogItem);
const CONDITION_CATALOG_ITEMS: CatalogItem[] = CONDITION_CATALOG.map(conditionToCatalogItem);

export const NOTE_CATALOG_ITEM: CatalogItem = {
  id: "note",
  label: "Nota",
  description: "Aggiungi una nota visiva al canvas",
  icon: "StickyNote",
  category: "utility",
  categoryLabel: "Utilità",
  kind: "note",
};

export const FULL_CATALOG: CatalogItem[] = [
  ...TRIGGER_CATALOG_ITEMS,
  ...ACTION_CATALOG_ITEMS,
  ...CONDITION_CATALOG_ITEMS,
];

export function getCatalogItem(itemId: string): CatalogItem | undefined {
  if (itemId === "note") return NOTE_CATALOG_ITEM;
  return FULL_CATALOG.find((c) => c.id === itemId);
}

// ── Node kind colors (semantic) ──

export const NODE_KIND_STYLES: Record<FlowNodeKind, { bg: string; border: string; accent: string; label: string }> = {
  trigger: { bg: "bg-emerald-50 dark:bg-emerald-950/40", border: "border-emerald-400", accent: "text-emerald-600", label: "Trigger" },
  action: { bg: "bg-indigo-50 dark:bg-indigo-950/40", border: "border-indigo-400", accent: "text-indigo-600", label: "Azione" },
  condition: { bg: "bg-amber-50 dark:bg-amber-950/40", border: "border-amber-400", accent: "text-amber-600", label: "Condizione" },
  delay: { bg: "bg-sky-50 dark:bg-sky-950/40", border: "border-sky-400", accent: "text-sky-600", label: "Attesa" },
  goal: { bg: "bg-green-50 dark:bg-green-950/40", border: "border-green-500", accent: "text-green-600", label: "Obiettivo" },
  split: { bg: "bg-teal-50 dark:bg-teal-950/40", border: "border-teal-400", accent: "text-teal-600", label: "Split" },
  note: { bg: "bg-yellow-50 dark:bg-yellow-950/40", border: "border-yellow-300", accent: "text-yellow-700", label: "Nota" },
  end: { bg: "bg-muted", border: "border-border", accent: "text-muted-foreground", label: "Fine" },
};

// Re-export bridge arrays for sidebar use
export { TRIGGER_CATALOG_ITEMS, ACTION_CATALOG_ITEMS, CONDITION_CATALOG_ITEMS };
