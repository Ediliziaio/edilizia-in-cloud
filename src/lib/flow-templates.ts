// src/lib/flow-templates.ts
// 35 template di automazione cross-domain definiti in-code.
// Quando attivati, vengono materializzati come automation_flows + automation_nodes + automation_connections.

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
    { id: 'action-2', nodeType: 'action', posX: 250, posY: 350, configJson: { action_type: 'crea_task', titolo: '🔥 URGENTE: Chiama {{contatto.nome}} entro 5 min', priorita: 'urgente', scadenza_giorni: 0, note: 'Lead da campagna: {{campagna.nome}}' }, label: 'Crea task urgente' },
    { id: 'action-3', nodeType: 'action', posX: 250, posY: 500, configJson: { action_type: 'invia_notifica_inapp', titolo: 'Nuovo lead Facebook: {{contatto.nome}}', testo: '📞 {{contatto.telefono}} | Campagna: {{campagna.nome}}' }, label: 'Notifica team' },
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
  triggerTipo: 'contatto_creato',
  nodes: [
    { id: 'trigger-1', nodeType: 'trigger', posX: 250, posY: 50, configJson: { trigger_type: 'contatto_creato' }, label: 'Nuovo contatto' },
    { id: 'action-1', nodeType: 'action', posX: 100, posY: 200, configJson: { action_type: 'invia_email', destinatario: '{{contatto.email}}', oggetto: 'Benvenuto! Abbiamo ricevuto la tua richiesta', corpo: 'Gentile {{contatto.nome}},\n\nGrazie per averci contattato. Un nostro consulente ti risponderà a breve.\n\nCordiali saluti' }, label: 'Email benvenuto' },
    { id: 'action-2', nodeType: 'action', posX: 400, posY: 200, configJson: { action_type: 'crea_task', titolo: 'Follow-up: {{contatto.nome}} ({{contatto.email}})', priorita: 'alta', scadenza_giorni: 1 }, label: 'Task follow-up' },
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
    { id: 'action-1', nodeType: 'action', posX: 100, posY: 200, configJson: { action_type: 'crea_bozza_ordine', cliente_id: '{{opportunita.contact_id}}', titolo: 'Ordine da deal: {{opportunita.nome}}', importo: '{{opportunita.valore}}' }, label: 'Crea ordine' },
    { id: 'action-2', nodeType: 'action', posX: 400, posY: 200, configJson: { action_type: 'crea_cantiere', nome: 'Commessa: {{opportunita.nome}}', cliente_id: '{{opportunita.contact_id}}', importo: '{{opportunita.valore}}' }, label: 'Apri cantiere' },
    { id: 'action-3', nodeType: 'action', posX: 250, posY: 380, configJson: { action_type: 'crea_task', titolo: 'Onboarding cliente: {{opportunita.contatto_nome}}', priorita: 'alta', scadenza_giorni: 2, note: 'Valore deal: €{{opportunita.valore}}' }, label: 'Task onboarding' },
    { id: 'action-4', nodeType: 'action', posX: 250, posY: 530, configJson: { action_type: 'invia_notifica_inapp', titolo: '🏆 Deal Vinto: {{opportunita.nome}}', testo: 'Valore: €{{opportunita.valore}} | Cliente: {{opportunita.contatto_nome}}' }, label: 'Notifica team' },
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
    { id: 'action-1', nodeType: 'action', posX: 250, posY: 200, configJson: { action_type: 'crea_task', titolo: 'Analisi perdita deal: {{opportunita.nome}} | Motivo: {{opportunita.motivo_perdita}}', priorita: 'media', scadenza_giorni: 3 }, label: 'Task analisi' },
    { id: 'delay-1', nodeType: 'delay', posX: 250, posY: 350, configJson: { delay_type: 'attendi', giorni: 30 }, label: 'Attendi 30 giorni' },
    { id: 'action-2', nodeType: 'action', posX: 250, posY: 500, configJson: { action_type: 'invia_email', destinatario: '{{opportunita.contatto_email}}', oggetto: 'Come possiamo migliorare per te?', corpo: 'Gentile {{opportunita.contatto_nome}},\n\nSappiamo che hai scelto una soluzione diversa. Siamo costantemente al lavoro per migliorare.\n\nSarebbe disponibile per una breve chiamata di feedback?\n\nCordiali saluti' }, label: 'Email ricontatto' },
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
    { id: 'action-1', nodeType: 'action', posX: 250, posY: 200, configJson: { action_type: 'invia_notifica_inapp', titolo: 'Nuovo contatto assegnato a te: {{contatto.nome}}', testo: '📧 {{contatto.email}} | 📞 {{contatto.telefono}}' }, label: 'Notifica agente' },
    { id: 'action-2', nodeType: 'action', posX: 250, posY: 380, configJson: { action_type: 'crea_task', titolo: 'Prima presa in carico: {{contatto.nome}}', priorita: 'alta', scadenza_giorni: 1 }, label: 'Task presa in carico' },
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
    { id: 'action-1', nodeType: 'action', posX: 100, posY: 200, configJson: { action_type: 'invia_whatsapp', numero: '{{appuntamento.contatto_telefono}}', messaggio: 'Ciao {{appuntamento.contatto_nome}}! Ti ricordiamo l\'appuntamento di domani con noi.' }, label: 'WhatsApp reminder' },
    { id: 'action-2', nodeType: 'action', posX: 400, posY: 200, configJson: { action_type: 'crea_task', titolo: 'Prepara materiali per: {{appuntamento.titolo}}', priorita: 'alta', scadenza_giorni: 0 }, label: 'Task preparazione' },
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
    { id: 'action-1', nodeType: 'action', posX: 100, posY: 200, configJson: { action_type: 'invia_sms', numero: '{{appuntamento.contatto_telefono}}', testo: 'Ciao {{appuntamento.contatto_nome}}, ci siamo persi! Chiamaci o rispondi per fissare un nuovo appuntamento.' }, label: 'SMS ricontatto' },
    { id: 'action-2', nodeType: 'action', posX: 400, posY: 200, configJson: { action_type: 'crea_task', titolo: 'No-show: ricontatta {{appuntamento.contatto_nome}} per nuovo slot', priorita: 'alta', scadenza_giorni: 0 }, label: 'Task nuovo slot' },
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
    { id: 'action-1', nodeType: 'action', posX: 100, posY: 200, configJson: { action_type: 'crea_bozza_ordine', cliente_id: '{{preventivo.contact_id}}', titolo: 'Ordine da prev. {{preventivo.numero}}', importo: '{{preventivo.importo}}' }, label: 'Crea ordine' },
    { id: 'action-2', nodeType: 'action', posX: 400, posY: 200, configJson: { action_type: 'crea_cantiere', nome: 'Commessa {{preventivo.numero}}', cliente_id: '{{preventivo.contact_id}}', importo: '{{preventivo.importo}}' }, label: 'Apri cantiere' },
    { id: 'action-3', nodeType: 'action', posX: 100, posY: 380, configJson: { action_type: 'crea_fattura', cliente_id: '{{preventivo.contact_id}}', importo: '{{preventivo.importo}}', descrizione: 'Fattura per preventivo {{preventivo.numero}}', scadenza_giorni: 30 }, label: 'Crea fattura' },
    { id: 'action-4', nodeType: 'action', posX: 400, posY: 380, configJson: { action_type: 'invia_email', destinatario: '{{preventivo.cliente_email}}', oggetto: 'Preventivo {{preventivo.numero}} confermato — Grazie!', corpo: 'Gentile {{preventivo.cliente_nome}},\n\nAbbiamo ricevuto la conferma del preventivo {{preventivo.numero}} per €{{preventivo.importo}}.\nSaremo presto in contatto per i dettagli operativi.\n\nCordiali saluti' }, label: 'Email conferma' },
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
    { id: 'action-1', nodeType: 'action', posX: 100, posY: 200, configJson: { action_type: 'invia_email', destinatario: '{{preventivo.cliente_email}}', oggetto: 'Il tuo preventivo scade tra 3 giorni', corpo: 'Gentile {{preventivo.cliente_nome}},\n\nTi ricordiamo che il preventivo {{preventivo.numero}} per €{{preventivo.importo}} scade tra 3 giorni.\n\nSiamo a disposizione per qualsiasi chiarimento.\n\nCordiali saluti' }, label: 'Email promemoria' },
    { id: 'action-2', nodeType: 'action', posX: 400, posY: 200, configJson: { action_type: 'crea_task', titolo: 'Follow-up preventivo {{preventivo.numero}} in scadenza — {{preventivo.cliente_nome}}', priorita: 'alta', scadenza_giorni: 1 }, label: 'Task follow-up' },
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
    { id: 'action-1', nodeType: 'action', posX: 250, posY: 200, configJson: { action_type: 'crea_task', titolo: 'Analizza rifiuto prev. {{preventivo.numero}} — {{preventivo.cliente_nome}}', priorita: 'media', scadenza_giorni: 2, note: 'Motivo: {{preventivo.motivo_rifiuto}}' }, label: 'Task analisi' },
    { id: 'delay-1', nodeType: 'delay', posX: 250, posY: 350, configJson: { delay_type: 'attendi', giorni: 7 }, label: 'Attendi 7 giorni' },
    { id: 'action-2', nodeType: 'action', posX: 250, posY: 500, configJson: { action_type: 'invia_email', destinatario: '{{preventivo.cliente_email}}', oggetto: 'Possiamo rivedere l\'offerta insieme?', corpo: 'Gentile {{preventivo.cliente_nome}},\n\nSappiamo che il nostro preventivo {{preventivo.numero}} non era quello che cercavi.\nSaremmo felici di rivedere l\'offerta in base alle tue esigenze.\n\nSarebbe disponibile per una chiamata?\n\nCordiali saluti' }, label: 'Email ricontatto' },
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
    { id: 'action-1', nodeType: 'action', posX: 250, posY: 200, configJson: { action_type: 'invia_email', destinatario: '{{fattura.cliente_email}}', oggetto: 'Promemoria: Fattura {{fattura.numero}} — gentile sollecito', corpo: 'Gentile {{fattura.cliente_nome}},\n\nVorremmo ricordarle che la fattura {{fattura.numero}} per €{{fattura.importo}} risulta scaduta.\n\nSe ha già provveduto al pagamento, la preghiamo di ignorare questo messaggio.\n\nGrazie per la collaborazione.' }, label: 'Email sollecito 1' },
    { id: 'delay-1', nodeType: 'delay', posX: 250, posY: 350, configJson: { delay_type: 'attendi', giorni: 4 }, label: 'Attendi 4 giorni' },
    { id: 'action-2', nodeType: 'action', posX: 250, posY: 500, configJson: { action_type: 'invia_sms', numero: '{{fattura.cliente_telefono}}', testo: 'Gentile {{fattura.cliente_nome}}, la fattura {{fattura.numero}} (€{{fattura.importo}}) è ancora in sospeso. Contattarci per regolarizzare.' }, label: 'SMS sollecito 2' },
    { id: 'delay-2', nodeType: 'delay', posX: 250, posY: 650, configJson: { delay_type: 'attendi', giorni: 8 }, label: 'Attendi 8 giorni' },
    { id: 'action-3', nodeType: 'action', posX: 250, posY: 800, configJson: { action_type: 'crea_task', titolo: '🚨 RECUPERO CREDITI: {{fattura.cliente_nome}} — FAT {{fattura.numero}} (€{{fattura.importo}})', priorita: 'urgente', scadenza_giorni: 0 }, label: 'Task recupero crediti' },
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
    { id: 'action-1', nodeType: 'action', posX: 100, posY: 200, configJson: { action_type: 'invia_email', destinatario: '{{pagamento.cliente_email}}', oggetto: 'Pagamento ricevuto — Grazie!', corpo: 'Gentile {{pagamento.cliente_nome}},\n\nConfermiamo la ricezione del pagamento di €{{pagamento.importo}} del {{pagamento.data}}.\n\nGrazie per la puntualità!' }, label: 'Email conferma' },
    { id: 'action-2', nodeType: 'action', posX: 400, posY: 200, configJson: { action_type: 'invia_notifica_inapp', titolo: '💵 Pagamento ricevuto: €{{pagamento.importo}}', testo: 'Cliente: {{pagamento.cliente_nome}} — Fattura: {{pagamento.fattura_numero}}' }, label: 'Notifica team' },
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
    { id: 'action-2', nodeType: 'action', posX: 400, posY: 200, configJson: { action_type: 'invia_notifica_inapp', titolo: '🚨 Ticket URGENTE: {{ticket.oggetto}}', testo: 'Cliente: {{ticket.cliente_nome}} — TKT-{{ticket.numero}}' }, label: 'Notifica manager' },
    { id: 'action-3', nodeType: 'action', posX: 250, posY: 380, configJson: { action_type: 'invia_email', destinatario: '{{ticket.cliente_email}}', oggetto: 'Ticket TKT-{{ticket.numero}} ricevuto — Priorità urgente', corpo: 'Gentile {{ticket.cliente_nome}},\n\nAbbiamo ricevuto la tua richiesta urgente (TKT-{{ticket.numero}}).\nUn tecnico la contatterà entro 1 ora.\n\nCordiali saluti' }, label: 'Email conferma' },
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
    { id: 'action-1', nodeType: 'action', posX: 250, posY: 350, configJson: { action_type: 'invia_email', destinatario: '{{ticket.cliente_email}}', oggetto: 'Il tuo ticket TKT-{{ticket.numero}} è risolto — Feedback?', corpo: 'Gentile {{ticket.cliente_nome}},\n\nIl ticket TKT-{{ticket.numero}} è stato risolto.\n\nSaresti disposto a lasciarci un breve feedback sull\'assistenza ricevuta?\n\nGrazie mille!' }, label: 'Email feedback' },
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
    { id: 'action-1', nodeType: 'action', posX: 100, posY: 200, configJson: { action_type: 'invia_notifica_inapp', titolo: '⚠️ Ticket TKT-{{ticket.numero}} senza risposta da 24h', testo: 'Cliente: {{ticket.cliente_nome}} | Oggetto: {{ticket.oggetto}}' }, label: 'Notifica agente' },
    { id: 'action-2', nodeType: 'action', posX: 400, posY: 200, configJson: { action_type: 'crea_task', titolo: 'ESCALATION: Rispondi a TKT-{{ticket.numero}} — {{ticket.cliente_nome}}', priorita: 'urgente', scadenza_giorni: 0 }, label: 'Task escalation' },
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
    { id: 'action-1', nodeType: 'action', posX: 100, posY: 200, configJson: { action_type: 'invia_email', destinatario: '{{ordine.cliente_email}}', oggetto: 'Ordine {{ordine.numero}} confermato!', corpo: 'Gentile {{ordine.cliente_nome}},\n\nIl tuo ordine {{ordine.numero}} è stato confermato e sarà pronto nei tempi concordati.\n\nGrazie per la fiducia!' }, label: 'Email conferma' },
    { id: 'action-2', nodeType: 'action', posX: 400, posY: 200, configJson: { action_type: 'crea_task', titolo: 'Avvia lavorazione ordine {{ordine.numero}} — {{ordine.cliente_nome}}', priorita: 'alta', scadenza_giorni: 1 }, label: 'Task lavorazione' },
    { id: 'action-3', nodeType: 'action', posX: 250, posY: 380, configJson: { action_type: 'invia_notifica_inapp', titolo: '📦 Nuovo ordine da lavorare: {{ordine.numero}}', testo: 'Cliente: {{ordine.cliente_nome}} — €{{ordine.importo}}' }, label: 'Notifica team' },
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
    { id: 'action-1', nodeType: 'action', posX: 100, posY: 200, configJson: { action_type: 'invia_email', destinatario: '{{ordine.cliente_email}}', oggetto: 'Il tuo ordine {{ordine.numero}} è in viaggio!', corpo: 'Gentile {{ordine.cliente_nome}},\n\nLa tua merce è stata spedita e arriverà a breve.\n\nPer qualsiasi informazione siamo disponibili!' }, label: 'Email spedizione' },
    { id: 'action-2', nodeType: 'action', posX: 400, posY: 200, configJson: { action_type: 'invia_whatsapp', numero: '{{ordine.cliente_telefono}}', messaggio: '✅ Il tuo ordine {{ordine.numero}} è partito! Ti aggiorneremo sull\'arrivo.' }, label: 'WhatsApp spedizione' },
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
    { id: 'action-1', nodeType: 'action', posX: 100, posY: 200, configJson: { action_type: 'invia_notifica_inapp', titolo: '⚠️ Ordine {{ordine.numero}} in ritardo di {{ordine.giorni_ritardo}} giorni', testo: 'Cliente: {{ordine.cliente_nome}} | Prevista: {{ordine.data_consegna_prevista}}' }, label: 'Notifica commerciale' },
    { id: 'action-2', nodeType: 'action', posX: 400, posY: 200, configJson: { action_type: 'invia_email', destinatario: '{{ordine.cliente_email}}', oggetto: 'Aggiornamento consegna ordine {{ordine.numero}}', corpo: 'Gentile {{ordine.cliente_nome}},\n\nVogliamo aggiornarla proattivamente: il suo ordine {{ordine.numero}} ha subito un ritardo.\nIl nostro team si è già attivato per risolvere la situazione.\n\nLa contatteremo con la nuova data di consegna.\n\nCi scusiamo per il disagio.' }, label: 'Email cliente' },
    { id: 'action-3', nodeType: 'action', posX: 250, posY: 380, configJson: { action_type: 'crea_task', titolo: '🚨 Gestisci ritardo ordine {{ordine.numero}} — contatta {{ordine.cliente_nome}}', priorita: 'urgente', scadenza_giorni: 0 }, label: 'Task gestione ritardo' },
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
    { id: 'action-1', nodeType: 'action', posX: 100, posY: 200, configJson: { action_type: 'crea_task', titolo: '⚠️ Riordina: {{prodotto.nome}} (attuale: {{prodotto.giacenza}} | min: {{prodotto.scorta_minima}})', priorita: 'alta', scadenza_giorni: 1 }, label: 'Task riordino' },
    { id: 'action-2', nodeType: 'action', posX: 400, posY: 200, configJson: { action_type: 'invia_notifica_inapp', titolo: 'Scorta minima: {{prodotto.nome}}', testo: 'Giacenza: {{prodotto.giacenza}} pz | Fornitore: {{prodotto.fornitore}}' }, label: 'Notifica responsabile' },
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
  descrizione: 'Quando un prodotto arriva a zero: notifica urgente al responsabile e task di riordino immediato con nota al commerciale.',
  icona: '🔴',
  difficolta: 'intermedio',
  triggerTipo: 'prodotto_esaurito',
  nodes: [
    { id: 'trigger-1', nodeType: 'trigger', posX: 250, posY: 50, configJson: { trigger_type: 'prodotto_esaurito' }, label: 'Prodotto esaurito' },
    { id: 'action-1', nodeType: 'action', posX: 100, posY: 200, configJson: { action_type: 'invia_notifica_inapp', titolo: '🔴 ESAURITO: {{prodotto.nome}}', testo: 'Il prodotto è a zero pezzi. Ordini in sospeso: {{prodotto.ordini_in_attesa}}' }, label: 'Alert urgente' },
    { id: 'action-2', nodeType: 'action', posX: 400, posY: 200, configJson: { action_type: 'crea_task', titolo: '🔴 URGENTE — Riordina {{prodotto.nome}} (ESAURITO)', priorita: 'urgente', scadenza_giorni: 0 }, label: 'Task riordino urgente' },
    { id: 'action-3', nodeType: 'action', posX: 250, posY: 380, configJson: { action_type: 'invia_notifica_inapp', titolo: '⚠️ Attenzione commerciale: {{prodotto.nome}} esaurito', testo: '{{prodotto.ordini_in_attesa}} ordini client in attesa. Aggiorna i clienti!' }, label: 'Notifica commerciale' },
  ],
  connections: [
    { fromId: 'trigger-1', toId: 'action-1' },
    { fromId: 'trigger-1', toId: 'action-2' },
    { fromId: 'action-2', toId: 'action-3' },
  ],
};

