// src/lib/flow-templates.ts
// 35 template di automazione cross-domain definiti in-code.
// ALL variables aligned to real DB column names.

export interface FlowTemplateNode {
  id: string;
  nodeType: 'trigger' | 'action' | 'condition' | 'delay';
  posX: number;
  posY: number;
  configJson: Record<string, unknown>;
  label: string;
}

export interface FlowTemplateConnection {
  fromId: string;
  toId: string;
  label?: string;
}

export interface FlowTemplate {
  id: string;
  nome: string;
  categoria: string;
  descrizione: string;
  icona: string;
  difficolta: 'base' | 'intermedio' | 'avanzato';
  triggerTipo: string;
  nodes: FlowTemplateNode[];
  connections: FlowTemplateConnection[];
  /** True SOLO se il template è completo così com'è (nessun campo da scegliere,
   *  es. agente/pipeline): la galleria mostra "Attiva subito" che lo pubblica
   *  direttamente senza passare dal builder. */
  prontoAllUso?: boolean;
}

// ════════════════════════════════════════════════════════════════
// CRM & VENDITE (T01–T07)
// ════════════════════════════════════════════════════════════════

const T01: FlowTemplate = {
  id: 't01-lead-facebook',
  nome: 'Lead Facebook → Contatta subito',
  categoria: 'crm',
  descrizione: 'Quando arriva un lead da campagna Facebook: assegna il contatto al primo agente disponibile, crea un task di chiamata urgente e invia notifica al team.',
  icona: '📘',
  difficolta: 'base',
  triggerTipo: 'campagna_facebook_lead',
  nodes: [
    { id: 'trigger-1', nodeType: 'trigger', posX: 250, posY: 50, configJson: { trigger_type: 'campagna_facebook_lead' }, label: 'Lead Facebook' },
    { id: 'action-1', nodeType: 'action', posX: 250, posY: 200, configJson: { action_type: 'assegna_agente', entity_type: 'contacts', entity_id: '{{contatto.id}}', strategia: 'round_robin' }, label: 'Assegna agente' },
    { id: 'action-2', nodeType: 'action', posX: 250, posY: 350, configJson: { action_type: 'crea_task', titolo: '🔥 URGENTE: Chiama {{contatto.first_name}} {{contatto.last_name}} entro 5 min', priorita: 'urgente', scadenza_giorni: 0, note: 'Lead da campagna: {{campagna.nome}}' }, label: 'Crea task urgente' },
    { id: 'action-3', nodeType: 'action', posX: 250, posY: 500, configJson: { action_type: 'invia_notifica_inapp', titolo: 'Nuovo lead Facebook: {{contatto.first_name}} {{contatto.last_name}}', testo: '📞 {{contatto.phone}} | Campagna: {{campagna.nome}}' }, label: 'Notifica team' },
  ],
  connections: [
    { fromId: 'trigger-1', toId: 'action-1' },
    { fromId: 'action-1', toId: 'action-2' },
    { fromId: 'action-2', toId: 'action-3' },
  ],
};

const T02: FlowTemplate = {
  id: 't02-nuovo-contatto',
  nome: 'Nuovo contatto → Benvenuto + Follow-up',
  categoria: 'crm',
  descrizione: 'Alla creazione di qualsiasi nuovo contatto: invia email di benvenuto personalizzata e crea task di follow-up per l\'agente assegnato.',
  icona: '👤',
  difficolta: 'base',
  prontoAllUso: true,
  triggerTipo: 'contatto_creato',
  nodes: [
    { id: 'trigger-1', nodeType: 'trigger', posX: 250, posY: 50, configJson: { trigger_type: 'contatto_creato' }, label: 'Nuovo contatto' },
    { id: 'action-1', nodeType: 'action', posX: 100, posY: 200, configJson: { action_type: 'invia_email', destinatario: '{{contatto.email}}', oggetto: 'Benvenuto! Abbiamo ricevuto la tua richiesta', corpo: 'Gentile {{contatto.first_name}},\n\nGrazie per averci contattato. Un nostro consulente ti risponderà a breve.\n\nCordiali saluti' }, label: 'Email benvenuto' },
    { id: 'action-2', nodeType: 'action', posX: 400, posY: 200, configJson: { action_type: 'crea_task', titolo: 'Follow-up: {{contatto.first_name}} {{contatto.last_name}} ({{contatto.email}})', priorita: 'alta', scadenza_giorni: 1 }, label: 'Task follow-up' },
  ],
  connections: [
    { fromId: 'trigger-1', toId: 'action-1' },
    { fromId: 'trigger-1', toId: 'action-2' },
  ],
};

const T03: FlowTemplate = {
  id: 't03-deal-vinto',
  nome: 'Deal Vinto → Pipeline post-vendita completa',
  categoria: 'crm',
  descrizione: 'Il workflow post-vendita definitivo: opportunità vinta → crea bozza ordine, apre cantiere/commessa, task onboarding cliente e notifica tutto il team.',
  icona: '🏆',
  difficolta: 'avanzato',
  triggerTipo: 'opportunita_vinta',
  nodes: [
    { id: 'trigger-1', nodeType: 'trigger', posX: 250, posY: 50, configJson: { trigger_type: 'opportunita_vinta' }, label: 'Deal Vinto' },
    { id: 'action-1', nodeType: 'action', posX: 100, posY: 200, configJson: { action_type: 'crea_bozza_ordine', cliente_id: '{{opportunita.contact_id}}', titolo: 'Ordine da deal: {{opportunita.name}}', importo: '{{opportunita.value}}' }, label: 'Crea ordine' },
    { id: 'action-2', nodeType: 'action', posX: 400, posY: 200, configJson: { action_type: 'crea_cantiere', nome: 'Commessa: {{opportunita.name}}', cliente_id: '{{opportunita.contact_id}}', importo: '{{opportunita.value}}' }, label: 'Apri cantiere' },
    { id: 'action-3', nodeType: 'action', posX: 250, posY: 380, configJson: { action_type: 'crea_task', titolo: 'Onboarding cliente per deal: {{opportunita.name}}', priorita: 'alta', scadenza_giorni: 2, note: 'Valore deal: €{{opportunita.value}}' }, label: 'Task onboarding' },
    { id: 'action-4', nodeType: 'action', posX: 250, posY: 530, configJson: { action_type: 'invia_notifica_inapp', titolo: '🏆 Deal Vinto: {{opportunita.name}}', testo: 'Valore: €{{opportunita.value}}' }, label: 'Notifica team' },
  ],
  connections: [
    { fromId: 'trigger-1', toId: 'action-1' },
    { fromId: 'trigger-1', toId: 'action-2' },
    { fromId: 'action-1', toId: 'action-3' },
    { fromId: 'action-3', toId: 'action-4' },
  ],
};

const T04: FlowTemplate = {
  id: 't04-deal-perso',
  nome: 'Deal Perso → Recupero automatico 30 giorni',
  categoria: 'crm',
  descrizione: 'Quando un\'opportunità viene persa: crea task di analisi, aspetta 30 giorni e invia email di ricontatto per tentare il recupero.',
  icona: '❌',
  difficolta: 'intermedio',
  triggerTipo: 'opportunita_persa',
  nodes: [
    { id: 'trigger-1', nodeType: 'trigger', posX: 250, posY: 50, configJson: { trigger_type: 'opportunita_persa' }, label: 'Deal Perso' },
    { id: 'action-1', nodeType: 'action', posX: 250, posY: 200, configJson: { action_type: 'crea_task', titolo: 'Analisi perdita deal: {{opportunita.name}} | Motivo: {{opportunita.loss_reason}}', priorita: 'media', scadenza_giorni: 3 }, label: 'Task analisi' },
    { id: 'delay-1', nodeType: 'delay', posX: 250, posY: 350, configJson: { delay_type: 'attendi', giorni: 30 }, label: 'Attendi 30 giorni' },
    { id: 'action-2', nodeType: 'action', posX: 250, posY: 500, configJson: { action_type: 'invia_email', destinatario: '{{contatto.email}}', oggetto: 'Come possiamo migliorare per te?', corpo: 'Gentile {{contatto.first_name}},\n\nSappiamo che hai scelto una soluzione diversa. Siamo costantemente al lavoro per migliorare.\n\nSarebbe disponibile per una breve chiamata di feedback?\n\nCordiali saluti' }, label: 'Email ricontatto' },
  ],
  connections: [
    { fromId: 'trigger-1', toId: 'action-1' },
    { fromId: 'action-1', toId: 'delay-1' },
    { fromId: 'delay-1', toId: 'action-2' },
  ],
};

const T05: FlowTemplate = {
  id: 't05-contatto-assegnato',
  nome: 'Contatto assegnato → Notifica agente + Task',
  categoria: 'crm',
  descrizione: 'Quando un contatto viene assegnato a un agente: notifica l\'agente e crea task di prima presa in carico.',
  icona: '👋',
  difficolta: 'base',
  triggerTipo: 'contatto_assegnato',
  nodes: [
    { id: 'trigger-1', nodeType: 'trigger', posX: 250, posY: 50, configJson: { trigger_type: 'contatto_assegnato' }, label: 'Contatto assegnato' },
    { id: 'action-1', nodeType: 'action', posX: 250, posY: 200, configJson: { action_type: 'invia_notifica_inapp', titolo: 'Nuovo contatto assegnato: {{contatto.first_name}} {{contatto.last_name}}', testo: '📧 {{contatto.email}} | 📞 {{contatto.phone}}' }, label: 'Notifica agente' },
    { id: 'action-2', nodeType: 'action', posX: 250, posY: 380, configJson: { action_type: 'crea_task', titolo: 'Prima presa in carico: {{contatto.first_name}} {{contatto.last_name}}', priorita: 'alta', scadenza_giorni: 1 }, label: 'Task presa in carico' },
  ],
  connections: [
    { fromId: 'trigger-1', toId: 'action-1' },
    { fromId: 'action-1', toId: 'action-2' },
  ],
};

const T06: FlowTemplate = {
  id: 't06-appuntamento-confermato',
  nome: 'Appuntamento confermato → Reminder automatico',
  categoria: 'crm',
  descrizione: 'Quando un appuntamento viene confermato: invia reminder WhatsApp al cliente e crea task di preparazione per l\'agente.',
  icona: '📅',
  difficolta: 'base',
  triggerTipo: 'appuntamento_confermato',
  nodes: [
    { id: 'trigger-1', nodeType: 'trigger', posX: 250, posY: 50, configJson: { trigger_type: 'appuntamento_confermato' }, label: 'Appuntamento confermato' },
    { id: 'action-1', nodeType: 'action', posX: 100, posY: 200, configJson: { action_type: 'invia_whatsapp', numero: '{{contatto.phone}}', messaggio: 'Ciao {{contatto.first_name}}! Ti ricordiamo l\'appuntamento del {{appuntamento.appointment_date}} alle {{appuntamento.appointment_time}}.' }, label: 'WhatsApp reminder' },
    { id: 'action-2', nodeType: 'action', posX: 400, posY: 200, configJson: { action_type: 'crea_task', titolo: 'Prepara materiali per: {{appuntamento.title}}', priorita: 'alta', scadenza_giorni: 0 }, label: 'Task preparazione' },
  ],
  connections: [
    { fromId: 'trigger-1', toId: 'action-1' },
    { fromId: 'trigger-1', toId: 'action-2' },
  ],
};

const T07: FlowTemplate = {
  id: 't07-no-show',
  nome: 'No-show → Ricontatto e nuovo appuntamento',
  categoria: 'crm',
  descrizione: 'Quando un cliente non si presenta: SMS di ricontatto immediato e task urgente per fissare un nuovo appuntamento.',
  icona: '🚫',
  difficolta: 'base',
  triggerTipo: 'appuntamento_no_show',
  nodes: [
    { id: 'trigger-1', nodeType: 'trigger', posX: 250, posY: 50, configJson: { trigger_type: 'appuntamento_no_show' }, label: 'No-show appuntamento' },
    { id: 'action-1', nodeType: 'action', posX: 100, posY: 200, configJson: { action_type: 'invia_sms', numero: '{{contatto.phone}}', testo: 'Ciao {{contatto.first_name}}, ci siamo persi! Chiamaci o rispondi per fissare un nuovo appuntamento.' }, label: 'SMS ricontatto' },
    { id: 'action-2', nodeType: 'action', posX: 400, posY: 200, configJson: { action_type: 'crea_task', titolo: 'No-show: ricontatta {{contatto.first_name}} {{contatto.last_name}} per nuovo slot', priorita: 'alta', scadenza_giorni: 0 }, label: 'Task nuovo slot' },
  ],
  connections: [
    { fromId: 'trigger-1', toId: 'action-1' },
    { fromId: 'trigger-1', toId: 'action-2' },
  ],
};

// ════════════════════════════════════════════════════════════════
// PREVENTIVI (T08–T10)
// ════════════════════════════════════════════════════════════════

const T08: FlowTemplate = {
  id: 't08-preventivo-accettato',
  nome: 'Preventivo Accettato → Pipeline completa',
  categoria: 'preventivi',
  descrizione: 'Il workflow più importante: preventivo accettato → crea ordine, apre cantiere, prepara bozza fattura ed email di conferma al cliente.',
  icona: '✅',
  difficolta: 'avanzato',
  triggerTipo: 'preventivo_accettato',
  nodes: [
    { id: 'trigger-1', nodeType: 'trigger', posX: 250, posY: 50, configJson: { trigger_type: 'preventivo_accettato' }, label: 'Preventivo accettato' },
    { id: 'action-1', nodeType: 'action', posX: 100, posY: 200, configJson: { action_type: 'crea_bozza_ordine', cliente_id: '{{preventivo.contact_id}}', titolo: 'Ordine da prev. {{preventivo.quote_number}}', importo: '{{preventivo.total}}' }, label: 'Crea ordine' },
    { id: 'action-2', nodeType: 'action', posX: 400, posY: 200, configJson: { action_type: 'crea_cantiere', nome: 'Commessa {{preventivo.quote_number}}', cliente_id: '{{preventivo.contact_id}}', importo: '{{preventivo.total}}' }, label: 'Apri cantiere' },
    { id: 'action-3', nodeType: 'action', posX: 100, posY: 380, configJson: { action_type: 'crea_fattura', cliente_id: '{{preventivo.contact_id}}', importo: '{{preventivo.total}}', descrizione: 'Fattura per preventivo {{preventivo.quote_number}}', scadenza_giorni: 30 }, label: 'Crea fattura' },
    { id: 'action-4', nodeType: 'action', posX: 400, posY: 380, configJson: { action_type: 'invia_email', destinatario: '{{preventivo.client_email}}', oggetto: 'Preventivo {{preventivo.quote_number}} confermato — Grazie!', corpo: 'Gentile {{preventivo.client_name}},\n\nAbbiamo ricevuto la conferma del preventivo {{preventivo.quote_number}} per €{{preventivo.total}}.\nSaremo presto in contatto per i dettagli operativi.\n\nCordiali saluti' }, label: 'Email conferma' },
  ],
  connections: [
    { fromId: 'trigger-1', toId: 'action-1' },
    { fromId: 'trigger-1', toId: 'action-2' },
    { fromId: 'action-1', toId: 'action-3' },
    { fromId: 'action-2', toId: 'action-4' },
  ],
};

const T09: FlowTemplate = {
  id: 't09-preventivo-scadenza',
  nome: 'Preventivo in scadenza → Follow-up cliente',
  categoria: 'preventivi',
  descrizione: '3 giorni prima della scadenza di un preventivo senza risposta: invia email di promemoria al cliente e crea task per l\'agente.',
  icona: '⏳',
  difficolta: 'base',
  triggerTipo: 'preventivo_in_scadenza',
  nodes: [
    { id: 'trigger-1', nodeType: 'trigger', posX: 250, posY: 50, configJson: { trigger_type: 'preventivo_in_scadenza', giorni_prima: 3 }, label: 'Preventivo in scadenza' },
    { id: 'action-1', nodeType: 'action', posX: 100, posY: 200, configJson: { action_type: 'invia_email', destinatario: '{{preventivo.client_email}}', oggetto: 'Il tuo preventivo scade tra 3 giorni', corpo: 'Gentile {{preventivo.client_name}},\n\nTi ricordiamo che il preventivo {{preventivo.quote_number}} per €{{preventivo.total}} scade tra 3 giorni.\n\nSiamo a disposizione per qualsiasi chiarimento.\n\nCordiali saluti' }, label: 'Email promemoria' },
    { id: 'action-2', nodeType: 'action', posX: 400, posY: 200, configJson: { action_type: 'crea_task', titolo: 'Follow-up preventivo {{preventivo.quote_number}} in scadenza — {{preventivo.client_name}}', priorita: 'alta', scadenza_giorni: 1 }, label: 'Task follow-up' },
  ],
  connections: [
    { fromId: 'trigger-1', toId: 'action-1' },
    { fromId: 'trigger-1', toId: 'action-2' },
  ],
};

const T10: FlowTemplate = {
  id: 't10-preventivo-rifiutato',
  nome: 'Preventivo rifiutato → Analisi e ricontatto',
  categoria: 'preventivi',
  descrizione: 'Quando un preventivo viene rifiutato: task di analisi motivazioni e follow-up personalizzato per capire come migliorare l\'offerta.',
  icona: '🔁',
  difficolta: 'intermedio',
  triggerTipo: 'preventivo_rifiutato',
  nodes: [
    { id: 'trigger-1', nodeType: 'trigger', posX: 250, posY: 50, configJson: { trigger_type: 'preventivo_rifiutato' }, label: 'Preventivo rifiutato' },
    { id: 'action-1', nodeType: 'action', posX: 250, posY: 200, configJson: { action_type: 'crea_task', titolo: 'Analizza rifiuto prev. {{preventivo.quote_number}} — {{preventivo.client_name}}', priorita: 'media', scadenza_giorni: 2 }, label: 'Task analisi' },
    { id: 'delay-1', nodeType: 'delay', posX: 250, posY: 350, configJson: { delay_type: 'attendi', giorni: 7 }, label: 'Attendi 7 giorni' },
    { id: 'action-2', nodeType: 'action', posX: 250, posY: 500, configJson: { action_type: 'invia_email', destinatario: '{{preventivo.client_email}}', oggetto: 'Possiamo rivedere l\'offerta insieme?', corpo: 'Gentile {{preventivo.client_name}},\n\nSappiamo che il nostro preventivo {{preventivo.quote_number}} non era quello che cercavi.\nSaremmo felici di rivedere l\'offerta in base alle tue esigenze.\n\nSarebbe disponibile per una chiamata?\n\nCordiali saluti' }, label: 'Email ricontatto' },
  ],
  connections: [
    { fromId: 'trigger-1', toId: 'action-1' },
    { fromId: 'action-1', toId: 'delay-1' },
    { fromId: 'delay-1', toId: 'action-2' },
  ],
};

// ════════════════════════════════════════════════════════════════
// FATTURAZIONE & INCASSI (T11–T13)
// ════════════════════════════════════════════════════════════════

const T11: FlowTemplate = {
  id: 't11-fattura-scaduta-sollecito',
  nome: 'Fattura scaduta → Sollecito automatico 3 livelli',
  categoria: 'fatturazione',
  descrizione: 'Sollecito progressivo: email cortese al giorno 3, SMS al giorno 7, task urgente recupero crediti al giorno 15 dalla scadenza.',
  icona: '⏰',
  difficolta: 'avanzato',
  triggerTipo: 'fattura_scaduta',
  nodes: [
    { id: 'trigger-1', nodeType: 'trigger', posX: 250, posY: 50, configJson: { trigger_type: 'fattura_scaduta', giorni_dopo_scadenza: 3 }, label: 'Fattura scaduta' },
    { id: 'action-1', nodeType: 'action', posX: 250, posY: 200, configJson: { action_type: 'invia_email', destinatario: '{{fattura.client_email}}', oggetto: 'Promemoria: Fattura {{fattura.invoice_number}} — gentile sollecito', corpo: 'Gentile {{fattura.client_company_name}},\n\nVorremmo ricordarle che la fattura {{fattura.invoice_number}} per €{{fattura.total}} risulta scaduta.\n\nSe ha già provveduto al pagamento, la preghiamo di ignorare questo messaggio.\n\nGrazie per la collaborazione.' }, label: 'Email sollecito 1' },
    { id: 'delay-1', nodeType: 'delay', posX: 250, posY: 350, configJson: { delay_type: 'attendi', giorni: 4 }, label: 'Attendi 4 giorni' },
    { id: 'action-2', nodeType: 'action', posX: 250, posY: 500, configJson: { action_type: 'invia_sms', numero: '{{contatto.phone}}', testo: 'Gentile cliente, la fattura {{fattura.invoice_number}} (€{{fattura.total}}) è ancora in sospeso. Contattarci per regolarizzare.' }, label: 'SMS sollecito 2' },
    { id: 'delay-2', nodeType: 'delay', posX: 250, posY: 650, configJson: { delay_type: 'attendi', giorni: 8 }, label: 'Attendi 8 giorni' },
    { id: 'action-3', nodeType: 'action', posX: 250, posY: 800, configJson: { action_type: 'crea_task', titolo: '🚨 RECUPERO CREDITI: {{fattura.client_company_name}} — FAT {{fattura.invoice_number}} (€{{fattura.total}})', priorita: 'urgente', scadenza_giorni: 0 }, label: 'Task recupero crediti' },
  ],
  connections: [
    { fromId: 'trigger-1', toId: 'action-1' },
    { fromId: 'action-1', toId: 'delay-1' },
    { fromId: 'delay-1', toId: 'action-2' },
    { fromId: 'action-2', toId: 'delay-2' },
    { fromId: 'delay-2', toId: 'action-3' },
  ],
};

const T12: FlowTemplate = {
  id: 't12-pagamento-ricevuto',
  nome: 'Pagamento ricevuto → Conferma e chiudi',
  categoria: 'fatturazione',
  descrizione: 'Quando viene registrato un pagamento: invia email di ringraziamento al cliente e notifica il team commerciale.',
  icona: '💵',
  difficolta: 'base',
  triggerTipo: 'pagamento_ricevuto',
  nodes: [
    { id: 'trigger-1', nodeType: 'trigger', posX: 250, posY: 50, configJson: { trigger_type: 'pagamento_ricevuto' }, label: 'Pagamento ricevuto' },
    { id: 'action-1', nodeType: 'action', posX: 100, posY: 200, configJson: { action_type: 'invia_email', destinatario: '{{contatto.email}}', oggetto: 'Pagamento ricevuto — Grazie!', corpo: 'Gentile cliente,\n\nConfermiamo la ricezione del pagamento di €{{pagamento.importo}} del {{pagamento.data}}.\n\nGrazie per la puntualità!' }, label: 'Email conferma' },
    { id: 'action-2', nodeType: 'action', posX: 400, posY: 200, configJson: { action_type: 'invia_notifica_inapp', titolo: '💵 Pagamento ricevuto: €{{pagamento.importo}}', testo: 'Fattura ID: {{pagamento.fattura_id}}' }, label: 'Notifica team' },
  ],
  connections: [
    { fromId: 'trigger-1', toId: 'action-1' },
    { fromId: 'trigger-1', toId: 'action-2' },
  ],
};