const T22: FlowTemplate = {
  id: 't22-whatsapp-ricevuto',
  nome: 'Messaggio WhatsApp ricevuto → Notifica e task risposta',
  categoria: 'marketing',
  descrizione: 'Quando arriva un messaggio WhatsApp da un contatto: notifica l\'agente assegnato e crea task di risposta rapida.',
  icona: '💬',
  difficolta: 'base',
  triggerTipo: 'messaggio_whatsapp_ricevuto',
  nodes: [
    { id: 'trigger-1', nodeType: 'trigger', posX: 250, posY: 50, configJson: { trigger_type: 'messaggio_whatsapp_ricevuto' }, label: 'WhatsApp ricevuto' },
    { id: 'action-1', nodeType: 'action', posX: 100, posY: 200, configJson: { action_type: 'invia_notifica_inapp', titolo: '💬 Messaggio WA da {{contatto.nome}}', testo: '{{messaggio.testo_preview}}' }, label: 'Notifica agente' },
    { id: 'action-2', nodeType: 'action', posX: 400, posY: 200, configJson: { action_type: 'crea_task', titolo: 'Rispondi a WhatsApp di {{contatto.nome}}', priorita: 'alta', scadenza_giorni: 0 }, label: 'Task risposta' },
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
  descrizione: 'Alla creazione di un nuovo cantiere: genera automaticamente i 4 task iniziali standard (documentazione, sopralluogo, pianificazione, sicurezza) e notifica il cliente.',
  icona: '🏗️',
  difficolta: 'avanzato',
  triggerTipo: 'cantiere_creato',
  nodes: [
    { id: 'trigger-1', nodeType: 'trigger', posX: 250, posY: 50, configJson: { trigger_type: 'cantiere_creato' }, label: 'Cantiere creato' },
    { id: 'action-1', nodeType: 'action', posX: 100, posY: 200, configJson: { action_type: 'crea_task', titolo: '📄 Raccolta documentazione: {{cantiere.nome}}', priorita: 'alta', scadenza_giorni: 2 }, label: 'Task documentazione' },
    { id: 'action-2', nodeType: 'action', posX: 400, posY: 200, configJson: { action_type: 'crea_task', titolo: '🔍 Sopralluogo: {{cantiere.nome}} — {{cantiere.indirizzo}}', priorita: 'alta', scadenza_giorni: 5 }, label: 'Task sopralluogo' },
    { id: 'action-3', nodeType: 'action', posX: 100, posY: 380, configJson: { action_type: 'crea_task', titolo: '📋 Piano operativo e timeline: {{cantiere.nome}}', priorita: 'media', scadenza_giorni: 7 }, label: 'Task pianificazione' },
    { id: 'action-4', nodeType: 'action', posX: 400, posY: 380, configJson: { action_type: 'crea_task', titolo: '⛑️ Piano sicurezza cantiere: {{cantiere.nome}}', priorita: 'alta', scadenza_giorni: 5 }, label: 'Task sicurezza' },
    { id: 'action-5', nodeType: 'action', posX: 250, posY: 560, configJson: { action_type: 'invia_email', destinatario: '{{cantiere.cliente_email}}', oggetto: 'Cantiere {{cantiere.nome}} aperto — Benvenuto!', corpo: 'Gentile {{cantiere.cliente_nome}},\n\nAbbiamo aperto il cantiere per i suoi lavori.\nIl responsabile la contatterà nei prossimi giorni per i dettagli operativi.\n\nCordiali saluti' }, label: 'Email benvenuto' },
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
    { id: 'action-1', nodeType: 'action', posX: 100, posY: 200, configJson: { action_type: 'invia_email', destinatario: '{{cantiere.cliente_email}}', oggetto: 'Aggiornamento lavori: {{fase.nome}} completata', corpo: 'Gentile {{cantiere.cliente_nome}},\n\nAbbiamo completato la fase {{fase.nome}} del cantiere {{cantiere.nome}}.\n\nStiamo procedendo con la fase successiva nei tempi previsti.\n\nCordiali saluti' }, label: 'Email aggiornamento' },
    { id: 'action-2', nodeType: 'action', posX: 400, posY: 200, configJson: { action_type: 'crea_task', titolo: 'Avvia fase successiva: {{fase.fase_successiva}} — {{cantiere.nome}}', priorita: 'alta', scadenza_giorni: 1 }, label: 'Task prossima fase' },
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
    { id: 'action-1', nodeType: 'action', posX: 250, posY: 200, configJson: { action_type: 'invia_notifica_inapp', titolo: '🚧 Cantiere in ritardo: {{cantiere.nome}}', testo: 'Ritardo: {{cantiere.giorni_ritardo}} giorni | Cliente: {{cantiere.cliente_nome}}' }, label: 'Notifica management' },
    { id: 'action-2', nodeType: 'action', posX: 250, posY: 350, configJson: { action_type: 'crea_task', titolo: 'Piano recupero ritardo: {{cantiere.nome}} ({{cantiere.giorni_ritardo}} giorni)', priorita: 'urgente', scadenza_giorni: 0 }, label: 'Task piano recupero' },
    { id: 'action-3', nodeType: 'action', posX: 250, posY: 500, configJson: { action_type: 'invia_email', destinatario: '{{cantiere.cliente_email}}', oggetto: 'Aggiornamento tempistiche cantiere {{cantiere.nome}}', corpo: 'Gentile {{cantiere.cliente_nome}},\n\nVogliamo aggiornarla proattivamente: il cantiere {{cantiere.nome}} ha subito un ritardo.\nIl nostro team è già al lavoro per recuperare i tempi.\n\nLa contatteremo a breve con un aggiornamento dettagliato.\n\nCi scusiamo per il disagio.' }, label: 'Email cliente' },
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
    { id: 'action-1', nodeType: 'action', posX: 100, posY: 200, configJson: { action_type: 'invia_email', destinatario: '{{form.email}}', oggetto: 'Abbiamo ricevuto la tua richiesta!', corpo: 'Gentile {{form.nome}},\n\nGrazie per averci contattato!\nUn nostro consulente ti risponderà nelle prossime ore.\n\nCordiali saluti' }, label: 'Email risposta' },
    { id: 'action-2', nodeType: 'action', posX: 400, posY: 200, configJson: { action_type: 'crea_opportunita', nome: 'Lead web: {{form.nome}}', stage: 'nuovo_lead', valore: 0, note: 'Compilato da: {{form.pagina_origine}}' }, label: 'Crea opportunità' },
    { id: 'action-3', nodeType: 'action', posX: 250, posY: 380, configJson: { action_type: 'crea_task', titolo: '🌐 Lead sito: {{form.nome}} ({{form.telefono}})', priorita: 'alta', scadenza_giorni: 0 }, label: 'Task follow-up' },
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
    { id: 'action-1', nodeType: 'action', posX: 250, posY: 200, configJson: { action_type: 'crea_task', titolo: '🔥 Lead caldo: {{contatto.nome}} ha aperto email — Contattare subito!', priorita: 'alta', scadenza_giorni: 0 }, label: 'Task ricontatto' },
    { id: 'action-2', nodeType: 'action', posX: 250, posY: 380, configJson: { action_type: 'invia_notifica_inapp', titolo: 'Lead caldo: {{contatto.nome}}', testo: 'Ha aperto: {{campagna.nome}} | 📞 {{contatto.telefono}}' }, label: 'Notifica commerciale' },
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
    { id: 'action-1', nodeType: 'action', posX: 100, posY: 200, configJson: { action_type: 'crea_opportunita', nome: 'Interesse da email: {{contatto.nome}}', stage: 'interessato', valore: 0, note: 'Link cliccato: {{email.link_cliccato}} | Campagna: {{campagna.nome}}' }, label: 'Crea opportunità' },
    { id: 'action-2', nodeType: 'action', posX: 400, posY: 200, configJson: { action_type: 'invia_notifica_inapp', titolo: '🖱️ {{contatto.nome}} ha cliccato email!', testo: 'Link: {{email.link_cliccato}} | Opportunità creata' }, label: 'Notifica commerciale' },
    { id: 'action-3', nodeType: 'action', posX: 250, posY: 380, configJson: { action_type: 'crea_task', titolo: 'Contatta: {{contatto.nome}} (ha cliccato su {{email.link_cliccato}})', priorita: 'alta', scadenza_giorni: 0 }, label: 'Task contatto' },
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
  descrizione: 'Quando viene aggiunto un nuovo dipendente: email di benvenuto + 4 task di onboarding progressivi (setup, formazione, check-in settimana 1, check-in mese 1).',
  icona: '🧑‍💼',
  difficolta: 'avanzato',
  triggerTipo: 'dipendente_creato',
  nodes: [
    { id: 'trigger-1', nodeType: 'trigger', posX: 250, posY: 50, configJson: { trigger_type: 'dipendente_creato' }, label: 'Nuovo dipendente' },
    { id: 'action-1', nodeType: 'action', posX: 100, posY: 200, configJson: { action_type: 'invia_email', destinatario: '{{dipendente.email}}', oggetto: 'Benvenuto in azienda, {{dipendente.nome}}!', corpo: 'Caro/a {{dipendente.nome}},\n\nSiamo felici di averti nel team!\nNei prossimi giorni riceverai tutte le info necessarie per iniziare.\n\nBenvenuto/a!' }, label: 'Email benvenuto' },
    { id: 'action-2', nodeType: 'action', posX: 400, posY: 200, configJson: { action_type: 'crea_task', titolo: 'Setup credenziali e account: {{dipendente.nome}}', priorita: 'alta', scadenza_giorni: 1 }, label: 'Task setup' },
    { id: 'action-3', nodeType: 'action', posX: 100, posY: 380, configJson: { action_type: 'crea_task', titolo: 'Formazione iniziale: {{dipendente.nome}} (ruolo: {{dipendente.ruolo}})', priorita: 'alta', scadenza_giorni: 3 }, label: 'Task formazione' },
    { id: 'action-4', nodeType: 'action', posX: 400, posY: 380, configJson: { action_type: 'crea_task', titolo: 'Check-in settimana 1: come va {{dipendente.nome}}?', priorita: 'media', scadenza_giorni: 7 }, label: 'Task check-in 1' },
    { id: 'action-5', nodeType: 'action', posX: 250, posY: 560, configJson: { action_type: 'crea_task', titolo: 'Check-in mese 1 e valutazione onboarding: {{dipendente.nome}}', priorita: 'media', scadenza_giorni: 30 }, label: 'Task check-in 2' },
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
    { id: 'action-1', nodeType: 'action', posX: 100, posY: 200, configJson: { action_type: 'crea_task', titolo: '⚠️ Contratto in scadenza fra 30gg: {{dipendente.nome}} ({{contratto.scadenza}})', priorita: 'alta', scadenza_giorni: 7 }, label: 'Task revisione' },
    { id: 'action-2', nodeType: 'action', posX: 400, posY: 200, configJson: { action_type: 'invia_notifica_inapp', titolo: 'Contratto in scadenza: {{dipendente.nome}}', testo: 'Scade il {{contratto.scadenza}} — {{contratto.giorni_rimanenti}} giorni rimanenti' }, label: 'Notifica HR' },
    { id: 'action-3', nodeType: 'action', posX: 250, posY: 380, configJson: { action_type: 'invia_email', destinatario: '{{dipendente.email}}', oggetto: 'Il tuo contratto scade il {{contratto.scadenza}}', corpo: 'Caro/a {{dipendente.nome}},\n\nTi comunichiamo che il tuo contratto scadrà il {{contratto.scadenza}}.\nIl responsabile HR ti contatterà a breve per discutere del rinnovo.\n\nCordiali saluti' }, label: 'Email dipendente' },
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
    { id: 'action-1', nodeType: 'action', posX: 100, posY: 200, configJson: { action_type: 'invia_notifica_inapp', titolo: 'Richiesta ferie: {{dipendente.nome}}', testo: 'Dal {{ferie.data_inizio}} al {{ferie.data_fine}} ({{ferie.giorni}} giorni)' }, label: 'Notifica manager' },
    { id: 'action-2', nodeType: 'action', posX: 400, posY: 200, configJson: { action_type: 'crea_task', titolo: 'Approva ferie {{dipendente.nome}}: {{ferie.data_inizio}} → {{ferie.data_fine}}', priorita: 'media', scadenza_giorni: 2 }, label: 'Task approvazione' },
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
    { id: 'action-1', nodeType: 'action', posX: 250, posY: 200, configJson: { action_type: 'invia_notifica_inapp', titolo: '⚠️ Task scaduto: {{task.titolo}}', testo: 'In ritardo di {{task.giorni_ritardo}} giorni | Assegnato a: {{task.assegnato_a}}' }, label: 'Notifica manager' },
    { id: 'action-2', nodeType: 'action', posX: 250, posY: 380, configJson: { action_type: 'crea_task', titolo: 'ESCALATION: verifica ritardo {{task.giorni_ritardo}}gg — {{task.titolo}}', priorita: 'urgente', scadenza_giorni: 0 }, label: 'Task escalation' },
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

export const FLOW_TEMPLATES: FlowTemplate[] = [
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