const T13: FlowTemplate = {
  id: 't13-costo-elevato',
  nome: 'Costo elevato registrato → Alert management',
  categoria: 'fatturazione',
  descrizione: 'Quando viene registrato un costo superiore a una soglia configurabile, notifica il management e crea task di revisione.',
  icona: '💸',
  difficolta: 'intermedio',
  triggerTipo: 'costo_registrato',
  nodes: [
    { id: 'trigger-1', nodeType: 'trigger', posX: 250, posY: 50, configJson: { trigger_type: 'costo_registrato', importo_minimo: 1000 }, label: 'Costo registrato' },
    { id: 'action-1', nodeType: 'action', posX: 100, posY: 200, configJson: { action_type: 'invia_notifica_inapp', titolo: '💸 Costo elevato registrato: €{{costo.importo}}', testo: 'Categoria: {{costo.categoria}} | Fornitore: {{costo.fornitore}} | Note: {{costo.descrizione}}' }, label: 'Notifica management' },
    { id: 'action-2', nodeType: 'action', posX: 400, posY: 200, configJson: { action_type: 'crea_task', titolo: 'Revisione costo: {{costo.descrizione}} (€{{costo.importo}})', priorita: 'media', scadenza_giorni: 3 }, label: 'Task revisione' },
  ],
  connections: [
    { fromId: 'trigger-1', toId: 'action-1' },
    { fromId: 'trigger-1', toId: 'action-2' },
  ],
};

// ════════════════════════════════════════════════════════════════
// TICKET ASSISTENZA (T14–T16)
// ════════════════════════════════════════════════════════════════

const T14: FlowTemplate = {
  id: 't14-ticket-urgente',
  nome: 'Ticket urgente → Escalation immediata',
  categoria: 'assistenza',
  descrizione: 'Ticket con priorità urgente: assegnazione automatica al meno carico, notifica manager, conferma ricezione al cliente.',
  icona: '🚨',
  difficolta: 'intermedio',
  triggerTipo: 'ticket_creato',
  nodes: [
    { id: 'trigger-1', nodeType: 'trigger', posX: 250, posY: 50, configJson: { trigger_type: 'ticket_creato', priorita_filtro: 'urgente' }, label: 'Ticket urgente creato' },
    { id: 'action-1', nodeType: 'action', posX: 100, posY: 200, configJson: { action_type: 'assegna_agente', entity_type: 'tickets', entity_id: '{{ticket.id}}', strategia: 'meno_carico' }, label: 'Assegna agente' },
    { id: 'action-2', nodeType: 'action', posX: 400, posY: 200, configJson: { action_type: 'invia_notifica_inapp', titolo: '🚨 Ticket URGENTE: {{ticket.subject}}', testo: 'ID: {{ticket.id}} — Priorità: {{ticket.priority}}' }, label: 'Notifica manager' },
    { id: 'action-3', nodeType: 'action', posX: 250, posY: 380, configJson: { action_type: 'invia_email', destinatario: '{{contatto.email}}', oggetto: 'Ticket ricevuto — Priorità urgente', corpo: 'Gentile cliente,\n\nAbbiamo ricevuto la tua richiesta urgente.\nUn tecnico la contatterà entro 1 ora.\n\nCordiali saluti' }, label: 'Email conferma' },
  ],
  connections: [
    { fromId: 'trigger-1', toId: 'action-1' },
    { fromId: 'trigger-1', toId: 'action-2' },
    { fromId: 'action-2', toId: 'action-3' },
  ],
};

const T15: FlowTemplate = {
  id: 't15-ticket-risolto',
  nome: 'Ticket risolto → Richiedi feedback cliente',
  categoria: 'assistenza',
  descrizione: 'Quando un ticket viene chiuso come risolto: attendi 2 ore, poi chiedi feedback al cliente sull\'assistenza ricevuta.',
  icona: '⭐',
  difficolta: 'base',
  triggerTipo: 'ticket_stato_cambiato',
  nodes: [
    { id: 'trigger-1', nodeType: 'trigger', posX: 250, posY: 50, configJson: { trigger_type: 'ticket_stato_cambiato', stato_a: 'risolto' }, label: 'Ticket risolto' },
    { id: 'delay-1', nodeType: 'delay', posX: 250, posY: 200, configJson: { delay_type: 'attendi', ore: 2 }, label: 'Attendi 2 ore' },
    { id: 'action-1', nodeType: 'action', posX: 250, posY: 350, configJson: { action_type: 'invia_email', destinatario: '{{contatto.email}}', oggetto: 'Il tuo ticket è stato risolto — Feedback?', corpo: 'Gentile cliente,\n\nIl tuo ticket è stato risolto.\n\nSaresti disposto a lasciarci un breve feedback sull\'assistenza ricevuta?\n\nGrazie mille!' }, label: 'Email feedback' },
  ],
  connections: [
    { fromId: 'trigger-1', toId: 'delay-1' },
    { fromId: 'delay-1', toId: 'action-1' },
  ],
};

const T16: FlowTemplate = {
  id: 't16-ticket-senza-risposta',
  nome: 'Ticket senza risposta → Escalation automatica',
  categoria: 'assistenza',
  descrizione: 'Quando un ticket non riceve risposta entro 24h: notifica agente assegnato e crea task di escalation urgente.',
  icona: '⏱️',
  difficolta: 'intermedio',
  triggerTipo: 'ticket_senza_risposta',
  nodes: [
    { id: 'trigger-1', nodeType: 'trigger', posX: 250, posY: 50, configJson: { trigger_type: 'ticket_senza_risposta', ore_senza_risposta: 24 }, label: 'Ticket senza risposta 24h' },
    { id: 'action-1', nodeType: 'action', posX: 100, posY: 200, configJson: { action_type: 'invia_notifica_inapp', titolo: '⚠️ Ticket senza risposta da 24h: {{ticket.subject}}', testo: 'ID: {{ticket.id}}' }, label: 'Notifica agente' },
    { id: 'action-2', nodeType: 'action', posX: 400, posY: 200, configJson: { action_type: 'crea_task', titolo: 'ESCALATION: Rispondi a ticket {{ticket.subject}}', priorita: 'urgente', scadenza_giorni: 0 }, label: 'Task escalation' },
  ],
  connections: [
    { fromId: 'trigger-1', toId: 'action-1' },
    { fromId: 'trigger-1', toId: 'action-2' },
  ],
};

// ════════════════════════════════════════════════════════════════
// ORDINI (T17–T19)
// ════════════════════════════════════════════════════════════════

const T17: FlowTemplate = {
  id: 't17-ordine-confermato',
  nome: 'Ordine confermato → Avvia produzione',
  categoria: 'ordini',
  descrizione: 'Ordine confermato: invia conferma al cliente, crea task lavorazione per il responsabile produzione e notifica il team.',
  icona: '📦',
  difficolta: 'intermedio',
  triggerTipo: 'ordine_stato_cambiato',
  nodes: [
    { id: 'trigger-1', nodeType: 'trigger', posX: 250, posY: 50, configJson: { trigger_type: 'ordine_stato_cambiato', stato_a: 'confermato' }, label: 'Ordine confermato' },
    { id: 'action-1', nodeType: 'action', posX: 100, posY: 200, configJson: { action_type: 'invia_email', destinatario: '{{contatto.email}}', oggetto: 'Ordine {{ordine.order_code}} confermato!', corpo: 'Gentile cliente,\n\nIl tuo ordine {{ordine.order_code}} è stato confermato e sarà pronto nei tempi concordati.\n\nGrazie per la fiducia!' }, label: 'Email conferma' },
    { id: 'action-2', nodeType: 'action', posX: 400, posY: 200, configJson: { action_type: 'crea_task', titolo: 'Avvia lavorazione ordine {{ordine.order_code}}', priorita: 'alta', scadenza_giorni: 1 }, label: 'Task lavorazione' },
    { id: 'action-3', nodeType: 'action', posX: 250, posY: 380, configJson: { action_type: 'invia_notifica_inapp', titolo: '📦 Nuovo ordine da lavorare: {{ordine.order_code}}', testo: '€{{ordine.total_amount}}' }, label: 'Notifica team' },
  ],
  connections: [
    { fromId: 'trigger-1', toId: 'action-1' },
    { fromId: 'trigger-1', toId: 'action-2' },
    { fromId: 'action-2', toId: 'action-3' },
  ],
};

const T18: FlowTemplate = {
  id: 't18-ordine-spedito',
  nome: 'Ordine spedito → Notifica spedizione multicanale',
  categoria: 'ordini',
  descrizione: 'Quando un ordine viene marcato come spedito: notifica il cliente via email e WhatsApp con i dettagli di consegna.',
  icona: '🚚',
  difficolta: 'base',
  triggerTipo: 'ordine_stato_cambiato',
  nodes: [
    { id: 'trigger-1', nodeType: 'trigger', posX: 250, posY: 50, configJson: { trigger_type: 'ordine_stato_cambiato', stato_a: 'spedito' }, label: 'Ordine spedito' },
    { id: 'action-1', nodeType: 'action', posX: 100, posY: 200, configJson: { action_type: 'invia_email', destinatario: '{{contatto.email}}', oggetto: 'Il tuo ordine {{ordine.order_code}} è in viaggio!', corpo: 'Gentile cliente,\n\nLa tua merce è stata spedita e arriverà a breve.\n\nPer qualsiasi informazione siamo disponibili!' }, label: 'Email spedizione' },
    { id: 'action-2', nodeType: 'action', posX: 400, posY: 200, configJson: { action_type: 'invia_whatsapp', numero: '{{contatto.phone}}', messaggio: '✅ Il tuo ordine {{ordine.order_code}} è partito! Ti aggiorneremo sull\'arrivo.' }, label: 'WhatsApp spedizione' },
  ],
  connections: [
    { fromId: 'trigger-1', toId: 'action-1' },
    { fromId: 'trigger-1', toId: 'action-2' },
  ],
};

const T19: FlowTemplate = {
  id: 't19-ordine-ritardo',
  nome: 'Ordine in ritardo → Alert e comunicazione cliente',
  categoria: 'ordini',
  descrizione: 'Quando un ordine supera la data di consegna prevista: avvisa il commerciale responsabile e invia comunicazione proattiva al cliente.',
  icona: '⚠️',
  difficolta: 'intermedio',
  triggerTipo: 'ordine_in_ritardo',
  nodes: [
    { id: 'trigger-1', nodeType: 'trigger', posX: 250, posY: 50, configJson: { trigger_type: 'ordine_in_ritardo' }, label: 'Ordine in ritardo' },
    { id: 'action-1', nodeType: 'action', posX: 100, posY: 200, configJson: { action_type: 'invia_notifica_inapp', titolo: '⚠️ Ordine {{ordine.order_code}} in ritardo di {{ordine.giorni_ritardo}} giorni', testo: 'Ordine: {{ordine.order_code}}' }, label: 'Notifica commerciale' },
    { id: 'action-2', nodeType: 'action', posX: 400, posY: 200, configJson: { action_type: 'invia_email', destinatario: '{{contatto.email}}', oggetto: 'Aggiornamento consegna ordine {{ordine.order_code}}', corpo: 'Gentile cliente,\n\nVogliamo aggiornarla proattivamente: il suo ordine {{ordine.order_code}} ha subito un ritardo.\nIl nostro team si è già attivato per risolvere la situazione.\n\nLa contatteremo con la nuova data di consegna.\n\nCi scusiamo per il disagio.' }, label: 'Email cliente' },
    { id: 'action-3', nodeType: 'action', posX: 250, posY: 380, configJson: { action_type: 'crea_task', titolo: '🚨 Gestisci ritardo ordine {{ordine.order_code}}', priorita: 'urgente', scadenza_giorni: 0 }, label: 'Task gestione ritardo' },
  ],
  connections: [
    { fromId: 'trigger-1', toId: 'action-1' },
    { fromId: 'trigger-1', toId: 'action-2' },
    { fromId: 'trigger-1', toId: 'action-3' },
  ],
};

// ════════════════════════════════════════════════════════════════
// MAGAZZINO (T20–T22)
// ════════════════════════════════════════════════════════════════

const T20: FlowTemplate = {
  id: 't20-scorta-minima',
  nome: 'Scorta minima → Task riordino automatico',
  categoria: 'magazzino',
  descrizione: 'Quando un prodotto scende sotto la scorta minima: crea task di riordino urgente e notifica il responsabile magazzino.',
  icona: '⚠️',
  difficolta: 'base',
  triggerTipo: 'scorta_minima',
  nodes: [
    { id: 'trigger-1', nodeType: 'trigger', posX: 250, posY: 50, configJson: { trigger_type: 'scorta_minima' }, label: 'Scorta minima' },
    { id: 'action-1', nodeType: 'action', posX: 100, posY: 200, configJson: { action_type: 'crea_task', titolo: '⚠️ Riordina: {{prodotto.name}} (attuale: {{prodotto.quantity}} | min: {{prodotto.min_stock_level}})', priorita: 'alta', scadenza_giorni: 1 }, label: 'Task riordino' },
    { id: 'action-2', nodeType: 'action', posX: 400, posY: 200, configJson: { action_type: 'invia_notifica_inapp', titolo: 'Scorta minima: {{prodotto.name}}', testo: 'Giacenza: {{prodotto.quantity}} pz' }, label: 'Notifica responsabile' },
  ],
  connections: [
    { fromId: 'trigger-1', toId: 'action-1' },
    { fromId: 'trigger-1', toId: 'action-2' },
  ],
};

const T21: FlowTemplate = {
  id: 't21-prodotto-esaurito',
  nome: 'Prodotto esaurito → Alert urgente e riordino',
  categoria: 'magazzino',
  descrizione: 'Quando un prodotto arriva a zero: notifica urgente al responsabile e task di riordino immediato.',
  icona: '🔴',
  difficolta: 'intermedio',
  triggerTipo: 'prodotto_esaurito',
  nodes: [
    { id: 'trigger-1', nodeType: 'trigger', posX: 250, posY: 50, configJson: { trigger_type: 'prodotto_esaurito' }, label: 'Prodotto esaurito' },
    { id: 'action-1', nodeType: 'action', posX: 100, posY: 200, configJson: { action_type: 'invia_notifica_inapp', titolo: '🔴 ESAURITO: {{prodotto.name}}', testo: 'Il prodotto è a zero pezzi.' }, label: 'Alert urgente' },
    { id: 'action-2', nodeType: 'action', posX: 400, posY: 200, configJson: { action_type: 'crea_task', titolo: '🔴 URGENTE — Riordina {{prodotto.name}} (ESAURITO)', priorita: 'urgente', scadenza_giorni: 0 }, label: 'Task riordino urgente' },
  ],
  connections: [
    { fromId: 'trigger-1', toId: 'action-1' },
    { fromId: 'trigger-1', toId: 'action-2' },
  ],
};

const T22: FlowTemplate = {
  id: 't22-whatsapp-ricevuto',
  nome: 'Messaggio WhatsApp ricevuto → Notifica e task risposta',
  categoria: 'marketing',
  descrizione: 'Quando arriva un messaggio WhatsApp da un contatto: notifica l\'agente assegnato e crea task di risposta rapida.',
  icona: '💬',
  difficolta: 'base',
  triggerTipo: 'whatsapp_ricevuto',
  nodes: [
    { id: 'trigger-1', nodeType: 'trigger', posX: 250, posY: 50, configJson: { trigger_type: 'whatsapp_ricevuto' }, label: 'WhatsApp ricevuto' },
    { id: 'action-1', nodeType: 'action', posX: 100, posY: 200, configJson: { action_type: 'invia_notifica_inapp', titolo: '💬 Messaggio WA da {{contatto.first_name}} {{contatto.last_name}}', testo: '{{messaggio.testo}}' }, label: 'Notifica agente' },
    { id: 'action-2', nodeType: 'action', posX: 400, posY: 200, configJson: { action_type: 'crea_task', titolo: 'Rispondi a WhatsApp di {{contatto.first_name}} {{contatto.last_name}}', priorita: 'alta', scadenza_giorni: 0 }, label: 'Task risposta' },
  ],
  connections: [
    { fromId: 'trigger-1', toId: 'action-1' },
    { fromId: 'trigger-1', toId: 'action-2' },
  ],
};

// ════════════════════════════════════════════════════════════════
// CANTIERI (T23–T25)
// ════════════════════════════════════════════════════════════════

const T23: FlowTemplate = {
  id: 't23-cantiere-onboarding',
  nome: 'Cantiere aperto → Onboarding completo',
  categoria: 'cantieri',
  descrizione: 'Alla creazione di un nuovo cantiere: genera automaticamente i 4 task iniziali standard e notifica il cliente.',
  icona: '🏗️',
  difficolta: 'avanzato',
  triggerTipo: 'cantiere_creato',
  nodes: [
    { id: 'trigger-1', nodeType: 'trigger', posX: 250, posY: 50, configJson: { trigger_type: 'cantiere_creato' }, label: 'Cantiere creato' },
    { id: 'action-1', nodeType: 'action', posX: 100, posY: 200, configJson: { action_type: 'crea_task', titolo: '📄 Raccolta documentazione: {{cantiere.nome}}', priorita: 'alta', scadenza_giorni: 2 }, label: 'Task documentazione' },
    { id: 'action-2', nodeType: 'action', posX: 400, posY: 200, configJson: { action_type: 'crea_task', titolo: '🔍 Sopralluogo: {{cantiere.nome}} — {{cantiere.indirizzo}}', priorita: 'alta', scadenza_giorni: 5 }, label: 'Task sopralluogo' },
    { id: 'action-3', nodeType: 'action', posX: 100, posY: 380, configJson: { action_type: 'crea_task', titolo: '📋 Piano operativo e timeline: {{cantiere.nome}}', priorita: 'media', scadenza_giorni: 7 }, label: 'Task pianificazione' },
    { id: 'action-4', nodeType: 'action', posX: 400, posY: 380, configJson: { action_type: 'crea_task', titolo: '⛑️ Piano sicurezza cantiere: {{cantiere.nome}}', priorita: 'alta', scadenza_giorni: 5 }, label: 'Task sicurezza' },
    { id: 'action-5', nodeType: 'action', posX: 250, posY: 560, configJson: { action_type: 'invia_email', destinatario: '{{contatto.email}}', oggetto: 'Cantiere {{cantiere.nome}} aperto — Benvenuto!', corpo: 'Gentile cliente,\n\nAbbiamo aperto il cantiere per i suoi lavori.\nIl responsabile la contatterà nei prossimi giorni per i dettagli operativi.\n\nCordiali saluti' }, label: 'Email benvenuto' },
  ],
  connections: [
    { fromId: 'trigger-1', toId: 'action-1' },
    { fromId: 'trigger-1', toId: 'action-2' },
    { fromId: 'trigger-1', toId: 'action-3' },
    { fromId: 'trigger-1', toId: 'action-4' },
    { fromId: 'action-3', toId: 'action-5' },
  ],
};

const T24: FlowTemplate = {
  id: 't24-cantiere-fase-completata',
  nome: 'Fase cantiere completata → Aggiornamento cliente',
  categoria: 'cantieri',
  descrizione: 'Quando una fase del cantiere viene completata: notifica il cliente con aggiornamento avanzamento lavori e crea task per la fase successiva.',
  icona: '✅',
  difficolta: 'intermedio',
  triggerTipo: 'cantiere_fase_completata',
  nodes: [
    { id: 'trigger-1', nodeType: 'trigger', posX: 250, posY: 50, configJson: { trigger_type: 'cantiere_fase_completata' }, label: 'Fase completata' },
    { id: 'action-1', nodeType: 'action', posX: 100, posY: 200, configJson: { action_type: 'invia_email', destinatario: '{{contatto.email}}', oggetto: 'Aggiornamento lavori: {{fase.nome}} completata', corpo: 'Gentile cliente,\n\nAbbiamo completato la fase {{fase.nome}} del cantiere {{cantiere.nome}}.\n\nStiamo procedendo con la fase successiva nei tempi previsti.\n\nCordiali saluti' }, label: 'Email aggiornamento' },
    { id: 'action-2', nodeType: 'action', posX: 400, posY: 200, configJson: { action_type: 'crea_task', titolo: 'Avvia fase successiva — {{cantiere.nome}}', priorita: 'alta', scadenza_giorni: 1 }, label: 'Task prossima fase' },
  ],
  connections: [
    { fromId: 'trigger-1', toId: 'action-1' },
    { fromId: 'trigger-1', toId: 'action-2' },
  ],
};

const T25: FlowTemplate = {
  id: 't25-cantiere-ritardo',
  nome: 'Cantiere in ritardo → Escalation e piano recupero',
  categoria: 'cantieri',
  descrizione: 'Quando un cantiere supera la data di consegna pianificata: notifica management, crea task piano di recupero e informa il cliente.',
  icona: '🚧',
  difficolta: 'avanzato',
  triggerTipo: 'cantiere_in_ritardo',
  nodes: [
    { id: 'trigger-1', nodeType: 'trigger', posX: 250, posY: 50, configJson: { trigger_type: 'cantiere_in_ritardo' }, label: 'Cantiere in ritardo' },
    { id: 'action-1', nodeType: 'action', posX: 250, posY: 200, configJson: { action_type: 'invia_notifica_inapp', titolo: '🚧 Cantiere in ritardo: {{cantiere.nome}}', testo: 'Ritardo: {{cantiere.giorni_ritardo}} giorni' }, label: 'Notifica management' },
    { id: 'action-2', nodeType: 'action', posX: 250, posY: 350, configJson: { action_type: 'crea_task', titolo: 'Piano recupero ritardo: {{cantiere.nome}} ({{cantiere.giorni_ritardo}} giorni)', priorita: 'urgente', scadenza_giorni: 0 }, label: 'Task piano recupero' },
    { id: 'action-3', nodeType: 'action', posX: 250, posY: 500, configJson: { action_type: 'invia_email', destinatario: '{{contatto.email}}', oggetto: 'Aggiornamento tempistiche cantiere {{cantiere.nome}}', corpo: 'Gentile cliente,\n\nVogliamo aggiornarla proattivamente: il cantiere {{cantiere.nome}} ha subito un ritardo.\nIl nostro team è già al lavoro per recuperare i tempi.\n\nLa contatteremo a breve con un aggiornamento dettagliato.\n\nCi scusiamo per il disagio.' }, label: 'Email cliente' },
  ],
  connections: [
    { fromId: 'trigger-1', toId: 'action-1' },
    { fromId: 'action-1', toId: 'action-2' },
    { fromId: 'action-2', toId: 'action-3' },
  ],
};

// ════════════════════════════════════════════════════════════════
// MARKETING (T26–T28)
// ════════════════════════════════════════════════════════════════

const T26: FlowTemplate = {
  id: 't26-form-web',
  nome: 'Form web → CRM + Risposta immediata',
  categoria: 'marketing',
  descrizione: 'Quando qualcuno compila il form sul sito: risposta email automatica, crea contatto e opportunità nel CRM, assegna al commerciale.',
  icona: '📝',
  difficolta: 'intermedio',
  triggerTipo: 'form_compilato',
  nodes: [
    { id: 'trigger-1', nodeType: 'trigger', posX: 250, posY: 50, configJson: { trigger_type: 'form_compilato' }, label: 'Form compilato' },
    { id: 'action-1', nodeType: 'action', posX: 100, posY: 200, configJson: { action_type: 'invia_email', destinatario: '{{contatto.email}}', oggetto: 'Abbiamo ricevuto la tua richiesta!', corpo: 'Gentile {{contatto.first_name}},\n\nGrazie per averci contattato!\nUn nostro consulente ti risponderà nelle prossime ore.\n\nCordiali saluti' }, label: 'Email risposta' },
    { id: 'action-2', nodeType: 'action', posX: 400, posY: 200, configJson: { action_type: 'crea_opportunita', nome: 'Lead web: {{contatto.first_name}} {{contatto.last_name}}', stage: 'nuovo_lead', valore: 0 }, label: 'Crea o aggiorna opportunità' },
    { id: 'action-3', nodeType: 'action', posX: 250, posY: 380, configJson: { action_type: 'crea_task', titolo: '🌐 Lead sito: {{contatto.first_name}} {{contatto.last_name}} ({{contatto.phone}})', priorita: 'alta', scadenza_giorni: 0 }, label: 'Task follow-up' },
  ],
  connections: [
    { fromId: 'trigger-1', toId: 'action-1' },
    { fromId: 'trigger-1', toId: 'action-2' },
    { fromId: 'action-2', toId: 'action-3' },
  ],
};

const T27: FlowTemplate = {
  id: 't27-email-aperta',
  nome: 'Email aperta → Follow-up commerciale lead caldo',
  categoria: 'marketing',
  descrizione: 'Quando un contatto apre un\'email di campagna: notifica immediata al commerciale e task di ricontatto mentre il lead è "caldo".',
  icona: '📧',
  difficolta: 'base',
  triggerTipo: 'email_aperta',
  nodes: [
    { id: 'trigger-1', nodeType: 'trigger', posX: 250, posY: 50, configJson: { trigger_type: 'email_aperta' }, label: 'Email aperta' },
    { id: 'action-1', nodeType: 'action', posX: 250, posY: 200, configJson: { action_type: 'crea_task', titolo: '🔥 Lead caldo: {{contatto.first_name}} {{contatto.last_name}} ha aperto email — Contattare subito!', priorita: 'alta', scadenza_giorni: 0 }, label: 'Task ricontatto' },
    { id: 'action-2', nodeType: 'action', posX: 250, posY: 380, configJson: { action_type: 'invia_notifica_inapp', titolo: 'Lead caldo: {{contatto.first_name}} {{contatto.last_name}}', testo: 'Ha aperto: {{campagna.nome}} | 📞 {{contatto.phone}}' }, label: 'Notifica commerciale' },
  ],
  connections: [
    { fromId: 'trigger-1', toId: 'action-1' },
    { fromId: 'action-1', toId: 'action-2' },
  ],
};

const T28: FlowTemplate = {
  id: 't28-email-cliccata',
  nome: 'Link email cliccato → Crea opportunità CRM',
  categoria: 'marketing',
  descrizione: 'Quando un contatto clicca un link in una email di campagna: crea automaticamente un\'opportunità nel CRM e notifica il commerciale.',
  icona: '🖱️',
  difficolta: 'intermedio',
  triggerTipo: 'email_cliccata',
  nodes: [
    { id: 'trigger-1', nodeType: 'trigger', posX: 250, posY: 50, configJson: { trigger_type: 'email_cliccata' }, label: 'Email cliccata' },
    { id: 'action-1', nodeType: 'action', posX: 100, posY: 200, configJson: { action_type: 'crea_opportunita', nome: 'Interesse da email: {{contatto.first_name}} {{contatto.last_name}}', stage: 'interessato', valore: 0 }, label: 'Crea o aggiorna opportunità' },
    { id: 'action-2', nodeType: 'action', posX: 400, posY: 200, configJson: { action_type: 'invia_notifica_inapp', titolo: '🖱️ {{contatto.first_name}} {{contatto.last_name}} ha cliccato email!', testo: 'Link: {{link.url}} | Opportunità creata' }, label: 'Notifica commerciale' },
    { id: 'action-3', nodeType: 'action', posX: 250, posY: 380, configJson: { action_type: 'crea_task', titolo: 'Contatta: {{contatto.first_name}} {{contatto.last_name}} (ha cliccato su {{link.url}})', priorita: 'alta', scadenza_giorni: 0 }, label: 'Task contatto' },
  ],
  connections: [
    { fromId: 'trigger-1', toId: 'action-1' },
    { fromId: 'trigger-1', toId: 'action-2' },
    { fromId: 'action-1', toId: 'action-3' },
  ],
};

// ════════════════════════════════════════════════════════════════
// HR (T29–T31)
// ════════════════════════════════════════════════════════════════

const T29: FlowTemplate = {
  id: 't29-nuovo-dipendente',
  nome: 'Nuovo dipendente → Onboarding automatico',
  categoria: 'hr',
  descrizione: 'Quando viene aggiunto un nuovo dipendente: email di benvenuto + 4 task di onboarding progressivi.',
  icona: '🧑‍💼',
  difficolta: 'avanzato',
  triggerTipo: 'dipendente_creato',
  nodes: [
    { id: 'trigger-1', nodeType: 'trigger', posX: 250, posY: 50, configJson: { trigger_type: 'dipendente_creato' }, label: 'Nuovo dipendente' },
    { id: 'action-1', nodeType: 'action', posX: 100, posY: 200, configJson: { action_type: 'invia_email', destinatario: '{{dipendente.email}}', oggetto: 'Benvenuto in azienda, {{dipendente.first_name}}!', corpo: 'Caro/a {{dipendente.first_name}},\n\nSiamo felici di averti nel team!\nNei prossimi giorni riceverai tutte le info necessarie per iniziare.\n\nBenvenuto/a!' }, label: 'Email benvenuto' },
    { id: 'action-2', nodeType: 'action', posX: 400, posY: 200, configJson: { action_type: 'crea_task', titolo: 'Setup credenziali e account: {{dipendente.first_name}} {{dipendente.last_name}}', priorita: 'alta', scadenza_giorni: 1 }, label: 'Task setup' },
    { id: 'action-3', nodeType: 'action', posX: 100, posY: 380, configJson: { action_type: 'crea_task', titolo: 'Formazione iniziale: {{dipendente.first_name}} {{dipendente.last_name}} (ruolo: {{dipendente.role_type}})', priorita: 'alta', scadenza_giorni: 3 }, label: 'Task formazione' },
    { id: 'action-4', nodeType: 'action', posX: 400, posY: 380, configJson: { action_type: 'crea_task', titolo: 'Check-in settimana 1: come va {{dipendente.first_name}}?', priorita: 'media', scadenza_giorni: 7 }, label: 'Task check-in 1' },
    { id: 'action-5', nodeType: 'action', posX: 250, posY: 560, configJson: { action_type: 'crea_task', titolo: 'Check-in mese 1 e valutazione onboarding: {{dipendente.first_name}} {{dipendente.last_name}}', priorita: 'media', scadenza_giorni: 30 }, label: 'Task check-in 2' },
  ],
  connections: [
    { fromId: 'trigger-1', toId: 'action-1' },
    { fromId: 'trigger-1', toId: 'action-2' },
    { fromId: 'action-2', toId: 'action-3' },
    { fromId: 'action-3', toId: 'action-4' },
    { fromId: 'action-4', toId: 'action-5' },
  ],
};

const T30: FlowTemplate = {
  id: 't30-contratto-scadenza',
  nome: 'Contratto in scadenza → Alert HR 30 giorni prima',
  categoria: 'hr',
  descrizione: '30 giorni prima della scadenza contrattuale: notifica HR, crea task di revisione e invia promemoria al dipendente.',
  icona: '📄',
  difficolta: 'intermedio',
  triggerTipo: 'contratto_in_scadenza',
  nodes: [
    { id: 'trigger-1', nodeType: 'trigger', posX: 250, posY: 50, configJson: { trigger_type: 'contratto_in_scadenza', giorni_prima: 30 }, label: 'Contratto in scadenza' },
    { id: 'action-1', nodeType: 'action', posX: 100, posY: 200, configJson: { action_type: 'crea_task', titolo: '⚠️ Contratto in scadenza fra 30gg: {{dipendente.first_name}} {{dipendente.last_name}} ({{contratto.scadenza}})', priorita: 'alta', scadenza_giorni: 7 }, label: 'Task revisione' },
    { id: 'action-2', nodeType: 'action', posX: 400, posY: 200, configJson: { action_type: 'invia_notifica_inapp', titolo: 'Contratto in scadenza: {{dipendente.first_name}} {{dipendente.last_name}}', testo: 'Scade il {{contratto.scadenza}} — {{contratto.giorni_rimanenti}} giorni rimanenti' }, label: 'Notifica HR' },
    { id: 'action-3', nodeType: 'action', posX: 250, posY: 380, configJson: { action_type: 'invia_email', destinatario: '{{dipendente.email}}', oggetto: 'Il tuo contratto scade il {{contratto.scadenza}}', corpo: 'Caro/a {{dipendente.first_name}},\n\nTi comunichiamo che il tuo contratto scadrà il {{contratto.scadenza}}.\nIl responsabile HR ti contatterà a breve per discutere del rinnovo.\n\nCordiali saluti' }, label: 'Email dipendente' },
  ],
  connections: [
    { fromId: 'trigger-1', toId: 'action-1' },
    { fromId: 'trigger-1', toId: 'action-2' },
    { fromId: 'action-1', toId: 'action-3' },
  ],
};

const T31: FlowTemplate = {
  id: 't31-richiesta-ferie',
  nome: 'Richiesta ferie → Notifica e approvazione manager',
  categoria: 'hr',
  descrizione: 'Quando un dipendente richiede le ferie: notifica il manager responsabile e crea task di approvazione/verifica copertura.',
  icona: '🏖️',
  difficolta: 'base',
  triggerTipo: 'ferie_richiesta',
  nodes: [
    { id: 'trigger-1', nodeType: 'trigger', posX: 250, posY: 50, configJson: { trigger_type: 'ferie_richiesta' }, label: 'Richiesta ferie' },
    { id: 'action-1', nodeType: 'action', posX: 100, posY: 200, configJson: { action_type: 'invia_notifica_inapp', titolo: 'Richiesta ferie: {{dipendente.first_name}} {{dipendente.last_name}}', testo: 'Dal {{richiesta.data_inizio}} al {{richiesta.data_fine}} ({{richiesta.giorni}} giorni)' }, label: 'Notifica manager' },
    { id: 'action-2', nodeType: 'action', posX: 400, posY: 200, configJson: { action_type: 'crea_task', titolo: 'Approva ferie {{dipendente.first_name}} {{dipendente.last_name}}: {{richiesta.data_inizio}} → {{richiesta.data_fine}}', priorita: 'media', scadenza_giorni: 2 }, label: 'Task approvazione' },
  ],
  connections: [
    { fromId: 'trigger-1', toId: 'action-1' },
    { fromId: 'trigger-1', toId: 'action-2' },
  ],
};

// ════════════════════════════════════════════════════════════════
// TASK (T32)
// ════════════════════════════════════════════════════════════════

const T32: FlowTemplate = {
  id: 't32-task-scaduto',
  nome: 'Task scaduto → Escalation manager',
  categoria: 'task',
  descrizione: 'Quando un task supera la scadenza senza essere completato: notifica il manager e crea task di follow-up urgente.',
  icona: '⏰',
  difficolta: 'base',
  triggerTipo: 'task_scaduto',
  nodes: [
    { id: 'trigger-1', nodeType: 'trigger', posX: 250, posY: 50, configJson: { trigger_type: 'task_scaduto' }, label: 'Task scaduto' },
    { id: 'action-1', nodeType: 'action', posX: 250, posY: 200, configJson: { action_type: 'invia_notifica_inapp', titolo: '⚠️ Task scaduto: {{task.title}}', testo: 'In ritardo di {{task.giorni_ritardo}} giorni | Assegnato a: {{task.assigned_to}}' }, label: 'Notifica manager' },
    { id: 'action-2', nodeType: 'action', posX: 250, posY: 380, configJson: { action_type: 'crea_task', titolo: 'ESCALATION: verifica ritardo {{task.giorni_ritardo}}gg — {{task.title}}', priorita: 'urgente', scadenza_giorni: 0 }, label: 'Task escalation' },
  ],
  connections: [
    { fromId: 'trigger-1', toId: 'action-1' },
    { fromId: 'action-1', toId: 'action-2' },
  ],
};

// ════════════════════════════════════════════════════════════════
// GENERALE / REPORT SCHEDULATI (T33–T35)
// ════════════════════════════════════════════════════════════════

const T33: FlowTemplate = {
  id: 't33-report-giornaliero',
  nome: 'Report giornaliero task e attività (8:00)',
  categoria: 'generale',
  descrizione: 'Ogni mattina alle 8:00: genera e invia un report con task in scadenza, appuntamenti e attività del giorno.',
  icona: '📊',
  difficolta: 'base',
  triggerTipo: 'cron_giornaliero',
  nodes: [
    { id: 'trigger-1', nodeType: 'trigger', posX: 250, posY: 50, configJson: { trigger_type: 'cron_giornaliero', ora: '08:00' }, label: 'Ogni giorno alle 8:00' },
    { id: 'action-1', nodeType: 'action', posX: 250, posY: 200, configJson: { action_type: 'invia_notifica_inapp', titolo: '📊 Report giornaliero', testo: 'Task in scadenza oggi: {{report.task_scadenza}} | Appuntamenti: {{report.appuntamenti}} | Attività: {{report.attivita}}' }, label: 'Notifica report' },
  ],
  connections: [
    { fromId: 'trigger-1', toId: 'action-1' },
  ],
};

const T34: FlowTemplate = {
  id: 't34-report-settimanale',
  nome: 'Report settimanale pipeline (lunedì 9:00)',
  categoria: 'generale',
  descrizione: 'Ogni lunedì alle 9:00: report riepilogativo con pipeline vendite, nuovi lead, opportunità chiuse e fatturato settimanale.',
  icona: '📈',
  difficolta: 'intermedio',
  triggerTipo: 'cron_settimanale',
  nodes: [
    { id: 'trigger-1', nodeType: 'trigger', posX: 250, posY: 50, configJson: { trigger_type: 'cron_settimanale', giorno: 'lunedi', ora: '09:00' }, label: 'Ogni lunedì alle 9:00' },
    { id: 'action-1', nodeType: 'action', posX: 250, posY: 200, configJson: { action_type: 'invia_email', destinatario: '{{azienda.email_report}}', oggetto: 'Report settimanale pipeline — {{report.settimana}}', corpo: 'Riepilogo settimana:\n\n• Nuovi lead: {{report.nuovi_lead}}\n• Opportunità chiuse: {{report.opp_chiuse}}\n• Fatturato: €{{report.fatturato}}\n• Pipeline attiva: €{{report.pipeline_valore}}' }, label: 'Email report' },
    { id: 'action-2', nodeType: 'action', posX: 250, posY: 380, configJson: { action_type: 'invia_notifica_inapp', titolo: '📈 Report settimanale pronto', testo: 'Lead: {{report.nuovi_lead}} | Chiuse: {{report.opp_chiuse}} | Fatturato: €{{report.fatturato}}' }, label: 'Notifica report' },
  ],
  connections: [
    { fromId: 'trigger-1', toId: 'action-1' },
    { fromId: 'trigger-1', toId: 'action-2' },
  ],
};

const T35: FlowTemplate = {
  id: 't35-report-mensile',
  nome: 'Report mensile KPI aziendali (1° del mese)',
  categoria: 'generale',
  descrizione: 'Il primo di ogni mese: report completo con KPI aziendali, fatturato, margini, cantieri attivi e performance team.',
  icona: '📋',
  difficolta: 'avanzato',
  triggerTipo: 'cron_mensile',
  nodes: [
    { id: 'trigger-1', nodeType: 'trigger', posX: 250, posY: 50, configJson: { trigger_type: 'cron_mensile', giorno_mese: 1, ora: '09:00' }, label: 'Ogni 1° del mese' },
    { id: 'action-1', nodeType: 'action', posX: 250, posY: 200, configJson: { action_type: 'invia_email', destinatario: '{{azienda.email_report}}', oggetto: 'Report KPI mensile — {{report.mese}} {{report.anno}}', corpo: 'Report mensile:\n\n• Fatturato: €{{report.fatturato}}\n• Margine: {{report.margine}}%\n• Nuovi clienti: {{report.nuovi_clienti}}\n• Cantieri attivi: {{report.cantieri_attivi}}\n• Task completati: {{report.task_completati}}\n• Ticket risolti: {{report.ticket_risolti}}' }, label: 'Email report KPI' },
    { id: 'action-2', nodeType: 'action', posX: 250, posY: 380, configJson: { action_type: 'crea_task', titolo: 'Revisione KPI mensili {{report.mese}} con management', priorita: 'media', scadenza_giorni: 5 }, label: 'Task revisione KPI' },
    { id: 'action-3', nodeType: 'action', posX: 250, posY: 530, configJson: { action_type: 'invia_notifica_inapp', titolo: '📋 Report KPI {{report.mese}} pronto', testo: 'Fatturato: €{{report.fatturato}} | Margine: {{report.margine}}% | Cantieri: {{report.cantieri_attivi}}' }, label: 'Notifica management' },
  ],
  connections: [
    { fromId: 'trigger-1', toId: 'action-1' },
    { fromId: 'action-1', toId: 'action-2' },
    { fromId: 'action-1', toId: 'action-3' },
  ],
};

// ════════════════════════════════════════════════════════════════
// EXPORT
// ════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════
// SPRINT 4A — Template verticali imprese edili (T36–T45)
// ════════════════════════════════════════════════════════════════

const T36: FlowTemplate = {
  id: 't36-lead-facebook-preventivo',
  nome: 'Lead Facebook → Preventivo Automatico',
  categoria: 'crm',
  descrizione: 'Lead arriva da Meta → crea contatto → notifica venditore → crea bozza preventivo in 5min → dopo 1h invia WhatsApp di benvenuto.',
  icona: '🏆',
  difficolta: 'intermedio',
  triggerTipo: 'facebook_lead_received',
  nodes: [
    { id: 'trigger-1', nodeType: 'trigger', posX: 250, posY: 50,  configJson: { trigger_type: 'facebook_lead_received' }, label: 'Lead Facebook' },
    { id: 'action-1', nodeType: 'action',  posX: 250, posY: 200, configJson: { action_type: 'assign_user', assign_method: 'round_robin' }, label: 'Assegna venditore' },
    { id: 'action-2', nodeType: 'action',  posX: 250, posY: 350, configJson: { action_type: 'create_quote', title: 'Preventivo {{contact.company_name || contact.first_name}}' }, label: 'Crea bozza preventivo' },
    { id: 'delay-1',  nodeType: 'delay',   posX: 250, posY: 500, configJson: { delay_type: 'attendi', ore: 1 }, label: 'Attendi 1 ora' },
    { id: 'action-3', nodeType: 'action',  posX: 250, posY: 650, configJson: { action_type: 'send_whatsapp', destinatario: '{{contact.phone}}', testo: 'Ciao {{contact.first_name}}! 👋 Ho ricevuto la tua richiesta. Ti contatterò a breve per un preventivo personalizzato.' }, label: 'WhatsApp benvenuto' },
  ],
  connections: [
    { fromId: 'trigger-1', toId: 'action-1' },
    { fromId: 'action-1',  toId: 'action-2' },
    { fromId: 'action-2',  toId: 'delay-1'  },
    { fromId: 'delay-1',   toId: 'action-3' },
  ],
};

const T37: FlowTemplate = {
  id: 't37-promemoria-appuntamento-triplo',
  nome: 'Promemoria Appuntamento Triplo',
  categoria: 'crm',
  descrizione: 'Booking confermato → email conferma immediata → WhatsApp -24h → SMS -1h → post-appuntamento chiedi feedback.',
  icona: '📅',
  difficolta: 'intermedio',
  triggerTipo: 'appointment_booked',
  nodes: [
    { id: 'trigger-1', nodeType: 'trigger', posX: 250, posY: 50,  configJson: { trigger_type: 'appointment_booked' }, label: 'Appuntamento prenotato' },
    { id: 'action-1', nodeType: 'action',  posX: 250, posY: 200, configJson: { action_type: 'send_email', destinatario: '{{contact.email}}', oggetto: 'Conferma appuntamento — {{appointment.appointment_date}}', corpo: 'Gentile {{contact.first_name}},\n\nconfermiamo il tuo appuntamento per il {{appointment.appointment_date}} alle {{appointment.appointment_time}}.\n\nCordiali saluti' }, label: 'Email conferma' },
    { id: 'delay-1',  nodeType: 'delay',   posX: 250, posY: 350, configJson: { delay_type: 'attendi_fino_a', ore_prima: 24, evento_riferimento: 'appointment.appointment_date' }, label: '-24h da appuntamento' },
    { id: 'action-2', nodeType: 'action',  posX: 250, posY: 500, configJson: { action_type: 'send_whatsapp', destinatario: '{{contact.phone}}', testo: '📅 Promemoria: domani hai un appuntamento con noi alle {{appointment.appointment_time}}. Ti aspettiamo!' }, label: 'WhatsApp -24h' },
    { id: 'delay-2',  nodeType: 'delay',   posX: 250, posY: 650, configJson: { delay_type: 'attendi_fino_a', ore_prima: 1, evento_riferimento: 'appointment.appointment_date' }, label: '-1h da appuntamento' },
    { id: 'action-3', nodeType: 'action',  posX: 250, posY: 800, configJson: { action_type: 'send_sms_telnyx', phone: '{{contact.phone}}', message: 'Tra 1 ora ti aspettiamo! Hai domande? Rispondi a questo SMS.' }, label: 'SMS -1h' },
  ],
  connections: [
    { fromId: 'trigger-1', toId: 'action-1' },
    { fromId: 'action-1',  toId: 'delay-1'  },
    { fromId: 'delay-1',   toId: 'action-2' },
    { fromId: 'action-2',  toId: 'delay-2'  },
    { fromId: 'delay-2',   toId: 'action-3' },
  ],
};

const T38: FlowTemplate = {
  id: 't38-followup-preventivo-non-risposto',
  nome: 'Follow-up Preventivo Non Risposto',
  categoria: 'preventivi',
  descrizione: 'Preventivo inviato → attendi 3gg → se non visualizzato WhatsApp → attendi 5gg → se non accettato email urgency → attendi 10gg → segna stagnante.',
  icona: '💰',
  difficolta: 'avanzato',
  triggerTipo: 'preventivo_senza_risposta',
  nodes: [
    { id: 'trigger-1', nodeType: 'trigger',   posX: 250, posY: 50,  configJson: { trigger_type: 'preventivo_senza_risposta', giorni_senza_risposta: 3 }, label: 'Preventivo senza risposta da 3 giorni' },
    { id: 'action-1',  nodeType: 'action',    posX: 250, posY: 350, configJson: { action_type: 'send_whatsapp', destinatario: '{{contact.phone}}', testo: 'Ciao {{contact.first_name}}! 👋 Hai avuto modo di vedere il preventivo che ti abbiamo inviato? Siamo disponibili per qualsiasi domanda.' }, label: 'WhatsApp reminder' },
    { id: 'delay-2',   nodeType: 'delay',     posX: 250, posY: 500, configJson: { delay_type: 'attendi', giorni: 5 }, label: 'Attendi 5 giorni' },
    { id: 'action-2',  nodeType: 'action',    posX: 250, posY: 650, configJson: { action_type: 'send_email', destinatario: '{{contact.email}}', oggetto: '⏰ Preventivo in scadenza — conferma entro domani', corpo: 'Gentile {{contact.first_name}},\n\nIl tuo preventivo da €{{quote.total}} è valido ancora per 48 ore. Scrivi subito per confermare il tuo posto in agenda.\n\nCordiali saluti' }, label: 'Email urgency' },
    { id: 'delay-3',   nodeType: 'delay',     posX: 250, posY: 800, configJson: { delay_type: 'attendi', giorni: 10 }, label: 'Attendi 10 giorni' },
    { id: 'action-3',  nodeType: 'action',    posX: 250, posY: 950, configJson: { action_type: 'update_field', entity_type: 'opportunity', field_key: 'status', field_value: 'stale' }, label: 'Segna stagnante' },
  ],
  connections: [
    { fromId: 'trigger-1', toId: 'action-1'  },
    { fromId: 'action-1',  toId: 'delay-2'   },
    { fromId: 'delay-2',   toId: 'action-2'  },
    { fromId: 'action-2',  toId: 'delay-3'   },
    { fromId: 'delay-3',   toId: 'action-3'  },
  ],
};

const T39: FlowTemplate = {
  id: 't39-preventivo-accettato-ordine',
  nome: 'Preventivo Accettato → Ordine Automatico',
  categoria: 'preventivi',
  descrizione: 'Accettazione → crea ordine automatico → notifica responsabile → crea task raccolta materiali → invia email conferma con data inizio.',
  icona: '✅',
  difficolta: 'intermedio',
  triggerTipo: 'quote_accepted',
  nodes: [
    { id: 'trigger-1', nodeType: 'trigger', posX: 250, posY: 50,  configJson: { trigger_type: 'quote_accepted' }, label: 'Preventivo accettato' },
    { id: 'action-1',  nodeType: 'action',  posX: 100, posY: 200, configJson: { action_type: 'create_order', description: 'Ordine da preventivo {{quote.title}} — {{contact.company_name}}', amount: '{{quote.total}}' }, label: 'Crea ordine' },
    { id: 'action-2',  nodeType: 'action',  posX: 400, posY: 200, configJson: { action_type: 'send_notification', titolo: '✅ Preventivo accettato!', testo: '{{contact.company_name}} ha accettato il preventivo da €{{quote.total}}' }, label: 'Notifica responsabile' },
    { id: 'action-3',  nodeType: 'action',  posX: 250, posY: 380, configJson: { action_type: 'create_task', titolo: '📦 Raccolta materiali per {{contact.company_name}}', priorita: 'alta', scadenza_giorni: 3 }, label: 'Task materiali' },
    { id: 'action-4',  nodeType: 'action',  posX: 250, posY: 530, configJson: { action_type: 'send_email', destinatario: '{{contact.email}}', oggetto: '✅ Ordine confermato — Ci vediamo presto!', corpo: 'Gentile {{contact.first_name}},\n\nAbbiamo ricevuto la conferma. Il tuo ordine è stato creato e ti contatteremo a breve per confermare la data di inizio lavori.\n\nCordiali saluti' }, label: 'Email conferma cliente' },
  ],
  connections: [
    { fromId: 'trigger-1', toId: 'action-1' },
    { fromId: 'trigger-1', toId: 'action-2' },
    { fromId: 'action-1',  toId: 'action-3' },
    { fromId: 'action-3',  toId: 'action-4' },
  ],
};

const T40: FlowTemplate = {
  id: 't40-manutenzione-scadenza-30gg',
  nome: 'Manutenzione in Scadenza (-30gg)',
  categoria: 'assistenza',
  descrizione: '30gg prima scadenza → WhatsApp cliente con link prenotazione → se non risponde -15gg → email formale → se non risponde -7gg → task a ufficio.',
  icona: '🔧',
  difficolta: 'avanzato',
  triggerTipo: 'manutenzione_scheduled',
  nodes: [
    { id: 'trigger-1', nodeType: 'trigger', posX: 250, posY: 50,  configJson: { trigger_type: 'manutenzione_scheduled', giorni_prima: 30 }, label: '-30gg manutenzione' },
    { id: 'action-1',  nodeType: 'action',  posX: 250, posY: 200, configJson: { action_type: 'send_whatsapp', destinatario: '{{contact.phone}}', testo: '🔧 Gentile {{contact.first_name}}, la manutenzione del tuo impianto è in scadenza tra 30 giorni. Prenota subito il tuo appuntamento rispondendo a questo messaggio!' }, label: 'WhatsApp -30gg' },
    { id: 'delay-1',   nodeType: 'delay',   posX: 250, posY: 350, configJson: { delay_type: 'attendi', giorni: 15 }, label: 'Attendi 15 giorni' },
    { id: 'action-2',  nodeType: 'action',  posX: 250, posY: 500, configJson: { action_type: 'send_email', destinatario: '{{contact.email}}', oggetto: 'Manutenzione impianto in scadenza tra 15 giorni', corpo: 'Gentile {{contact.first_name}},\n\nLa manutenzione programmata del tuo impianto è prevista tra 15 giorni. La invitiamo a contattarci per fissare l\'appuntamento.\n\nCordiali saluti' }, label: 'Email formale -15gg' },
    { id: 'delay-2',   nodeType: 'delay',   posX: 250, posY: 650, configJson: { delay_type: 'attendi', giorni: 8 }, label: 'Attendi 8 giorni' },
    { id: 'action-3',  nodeType: 'action',  posX: 250, posY: 800, configJson: { action_type: 'create_task', titolo: '⚠️ Manutenzione non prenotata: {{contact.company_name}} — scadenza imminente', priorita: 'alta', scadenza_giorni: 1 }, label: 'Task ufficio -7gg' },
  ],
  connections: [
    { fromId: 'trigger-1', toId: 'action-1' },
    { fromId: 'action-1',  toId: 'delay-1'  },
    { fromId: 'delay-1',   toId: 'action-2' },
    { fromId: 'action-2',  toId: 'delay-2'  },
    { fromId: 'delay-2',   toId: 'action-3' },
  ],
};

const T41: FlowTemplate = {
  id: 't41-fattura-scaduta-solleciti',
  nome: 'Fattura Scaduta — Sequenza Solleciti',
  categoria: 'fatturazione',
  descrizione: 'Gg 0: email gentile → gg 5: WhatsApp → gg 15: email tono urgente → gg 30: task legale + notifica admin → gg 60: segna credito inesigibile.',
  icona: '🚨',
  difficolta: 'avanzato',
  triggerTipo: 'invoice_overdue',
  nodes: [
    { id: 'trigger-1', nodeType: 'trigger', posX: 250, posY: 50,   configJson: { trigger_type: 'invoice_overdue' }, label: 'Fattura scaduta' },
    { id: 'action-1',  nodeType: 'action',  posX: 250, posY: 200,  configJson: { action_type: 'send_email', destinatario: '{{contact.email}}', oggetto: 'Promemoria pagamento fattura n. {{invoice.invoice_number}}', corpo: 'Gentile {{contact.first_name}},\n\nLa fattura n. {{invoice.invoice_number}} da €{{invoice.total}} risulta scaduta. La invitiamo a procedere al pagamento.\n\nCordiali saluti' }, label: 'Email gentile (gg 0)' },
    { id: 'delay-1',   nodeType: 'delay',   posX: 250, posY: 350,  configJson: { delay_type: 'attendi', giorni: 5 }, label: 'Attendi 5 giorni' },
    { id: 'action-2',  nodeType: 'action',  posX: 250, posY: 500,  configJson: { action_type: 'send_whatsapp', destinatario: '{{contact.phone}}', testo: '💳 Gentile {{contact.first_name}}, la fattura n.{{invoice.invoice_number}} da €{{invoice.total}} risulta ancora non pagata. La invitiamo a regolarizzare al più presto.' }, label: 'WhatsApp (gg 5)' },
    { id: 'delay-2',   nodeType: 'delay',   posX: 250, posY: 650,  configJson: { delay_type: 'attendi', giorni: 10 }, label: 'Attendi 10 giorni' },
    { id: 'action-3',  nodeType: 'action',  posX: 250, posY: 800,  configJson: { action_type: 'send_email', destinatario: '{{contact.email}}', oggetto: '⚠️ URGENTE — Fattura scaduta da 15 giorni — Azione richiesta', corpo: 'Gentile Cliente,\n\nNonostante i precedenti solleciti, la fattura n. {{invoice.invoice_number}} da €{{invoice.total}} risulta ancora insoluta. Se non riceveremo il pagamento entro 48 ore, ci vedremo costretti ad adottare misure legali.\n\nCordiali saluti' }, label: 'Email urgente (gg 15)' },
    { id: 'delay-3',   nodeType: 'delay',   posX: 250, posY: 950,  configJson: { delay_type: 'attendi', giorni: 15 }, label: 'Attendi 15 giorni' },
    { id: 'action-4',  nodeType: 'action',  posX: 100, posY: 1100, configJson: { action_type: 'create_task', titolo: '⚖️ Pratica legale: {{contact.company_name}} — Fattura {{invoice.invoice_number}} €{{invoice.total}}', priorita: 'urgente', scadenza_giorni: 1 }, label: 'Task legale (gg 30)' },
    { id: 'action-5',  nodeType: 'action',  posX: 400, posY: 1100, configJson: { action_type: 'send_notification', titolo: '🔴 Fattura insoluta da 30gg', testo: '{{contact.company_name}} — Fattura {{invoice.invoice_number}} €{{invoice.total}}' }, label: 'Notifica admin (gg 30)' },
  ],
  connections: [
    { fromId: 'trigger-1', toId: 'action-1' },
    { fromId: 'action-1',  toId: 'delay-1'  },
    { fromId: 'delay-1',   toId: 'action-2' },
    { fromId: 'action-2',  toId: 'delay-2'  },
    { fromId: 'delay-2',   toId: 'action-3' },
    { fromId: 'action-3',  toId: 'delay-3'  },
    { fromId: 'delay-3',   toId: 'action-4' },
    { fromId: 'delay-3',   toId: 'action-5' },
  ],
};

const T42: FlowTemplate = {
  id: 't42-recensione-post-lavori',
  nome: 'Richiesta Recensione Post-Lavori',
  categoria: 'crm',
  descrizione: 'Lavori completati → attendi 3 giorni → invia WhatsApp con link Google Review → se cliccato: aggiungi tag recensione_lasciata.',
  icona: '⭐',
  difficolta: 'base',
  triggerTipo: 'order_work_completed',
  nodes: [
    { id: 'trigger-1', nodeType: 'trigger', posX: 250, posY: 50,  configJson: { trigger_type: 'order_work_completed' }, label: 'Lavori completati' },
    { id: 'delay-1',   nodeType: 'delay',   posX: 250, posY: 200, configJson: { delay_type: 'attendi', giorni: 3 }, label: 'Attendi 3 giorni' },
    { id: 'action-1',  nodeType: 'action',  posX: 250, posY: 350, configJson: { action_type: 'send_whatsapp', destinatario: '{{contact.phone}}', testo: '⭐ Gentile {{contact.first_name}}, speriamo che i lavori siano stati di suo gradimento! Se è soddisfatto, ci farebbe molto piacere ricevere una recensione Google: {{company.google_review_link}} — Grazie mille!' }, label: 'WhatsApp link recensione' },
    { id: 'action-2',  nodeType: 'action',  posX: 250, posY: 500, configJson: { action_type: 'add_tag', tags: ['recensione_richiesta'] }, label: 'Tag recensione richiesta' },
  ],
  connections: [
    { fromId: 'trigger-1', toId: 'delay-1'  },
    { fromId: 'delay-1',   toId: 'action-1' },
    { fromId: 'action-1',  toId: 'action-2' },
  ],
};

const T43: FlowTemplate = {
  id: 't43-rinnovo-contratto-manutenzione',
  nome: 'Rinnovo Contratto Manutenzione',
  categoria: 'assistenza',
  descrizione: '60gg prima scadenza → email proposta rinnovo → attendi 15gg → se non rinnovato: chiama con agente AI → se rifiuta: segna churned.',
  icona: '🔄',
  difficolta: 'avanzato',
  triggerTipo: 'contratto_manut_expiring',
  nodes: [
    { id: 'trigger-1', nodeType: 'trigger', posX: 250, posY: 50,  configJson: { trigger_type: 'contratto_manut_expiring', giorni_prima: 60 }, label: '-60gg scadenza contratto' },
    { id: 'action-1',  nodeType: 'action',  posX: 250, posY: 200, configJson: { action_type: 'send_email', destinatario: '{{contact.email}}', oggetto: 'Proposta rinnovo contratto manutenzione', corpo: 'Gentile {{contact.first_name}},\n\nIl suo contratto di manutenzione scadrà tra 60 giorni ({{contratto.data_scadenza}}).\n\nSiamo lieti di proporle il rinnovo con le stesse condizioni vantaggiose. La contatteremo a breve.\n\nCordiali saluti' }, label: 'Email proposta rinnovo' },
    { id: 'delay-1',   nodeType: 'delay',   posX: 250, posY: 350, configJson: { delay_type: 'attendi', giorni: 15 }, label: 'Attendi 15 giorni' },
    { id: 'action-2',  nodeType: 'action',  posX: 250, posY: 500, configJson: { action_type: 'call_with_ai_agent', ai_agent_id: '' }, label: 'Chiamata AI rinnovo' },
    { id: 'delay-2',   nodeType: 'delay',   posX: 250, posY: 650, configJson: { delay_type: 'attendi', giorni: 5 }, label: 'Attendi risposta' },
    { id: 'action-3',  nodeType: 'action',  posX: 250, posY: 800, configJson: { action_type: 'add_tag', tags: ['contratto_non_rinnovato', 'at_risk_churn'] }, label: 'Tag churned risk' },
  ],
  connections: [
    { fromId: 'trigger-1', toId: 'action-1' },
    { fromId: 'action-1',  toId: 'delay-1'  },
    { fromId: 'delay-1',   toId: 'action-2' },
    { fromId: 'action-2',  toId: 'delay-2'  },
    { fromId: 'delay-2',   toId: 'action-3' },
  ],
};

const T44: FlowTemplate = {
  id: 't44-onboarding-nuovo-operaio',
  nome: 'Onboarding Nuovo Operaio',
  categoria: 'hr',
  descrizione: 'Nuovo dipendente → crea task consegna DPI → task formazione sicurezza → task setup account → invia email di benvenuto con accesso Area Campo.',
  icona: '👷',
  difficolta: 'intermedio',
  triggerTipo: 'dipendente_creato',
  nodes: [
    { id: 'trigger-1', nodeType: 'trigger', posX: 250, posY: 50,  configJson: { trigger_type: 'dipendente_creato' }, label: 'Nuovo dipendente' },
    { id: 'action-1',  nodeType: 'action',  posX: 100, posY: 200, configJson: { action_type: 'create_task', titolo: '🦺 Consegna DPI a {{dipendente.first_name}} {{dipendente.last_name}}', priorita: 'alta', scadenza_giorni: 1, note: 'Consegnare: elmetto, guanti, scarpe antinfortunistiche, gilet' }, label: 'Task consegna DPI' },
    { id: 'action-2',  nodeType: 'action',  posX: 400, posY: 200, configJson: { action_type: 'create_task', titolo: '📚 Formazione sicurezza: {{dipendente.first_name}} {{dipendente.last_name}}', priorita: 'alta', scadenza_giorni: 3, note: 'Corsi obbligatori: sicurezza base, primo soccorso, antincendio' }, label: 'Task formazione sicurezza' },
    { id: 'action-3',  nodeType: 'action',  posX: 250, posY: 380, configJson: { action_type: 'create_task', titolo: '💻 Setup account Area Campo: {{dipendente.first_name}} {{dipendente.last_name}}', priorita: 'media', scadenza_giorni: 2 }, label: 'Task setup account' },
    { id: 'action-4',  nodeType: 'action',  posX: 250, posY: 530, configJson: { action_type: 'send_email', destinatario: '{{dipendente.email}}', oggetto: '👋 Benvenuto in squadra, {{dipendente.first_name}}!', corpo: 'Ciao {{dipendente.first_name}},\n\nBenvenuto! Siamo felici di averti con noi.\n\nPuoi accedere all\'Area Campo dal link che riceverai separatamente. In caso di domande contatta il tuo responsabile.\n\nIn bocca al lupo!' }, label: 'Email benvenuto' },
  ],
  connections: [
    { fromId: 'trigger-1', toId: 'action-1' },
    { fromId: 'trigger-1', toId: 'action-2' },
    { fromId: 'action-1',  toId: 'action-3' },
    { fromId: 'action-3',  toId: 'action-4' },
  ],
};

const T45: FlowTemplate = {
  id: 't45-alert-costo-anomalo',
  nome: 'Alert Costo Anomalo',
  categoria: 'fatturazione',
  descrizione: 'Costo > €500 registrato → notifica in-app all\'admin → crea task di approvazione con scadenza 24h.',
  icona: '💸',
  difficolta: 'base',
  prontoAllUso: true,
  triggerTipo: 'costo_registrato',
  nodes: [
    { id: 'trigger-1', nodeType: 'trigger', posX: 250, posY: 50,  configJson: { trigger_type: 'costo_registrato', importo_minimo: 500 }, label: 'Costo > €500 registrato' },
    { id: 'action-1',  nodeType: 'action',  posX: 250, posY: 200, configJson: { action_type: 'send_notification', titolo: '⚠️ Costo anomalo registrato: €{{costo.importo}}', testo: 'Categoria: {{costo.categoria}} — Descrizione: {{costo.descrizione}} — Inserito da: {{costo.created_by_name}}' }, label: 'Notifica admin' },
    { id: 'action-2',  nodeType: 'action',  posX: 250, posY: 350, configJson: { action_type: 'create_task', titolo: '✅ Approva/rigetta costo €{{costo.importo}} — {{costo.descrizione}}', priorita: 'alta', scadenza_giorni: 1, note: 'Verifica se il costo è autorizzato. In caso contrario: contatta l\'inserente.' }, label: 'Task approvazione 24h' },
  ],
  connections: [
    { fromId: 'trigger-1', toId: 'action-1' },
    { fromId: 'action-1',  toId: 'action-2' },
  ],
};

const T46: FlowTemplate = {
  id: 't46-assegna-venditore-zona',
  nome: 'Assegna venditore per zona',
  categoria: 'crm',
  descrizione: 'Quando arriva un nuovo contatto di una determinata zona (regione, provincia o città), assegnalo in automatico al venditore di quella zona. Personalizza il filtro nel trigger (es. Regione = Lombardia) e scegli il venditore nell\'azione; duplica il flusso per ogni zona/venditore.',
  icona: '📍',
  difficolta: 'base',
  triggerTipo: 'contatto_creato',
  nodes: [
    { id: 'trigger-1', nodeType: 'trigger', posX: 250, posY: 50, configJson: { trigger_type: 'contatto_creato', trigger_filters: { logic: 'AND', conditions: [{ id: 'cond-zona', field: 'region', operator: 'equals', value: 'Lombardia' }] } }, label: 'Nuovo contatto (zona)' },
    { id: 'action-1', nodeType: 'action', posX: 250, posY: 200, configJson: { action_type: 'assegna_agente', entity_type: 'contacts', entity_id: '{{contatto.id}}', strategia: 'specifico', agente_id: '' }, label: 'Assegna al venditore di zona' },
  ],
  connections: [
    { fromId: 'trigger-1', toId: 'action-1' },
  ],
};

export const FLOW_TEMPLATES: FlowTemplate[] = [
  T46,
  T01, T02, T03, T04, T05, T06, T07,
  T08, T09, T10,
  T11, T12, T13,
  T14, T15, T16,
  T17, T18, T19,
  T20, T21, T22,
  T23, T24, T25,
  T26, T27, T28,
  T29, T30, T31,
  T32,
  T33, T34, T35,
  // Sprint 4A — Template verticali edilizia
  T36, T37, T38, T39, T40,
  T41, T42, T43, T44, T45,
];

// ── Helper maps ──

export const TEMPLATE_CATEGORIES: { value: string; label: string; emoji: string }[] = [
  { value: 'crm', label: 'CRM & Vendite', emoji: '👥' },
  { value: 'preventivi', label: 'Preventivi', emoji: '📋' },
  { value: 'fatturazione', label: 'Fatturazione', emoji: '💰' },
  { value: 'assistenza', label: 'Assistenza', emoji: '🎧' },
  { value: 'ordini', label: 'Ordini', emoji: '📦' },
  { value: 'magazzino', label: 'Magazzino', emoji: '🏭' },
  { value: 'cantieri', label: 'Cantieri', emoji: '🏗️' },
  { value: 'marketing', label: 'Marketing', emoji: '📣' },
  { value: 'hr', label: 'HR', emoji: '🧑‍💼' },
  { value: 'task', label: 'Task', emoji: '✅' },
  { value: 'generale', label: 'Generale', emoji: '⚙️' },
];

export const TEMPLATES_BY_CATEGORY = TEMPLATE_CATEGORIES.reduce<Record<string, FlowTemplate[]>>((acc, cat) => {
  acc[cat.value] = FLOW_TEMPLATES.filter(t => t.categoria === cat.value);
  return acc;
}, {});

export const DIFFICULTY_LABELS: Record<string, { label: string; color: string }> = {
  base: { label: 'Base', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' },
  intermedio: { label: 'Intermedio', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
  avanzato: { label: 'Avanzato', color: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400' },
};
