# FLOW-EXT-03 · Template Cross-Domain — Automazioni Preconfigurate

## Obiettivo
Creare un set di 35+ template di automazione preconfigurati che coprono
i casi d'uso reali più importanti dell'azienda, con flow multi-step che
attraversano più domini (CRM → Operativo, Vendite → Fatturazione,
Magazzino → Ordini, HR → Task, ecc.).

---

## Prompt per Lovable

```
## Contesto

Il catalogo dei trigger e delle azioni è stato espanso (FLOW-EXT-02)
con 34 trigger e 22 azioni che coprono tutti i domini aziendali.
Ora dobbiamo creare i template preconfigurati che gli utenti possono
attivare con un click dalla galleria dei template.

## Task — Popola i template nel database

Esegui questa migration SQL che inserisce 35+ template di automazione
cross-domain come flow completi (nodi + edges nel formato React Flow).

### STEP 0 — Verifica struttura template nel DB

```sql
-- Verifica colonne template sulla tabella flows
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'flows'
ORDER BY ordinal_position;

-- Aggiungi colonne template se mancanti
ALTER TABLE flows ADD COLUMN IF NOT EXISTS
  is_template BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE flows ADD COLUMN IF NOT EXISTS
  template_descrizione TEXT;

ALTER TABLE flows ADD COLUMN IF NOT EXISTS
  template_icona TEXT;

ALTER TABLE flows ADD COLUMN IF NOT EXISTS
  template_categoria_display TEXT; -- label leggibile per la galleria

ALTER TABLE flows ADD COLUMN IF NOT EXISTS
  template_difficolta TEXT CHECK (
    template_difficolta IN ('base', 'intermedio', 'avanzato')
  ) DEFAULT 'base';

-- I template globali hanno company_id = NULL
ALTER TABLE flows ALTER COLUMN company_id DROP NOT NULL;

-- Indice ottimizzato per la galleria template
CREATE INDEX IF NOT EXISTS idx_flows_template_cat
  ON flows (is_template, categoria, template_difficolta)
  WHERE is_template = true;
```

---

### STEP 1 — Helper functions (temporanee per la migration)

```sql
CREATE OR REPLACE FUNCTION make_trigger_node(
  p_subtype TEXT, p_config JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB AS $$
BEGIN
  RETURN jsonb_build_object(
    'id', 'trigger-1',
    'type', 'trigger',
    'position', jsonb_build_object('x', 250, 'y', 50),
    'data', jsonb_build_object(
      'subtype', p_subtype,
      'label', p_subtype,
      'isConfigured', true,
      'config', p_config
    )
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION make_action_node(
  p_id TEXT,
  p_subtype TEXT,
  p_config JSONB,
  p_pos_x INT DEFAULT 250,
  p_pos_y INT DEFAULT 200
) RETURNS JSONB AS $$
BEGIN
  RETURN jsonb_build_object(
    'id', p_id,
    'type', 'action',
    'position', jsonb_build_object('x', p_pos_x, 'y', p_pos_y),
    'data', jsonb_build_object(
      'subtype', p_subtype,
      'label', p_subtype,
      'isConfigured', true,
      'config', p_config
    )
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION make_condition_node(
  p_id TEXT,
  p_config JSONB,
  p_pos_x INT DEFAULT 250,
  p_pos_y INT DEFAULT 200
) RETURNS JSONB AS $$
BEGIN
  RETURN jsonb_build_object(
    'id', p_id,
    'type', 'condition',
    'position', jsonb_build_object('x', p_pos_x, 'y', p_pos_y),
    'data', jsonb_build_object(
      'subtype', 'condition_se',
      'label', 'Condizione',
      'isConfigured', true,
      'config', p_config
    )
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION make_edge(
  p_from TEXT,
  p_to TEXT,
  p_handle TEXT DEFAULT NULL,
  p_label TEXT DEFAULT NULL
) RETURNS JSONB AS $$
BEGIN
  RETURN jsonb_build_object(
    'id', p_from || '->' || p_to,
    'source', p_from,
    'target', p_to,
    'sourceHandle', p_handle,
    'label', p_label,
    'animated', true,
    'style', jsonb_build_object('stroke', '#6366f1')
  );
END;
$$ LANGUAGE plpgsql;
```

---

### STEP 2 — Seed dei template

```sql
-- ════════════════════════════════════════════════════════════════
-- CATEGORIA: CRM & VENDITE (T01–T07)
-- ════════════════════════════════════════════════════════════════

-- T01: Lead Facebook → Contatto CRM + Task chiamata urgente + Notifica
INSERT INTO flows (
  id, company_id, nome, categoria, stato, is_template,
  template_descrizione, template_icona, template_difficolta, trigger_tipo,
  nodi, edges
) VALUES (
  gen_random_uuid(), NULL,
  'Lead Facebook → Contatta subito',
  'marketing', 'bozza', true,
  'Quando arriva un lead da campagna Facebook: assegna il contatto al primo agente disponibile, crea un task di chiamata urgente e invia notifica al team.',
  '📘', 'base',
  'campagna_facebook_lead',
  jsonb_build_array(
    make_trigger_node('campagna_facebook_lead'),
    make_action_node('action-1', 'assegna_agente',
      '{"entity_type":"contacts","entity_id":"{{contatto.id}}","strategia":"round_robin"}'::jsonb, 250, 200),
    make_action_node('action-2', 'crea_task',
      '{"titolo":"🔥 URGENTE: Chiama {{lead.nome}} entro 5 min","priorita":"urgente","scadenza_giorni":0,"note":"Lead da campagna: {{campagna.nome}}"}'::jsonb, 250, 350),
    make_action_node('action-3', 'invia_notifica_inapp',
      '{"titolo":"Nuovo lead Facebook: {{lead.nome}}","testo":"📞 {{lead.telefono}} | Campagna: {{campagna.nome}}"}'::jsonb, 250, 500)
  ),
  jsonb_build_array(
    make_edge('trigger-1', 'action-1'),
    make_edge('action-1', 'action-2'),
    make_edge('action-2', 'action-3')
  )
) ON CONFLICT DO NOTHING;

-- T02: Nuovo contatto (qualsiasi fonte) → Email benvenuto + Task follow-up
INSERT INTO flows (
  id, company_id, nome, categoria, stato, is_template,
  template_descrizione, template_icona, template_difficolta, trigger_tipo, nodi, edges
) VALUES (
  gen_random_uuid(), NULL,
  'Nuovo contatto → Benvenuto + Follow-up',
  'crm', 'bozza', true,
  'Alla creazione di qualsiasi nuovo contatto: invia email di benvenuto personalizzata e crea task di follow-up per l''agente assegnato.',
  '👤', 'base',
  'contatto_creato',
  jsonb_build_array(
    make_trigger_node('contatto_creato'),
    make_action_node('action-1', 'invia_email',
      '{"destinatario":"{{contatto.email}}","oggetto":"Benvenuto! Abbiamo ricevuto la tua richiesta","corpo":"Gentile {{contatto.nome}},\n\nGrazie per averci contattato. Un nostro consulente ti risponderà a breve.\n\nCordiali saluti"}'::jsonb, 100, 200),
    make_action_node('action-2', 'crea_task',
      '{"titolo":"Follow-up: {{contatto.nome}} ({{contatto.email}})","priorita":"alta","scadenza_giorni":1}'::jsonb, 400, 200)
  ),
  jsonb_build_array(
    make_edge('trigger-1', 'action-1'),
    make_edge('trigger-1', 'action-2')
  )
) ON CONFLICT DO NOTHING;

-- T03: Opportunità vinta → Crea ordine + Apri cantiere + Notifica team
INSERT INTO flows (
  id, company_id, nome, categoria, stato, is_template,
  template_descrizione, template_icona, template_difficolta, trigger_tipo, nodi, edges
) VALUES (
  gen_random_uuid(), NULL,
  'Deal Vinto → Pipeline post-vendita completa',
  'crm', 'bozza', true,
  'Il workflow post-vendita definitivo: opportunità vinta → crea bozza ordine, apre cantiere/commessa, task onboarding cliente e notifica tutto il team.',
  '🏆', 'avanzato',
  'opportunita_vinta',
  jsonb_build_array(
    make_trigger_node('opportunita_vinta'),
    make_action_node('action-1', 'crea_bozza_ordine',
      '{"cliente_id":"{{opportunita.contact_id}}","titolo":"Ordine da deal: {{opportunita.nome}}","importo":"{{opportunita.valore}}"}'::jsonb, 100, 200),
    make_action_node('action-2', 'crea_cantiere',
      '{"nome":"Commessa: {{opportunita.nome}}","cliente_id":"{{opportunita.contact_id}}","importo":"{{opportunita.valore}}"}'::jsonb, 400, 200),
    make_action_node('action-3', 'crea_task',
      '{"titolo":"Onboarding cliente: {{opportunita.contatto_nome}}","priorita":"alta","scadenza_giorni":2,"note":"Valore deal: €{{opportunita.valore}}"}'::jsonb, 250, 380),
    make_action_node('action-4', 'invia_notifica_inapp',
      '{"titolo":"🏆 Deal Vinto: {{opportunita.nome}}","testo":"Valore: €{{opportunita.valore}} | Cliente: {{opportunita.contatto_nome}}"}'::jsonb, 250, 530)
  ),
  jsonb_build_array(
    make_edge('trigger-1', 'action-1'),
    make_edge('trigger-1', 'action-2'),
    make_edge('action-1', 'action-3'),
    make_edge('action-3', 'action-4')
  )
) ON CONFLICT DO NOTHING;

-- T04: Deal Perso → Analisi + Ricontatto automatico dopo 30 giorni
INSERT INTO flows (
  id, company_id, nome, categoria, stato, is_template,
  template_descrizione, template_icona, template_difficolta, trigger_tipo, nodi, edges
) VALUES (
  gen_random_uuid(), NULL,
  'Deal Perso → Recupero automatico 30 giorni',
  'crm', 'bozza', true,
  'Quando un''opportunità viene persa: crea task di analisi, aspetta 30 giorni e invia email di ricontatto per tentare il recupero.',
  '❌', 'intermedio',
  'opportunita_persa',
  jsonb_build_array(
    make_trigger_node('opportunita_persa'),
    make_action_node('action-1', 'crea_task',
      '{"titolo":"Analisi perdita deal: {{opportunita.nome}} | Motivo: {{opportunita.motivo_perdita}}","priorita":"media","scadenza_giorni":3}'::jsonb, 250, 200),
    make_action_node('action-2', 'attendi',
      '{"giorni":30}'::jsonb, 250, 350),
    make_action_node('action-3', 'invia_email',
      '{"destinatario":"{{opportunita.contatto_email}}","oggetto":"Come possiamo migliorare per te?","corpo":"Gentile {{opportunita.contatto_nome}},\n\nSappiamo che hai scelto una soluzione diversa. Siamo costantemente al lavoro per migliorare.\n\nSarebbe disponibile per una breve chiamata di feedback?\n\nCordiali saluti"}'::jsonb, 250, 500)
  ),
  jsonb_build_array(
    make_edge('trigger-1', 'action-1'),
    make_edge('action-1', 'action-2'),
    make_edge('action-2', 'action-3')
  )
) ON CONFLICT DO NOTHING;

-- T05: Contatto assegnato → Notifica agente + Task presentazione
INSERT INTO flows (
  id, company_id, nome, categoria, stato, is_template,
  template_descrizione, template_icona, template_difficolta, trigger_tipo, nodi, edges
) VALUES (
  gen_random_uuid(), NULL,
  'Contatto assegnato → Notifica agente + Task',
  'crm', 'bozza', true,
  'Quando un contatto viene assegnato a un agente: notifica l''agente e crea task di prima presa in carico.',
  '👋', 'base',
  'contatto_assegnato',
  jsonb_build_array(
    make_trigger_node('contatto_assegnato'),
    make_action_node('action-1', 'invia_notifica_inapp',
      '{"titolo":"Nuovo contatto assegnato a te: {{contatto.nome}}","testo":"📧 {{contatto.email}} | 📞 {{contatto.telefono}}"}'::jsonb, 250, 200),
    make_action_node('action-2', 'crea_task',
      '{"titolo":"Prima presa in carico: {{contatto.nome}}","priorita":"alta","scadenza_giorni":1}'::jsonb, 250, 380)
  ),
  jsonb_build_array(
    make_edge('trigger-1', 'action-1'),
    make_edge('action-1', 'action-2')
  )
) ON CONFLICT DO NOTHING;

-- T06: Appuntamento confermato → Reminder WhatsApp + Task preparazione
INSERT INTO flows (
  id, company_id, nome, categoria, stato, is_template,
  template_descrizione, template_icona, template_difficolta, trigger_tipo, nodi, edges
) VALUES (
  gen_random_uuid(), NULL,
  'Appuntamento confermato → Reminder automatico',
  'crm', 'bozza', true,
  'Quando un appuntamento viene confermato: invia reminder WhatsApp al cliente e crea task di preparazione per l''agente.',
  '📅', 'base',
  'appuntamento_confermato',
  jsonb_build_array(
    make_trigger_node('appuntamento_confermato'),
    make_action_node('action-1', 'invia_whatsapp',
      '{"numero":"{{appuntamento.contatto_telefono}}","messaggio":"Ciao {{appuntamento.contatto_nome}}! Ti ricordiamo l''appuntamento di domani con noi. Per qualsiasi necessità rispondi a questo messaggio."}'::jsonb, 100, 200),
    make_action_node('action-2', 'crea_task',
      '{"titolo":"Prepara materiali per: {{appuntamento.titolo}}","priorita":"alta","scadenza_giorni":0}'::jsonb, 400, 200)
  ),
  jsonb_build_array(
    make_edge('trigger-1', 'action-1'),
    make_edge('trigger-1', 'action-2')
  )
) ON CONFLICT DO NOTHING;

-- T07: No-show appuntamento → SMS ricontatto + Task nuovo appuntamento
INSERT INTO flows (
  id, company_id, nome, categoria, stato, is_template,
  template_descrizione, template_icona, template_difficolta, trigger_tipo, nodi, edges
) VALUES (
  gen_random_uuid(), NULL,
  'No-show → Ricontatto e nuovo appuntamento',
  'crm', 'bozza', true,
  'Quando un cliente non si presenta: SMS di ricontatto immediato e task urgente per fissare un nuovo appuntamento.',
  '🚫', 'base',
  'appuntamento_no_show',
  jsonb_build_array(
    make_trigger_node('appuntamento_no_show'),
    make_action_node('action-1', 'invia_sms',
      '{"numero":"{{appuntamento.contatto_telefono}}","testo":"Ciao {{appuntamento.contatto_nome}}, ci siamo persi! Chiamaci o rispondi per fissare un nuovo appuntamento."}'::jsonb, 100, 200),
    make_action_node('action-2', 'crea_task',
      '{"titolo":"No-show: ricontatta {{appuntamento.contatto_nome}} per nuovo slot","priorita":"alta","scadenza_giorni":0}'::jsonb, 400, 200)
  ),
  jsonb_build_array(
    make_edge('trigger-1', 'action-1'),
    make_edge('trigger-1', 'action-2')
  )
) ON CONFLICT DO NOTHING;

-- ════════════════════════════════════════════════════════════════
-- CATEGORIA: PREVENTIVI (T08–T10)
-- ════════════════════════════════════════════════════════════════

-- T08: Preventivo accettato → Pipeline completa (ordine + cantiere + fattura + email)
INSERT INTO flows (
  id, company_id, nome, categoria, stato, is_template,
  template_descrizione, template_icona, template_difficolta, trigger_tipo, nodi, edges
) VALUES (
  gen_random_uuid(), NULL,
  'Preventivo Accettato → Pipeline completa',
  'preventivi', 'bozza', true,
  'Il workflow più importante: preventivo accettato → crea ordine, apre cantiere, prepara bozza fattura ed email di conferma al cliente.',
  '✅', 'avanzato',
  'preventivo_accettato',
  jsonb_build_array(
    make_trigger_node('preventivo_accettato'),
    make_action_node('action-1', 'crea_bozza_ordine',
      '{"cliente_id":"{{preventivo.contact_id}}","titolo":"Ordine da prev. {{preventivo.numero}}","importo":"{{preventivo.importo}}"}'::jsonb, 100, 200),
    make_action_node('action-2', 'crea_cantiere',
      '{"nome":"Commessa {{preventivo.numero}}","cliente_id":"{{preventivo.contact_id}}","importo":"{{preventivo.importo}}"}'::jsonb, 400, 200),
    make_action_node('action-3', 'crea_fattura',
      '{"cliente_id":"{{preventivo.contact_id}}","importo":"{{preventivo.importo}}","descrizione":"Fattura per preventivo {{preventivo.numero}}","scadenza_giorni":30}'::jsonb, 100, 380),
    make_action_node('action-4', 'invia_email',
      '{"destinatario":"{{preventivo.cliente_email}}","oggetto":"Preventivo {{preventivo.numero}} confermato — Grazie!","corpo":"Gentile {{preventivo.cliente_nome}},\n\nAbbiamo ricevuto la conferma del preventivo {{preventivo.numero}} per €{{preventivo.importo}}.\nSaremo presto in contatto per i dettagli operativi.\n\nCordiali saluti"}'::jsonb, 400, 380)
  ),
  jsonb_build_array(
    make_edge('trigger-1', 'action-1'),
    make_edge('trigger-1', 'action-2'),
    make_edge('action-1', 'action-3'),
    make_edge('action-2', 'action-4')
  )
) ON CONFLICT DO NOTHING;

-- T09: Preventivo in scadenza (3 giorni) → Follow-up email + Task
INSERT INTO flows (
  id, company_id, nome, categoria, stato, is_template,
  template_descrizione, template_icona, template_difficolta, trigger_tipo, nodi, edges
) VALUES (
  gen_random_uuid(), NULL,
  'Preventivo in scadenza → Follow-up cliente',
  'preventivi', 'bozza', true,
  '3 giorni prima della scadenza di un preventivo senza risposta: invia email di promemoria al cliente e crea task per l''agente.',
  '⏳', 'base',
  'preventivo_in_scadenza',
  jsonb_build_array(
    make_trigger_node('preventivo_in_scadenza', '{"giorni_prima":3}'::jsonb),
    make_action_node('action-1', 'invia_email',
      '{"destinatario":"{{preventivo.cliente_email}}","oggetto":"Il tuo preventivo scade tra 3 giorni","corpo":"Gentile {{preventivo.cliente_nome}},\n\nTi ricordiamo che il preventivo {{preventivo.numero}} per €{{preventivo.importo}} scade tra 3 giorni.\n\nSiamo a disposizione per qualsiasi chiarimento.\n\nCordiali saluti"}'::jsonb, 100, 200),
    make_action_node('action-2', 'crea_task',
      '{"titolo":"Follow-up preventivo {{preventivo.numero}} in scadenza — {{preventivo.cliente_nome}}","priorita":"alta","scadenza_giorni":1}'::jsonb, 400, 200)
  ),
  jsonb_build_array(
    make_edge('trigger-1', 'action-1'),
    make_edge('trigger-1', 'action-2')
  )
) ON CONFLICT DO NOTHING;

-- T10: Preventivo rifiutato → Task analisi + Ricontatto personalizzato
INSERT INTO flows (
  id, company_id, nome, categoria, stato, is_template,
  template_descrizione, template_icona, template_difficolta, trigger_tipo, nodi, edges
) VALUES (
  gen_random_uuid(), NULL,
  'Preventivo rifiutato → Analisi e ricontatto',
  'preventivi', 'bozza', true,
  'Quando un preventivo viene rifiutato: task di analisi motivazioni e follow-up personalizzato per capire come migliorare l''offerta.',
  '🔁', 'intermedio',
  'preventivo_rifiutato',
  jsonb_build_array(
    make_trigger_node('preventivo_rifiutato'),
    make_action_node('action-1', 'crea_task',
      '{"titolo":"Analizza rifiuto prev. {{preventivo.numero}} — {{preventivo.cliente_nome}}","priorita":"media","scadenza_giorni":2,"note":"Motivo: {{preventivo.motivo_rifiuto}}"}'::jsonb, 250, 200),
    make_action_node('action-2', 'attendi',
      '{"giorni":7}'::jsonb, 250, 350),
    make_action_node('action-3', 'invia_email',
      '{"destinatario":"{{preventivo.cliente_email}}","oggetto":"Possiamo rivedere l''offerta insieme?","corpo":"Gentile {{preventivo.cliente_nome}},\n\nSappiamo che il nostro preventivo {{preventivo.numero}} non era quello che cercavi.\nSaremmo felici di rivedere l''offerta in base alle tue esigenze.\n\nSarebbe disponibile per una chiamata?\n\nCordiali saluti"}'::jsonb, 250, 500)
  ),
  jsonb_build_array(
    make_edge('trigger-1', 'action-1'),
    make_edge('action-1', 'action-2'),
    make_edge('action-2', 'action-3')
  )
) ON CONFLICT DO NOTHING;

-- ════════════════════════════════════════════════════════════════
-- CATEGORIA: FATTURAZIONE & INCASSI (T11–T13)
-- ════════════════════════════════════════════════════════════════

-- T11: Fattura scaduta → Sollecito multi-step (email→SMS→task urgente)
INSERT INTO flows (
  id, company_id, nome, categoria, stato, is_template,
  template_descrizione, template_icona, template_difficolta, trigger_tipo, nodi, edges
) VALUES (
  gen_random_uuid(), NULL,
  'Fattura scaduta → Sollecito automatico 3 livelli',
  'fatturazione', 'bozza', true,
  'Sollecito progressivo: email cortese al giorno 3, SMS al giorno 7, task urgente recupero crediti al giorno 15 dalla scadenza.',
  '⏰', 'avanzato',
  'fattura_scaduta',
  jsonb_build_array(
    make_trigger_node('fattura_scaduta', '{"giorni_dopo_scadenza":3}'::jsonb),
    make_action_node('action-1', 'invia_email',
      '{"destinatario":"{{fattura.cliente_email}}","oggetto":"Promemoria: Fattura {{fattura.numero}} — gentile sollecito","corpo":"Gentile {{fattura.cliente_nome}},\n\nVorremmo ricordarle che la fattura {{fattura.numero}} per €{{fattura.importo}} risulta scaduta.\n\nSe ha già provveduto al pagamento, la preghiamo di ignorare questo messaggio.\n\nGrazie per la collaborazione."}'::jsonb, 250, 200),
    make_action_node('action-2', 'attendi',
      '{"giorni":4}'::jsonb, 250, 350),
    make_action_node('action-3', 'invia_sms',
      '{"numero":"{{fattura.cliente_telefono}}","testo":"Gentile {{fattura.cliente_nome}}, la fattura {{fattura.numero}} (€{{fattura.importo}}) è ancora in sospeso. Contattarci per regolarizzare."}'::jsonb, 250, 500),
    make_action_node('action-4', 'attendi',
      '{"giorni":8}'::jsonb, 250, 650),
    make_action_node('action-5', 'crea_task',
      '{"titolo":"🚨 RECUPERO CREDITI: {{fattura.cliente_nome}} — FAT {{fattura.numero}} (€{{fattura.importo}})","priorita":"urgente","scadenza_giorni":0}'::jsonb, 250, 800)
  ),
  jsonb_build_array(
    make_edge('trigger-1', 'action-1'),
    make_edge('action-1', 'action-2'),
    make_edge('action-2', 'action-3'),
    make_edge('action-3', 'action-4'),
    make_edge('action-4', 'action-5')
  )
) ON CONFLICT DO NOTHING;

-- T12: Pagamento ricevuto → Email conferma + Notifica team + Chiudi task sollecito
INSERT INTO flows (
  id, company_id, nome, categoria, stato, is_template,
  template_descrizione, template_icona, template_difficolta, trigger_tipo, nodi, edges
) VALUES (
  gen_random_uuid(), NULL,
  'Pagamento ricevuto → Conferma e chiudi',
  'fatturazione', 'bozza', true,
  'Quando viene registrato un pagamento: invia email di ringraziamento al cliente e notifica il team commerciale.',
  '💵', 'base',
  'pagamento_ricevuto',
  jsonb_build_array(
    make_trigger_node('pagamento_ricevuto'),
    make_action_node('action-1', 'invia_email',
      '{"destinatario":"{{pagamento.cliente_email}}","oggetto":"Pagamento ricevuto — Grazie!","corpo":"Gentile {{pagamento.cliente_nome}},\n\nConfermiamo la ricezione del pagamento di €{{pagamento.importo}} del {{pagamento.data}}.\n\nGrazie per la puntualità!"}'::jsonb, 100, 200),
    make_action_node('action-2', 'invia_notifica_inapp',
      '{"titolo":"💵 Pagamento ricevuto: €{{pagamento.importo}}","testo":"Cliente: {{pagamento.cliente_nome}} — Fattura: {{pagamento.fattura_numero}}"}'::jsonb, 400, 200)
  ),
  jsonb_build_array(
    make_edge('trigger-1', 'action-1'),
    make_edge('trigger-1', 'action-2')
  )
) ON CONFLICT DO NOTHING;

-- T13: Costo registrato oltre soglia → Alert management
INSERT INTO flows (
  id, company_id, nome, categoria, stato, is_template,
  template_descrizione, template_icona, template_difficolta, trigger_tipo, nodi, edges
) VALUES (
  gen_random_uuid(), NULL,
  'Costo elevato registrato → Alert management',
  'fatturazione', 'bozza', true,
  'Quando viene registrato un costo superiore a una soglia configurabile, notifica il management e crea task di revisione.',
  '💸', 'intermedio',
  'costo_registrato',
  jsonb_build_array(
    make_trigger_node('costo_registrato', '{"importo_minimo":1000}'::jsonb),
    make_action_node('action-1', 'invia_notifica_inapp',
      '{"titolo":"💸 Costo elevato registrato: €{{costo.importo}}","testo":"Categoria: {{costo.categoria}} | Fornitore: {{costo.fornitore}} | Note: {{costo.descrizione}}"}'::jsonb, 100, 200),
    make_action_node('action-2', 'crea_task',
      '{"titolo":"Revisione costo: {{costo.descrizione}} (€{{costo.importo}})","priorita":"media","scadenza_giorni":3}'::jsonb, 400, 200)
  ),
  jsonb_build_array(
    make_edge('trigger-1', 'action-1'),
    make_edge('trigger-1', 'action-2')
  )
) ON CONFLICT DO NOTHING;

-- ════════════════════════════════════════════════════════════════
-- CATEGORIA: TICKET ASSISTENZA (T14–T16)
-- ════════════════════════════════════════════════════════════════

-- T14: Ticket urgente → Escalation immediata + Conferma al cliente
INSERT INTO flows (
  id, company_id, nome, categoria, stato, is_template,
  template_descrizione, template_icona, template_difficolta, trigger_tipo, nodi, edges
) VALUES (
  gen_random_uuid(), NULL,
  'Ticket urgente → Escalation immediata',
  'assistenza', 'bozza', true,
  'Ticket con priorità urgente: assegnazione automatica al meno carico, notifica manager, conferma ricezione al cliente.',
  '🚨', 'intermedio',
  'ticket_creato',
  jsonb_build_array(
    make_trigger_node('ticket_creato', '{"priorita_filtro":"urgente"}'::jsonb),
    make_action_node('action-1', 'assegna_agente',
      '{"entity_type":"tickets","entity_id":"{{ticket.id}}","strategia":"meno_carico"}'::jsonb, 100, 200),
    make_action_node('action-2', 'invia_notifica_inapp',
      '{"titolo":"🚨 Ticket URGENTE: {{ticket.oggetto}}","testo":"Cliente: {{ticket.cliente_nome}} — TKT-{{ticket.numero}}"}'::jsonb, 400, 200),
    make_action_node('action-3', 'invia_email',
      '{"destinatario":"{{ticket.cliente_email}}","oggetto":"Ticket TKT-{{ticket.numero}} ricevuto — Priorità urgente","corpo":"Gentile {{ticket.cliente_nome}},\n\nAbbiamo ricevuto la tua richiesta urgente (TKT-{{ticket.numero}}).\nUn tecnico la contatterà entro 1 ora.\n\nCordiali saluti"}'::jsonb, 250, 380)
  ),
  jsonb_build_array(
    make_edge('trigger-1', 'action-1'),
    make_edge('trigger-1', 'action-2'),
    make_edge('action-2', 'action-3')
  )
) ON CONFLICT DO NOTHING;

-- T15: Ticket risolto → Feedback + Chiudi task correlati
INSERT INTO flows (
  id, company_id, nome, categoria, stato, is_template,
  template_descrizione, template_icona, template_difficolta, trigger_tipo, nodi, edges
) VALUES (
  gen_random_uuid(), NULL,
  'Ticket risolto → Richiedi feedback cliente',
  'assistenza', 'bozza', true,
  'Quando un ticket viene chiuso come risolto: attendi 2 ore, poi chiedi feedback al cliente sull''assistenza ricevuta.',
  '⭐', 'base',
  'ticket_stato_cambiato',
  jsonb_build_array(
    make_trigger_node('ticket_stato_cambiato', '{"stato_a":"risolto"}'::jsonb),
    make_action_node('action-1', 'attendi',
      '{"ore":2}'::jsonb, 250, 200),
    make_action_node('action-2', 'invia_email',
      '{"destinatario":"{{ticket.cliente_email}}","oggetto":"Il tuo ticket TKT-{{ticket.numero}} è risolto — Feedback?","corpo":"Gentile {{ticket.cliente_nome}},\n\nIl ticket TKT-{{ticket.numero}} è stato risolto.\n\nSaresti disposto a lasciarci un breve feedback sull''assistenza ricevuta? Ci aiuterà a migliorare.\n\nGrazie mille!"}'::jsonb, 250, 350)
  ),
  jsonb_build_array(
    make_edge('trigger-1', 'action-1'),
    make_edge('action-1', 'action-2')
  )
) ON CONFLICT DO NOTHING;

-- T16: Ticket senza risposta da 24h → Reminder agente + Escalation
INSERT INTO flows (
  id, company_id, nome, categoria, stato, is_template,
  template_descrizione, template_icona, template_difficolta, trigger_tipo, nodi, edges
) VALUES (
  gen_random_uuid(), NULL,
  'Ticket senza risposta → Escalation automatica',
  'assistenza', 'bozza', true,
  'Quando un ticket non riceve risposta entro 24h: notifica agente assegnato e crea task di escalation urgente.',
  '⏱️', 'intermedio',
  'ticket_senza_risposta',
  jsonb_build_array(
    make_trigger_node('ticket_senza_risposta', '{"ore_senza_risposta":24}'::jsonb),
    make_action_node('action-1', 'invia_notifica_inapp',
      '{"titolo":"⚠️ Ticket TKT-{{ticket.numero}} senza risposta da 24h","testo":"Cliente: {{ticket.cliente_nome}} | Oggetto: {{ticket.oggetto}}"}'::jsonb, 100, 200),
    make_action_node('action-2', 'crea_task',
      '{"titolo":"ESCALATION: Rispondi a TKT-{{ticket.numero}} — {{ticket.cliente_nome}}","priorita":"urgente","scadenza_giorni":0}'::jsonb, 400, 200)
  ),
  jsonb_build_array(
    make_edge('trigger-1', 'action-1'),
    make_edge('trigger-1', 'action-2')
  )
) ON CONFLICT DO NOTHING;

-- ════════════════════════════════════════════════════════════════
-- CATEGORIA: ORDINI (T17–T19)
-- ════════════════════════════════════════════════════════════════

-- T17: Ordine confermato → Avvia produzione + Email cliente + Notifica team
INSERT INTO flows (
  id, company_id, nome, categoria, stato, is_template,
  template_descrizione, template_icona, template_difficolta, trigger_tipo, nodi, edges
) VALUES (
  gen_random_uuid(), NULL,
  'Ordine confermato → Avvia produzione',
  'ordini', 'bozza', true,
  'Ordine confermato: invia conferma al cliente, crea task lavorazione per il responsabile produzione e notifica il team.',
  '📦', 'intermedio',
  'ordine_stato_cambiato',
  jsonb_build_array(
    make_trigger_node('ordine_stato_cambiato', '{"stato_a":"confermato"}'::jsonb),
    make_action_node('action-1', 'invia_email',
      '{"destinatario":"{{ordine.cliente_email}}","oggetto":"Ordine {{ordine.numero}} confermato!","corpo":"Gentile {{ordine.cliente_nome}},\n\nIl tuo ordine {{ordine.numero}} è stato confermato e sarà pronto nei tempi concordati.\n\nGrazie per la fiducia!"}'::jsonb, 100, 200),
    make_action_node('action-2', 'crea_task',
      '{"titolo":"Avvia lavorazione ordine {{ordine.numero}} — {{ordine.cliente_nome}}","priorita":"alta","scadenza_giorni":1}'::jsonb, 400, 200),
    make_action_node('action-3', 'invia_notifica_inapp',
      '{"titolo":"📦 Nuovo ordine da lavorare: {{ordine.numero}}","testo":"Cliente: {{ordine.cliente_nome}} — €{{ordine.importo}}"}'::jsonb, 250, 380)
  ),
  jsonb_build_array(
    make_edge('trigger-1', 'action-1'),
    make_edge('trigger-1', 'action-2'),
    make_edge('action-2', 'action-3')
  )
) ON CONFLICT DO NOTHING;

-- T18: Ordine spedito → Notifica cliente (email + WhatsApp)
INSERT INTO flows (
  id, company_id, nome, categoria, stato, is_template,
  template_descrizione, template_icona, template_difficolta, trigger_tipo, nodi, edges
) VALUES (
  gen_random_uuid(), NULL,
  'Ordine spedito → Notifica spedizione multicanale',
  'ordini', 'bozza', true,
  'Quando un ordine viene marcato come spedito: notifica il cliente via email e WhatsApp con i dettagli di consegna.',
  '🚚', 'base',
  'ordine_stato_cambiato',
  jsonb_build_array(
    make_trigger_node('ordine_stato_cambiato', '{"stato_a":"spedito"}'::jsonb),
    make_action_node('action-1', 'invia_email',
      '{"destinatario":"{{ordine.cliente_email}}","oggetto":"Il tuo ordine {{ordine.numero}} è in viaggio!","corpo":"Gentile {{ordine.cliente_nome}},\n\nLa tua merce è stata spedita e arriverà a breve.\n\nPer qualsiasi informazione siamo disponibili!"}'::jsonb, 100, 200),
    make_action_node('action-2', 'invia_whatsapp',
      '{"numero":"{{ordine.cliente_telefono}}","messaggio":"✅ Il tuo ordine {{ordine.numero}} è partito! Ti aggiorneremo sull''arrivo. Per info rispondi qui."}'::jsonb, 400, 200)
  ),
  jsonb_build_array(
    make_edge('trigger-1', 'action-1'),
    make_edge('trigger-1', 'action-2')
  )
) ON CONFLICT DO NOTHING;

-- T19: Ordine in ritardo → Alert commerciale + Cliente
INSERT INTO flows (
  id, company_id, nome, categoria, stato, is_template,
  template_descrizione, template_icona, template_difficolta, trigger_tipo, nodi, edges
) VALUES (
  gen_random_uuid(), NULL,
  'Ordine in ritardo → Alert e comunicazione cliente',
  'ordini', 'bozza', true,
  'Quando un ordine supera la data di consegna prevista: avvisa il commerciale responsabile e invia comunicazione proattiva al cliente.',
  '⚠️', 'intermedio',
  'ordine_in_ritardo',
  jsonb_build_array(
    make_trigger_node('ordine_in_ritardo'),
    make_action_node('action-1', 'invia_notifica_inapp',
      '{"titolo":"⚠️ Ordine {{ordine.numero}} in ritardo di {{ordine.giorni_ritardo}} giorni","testo":"Cliente: {{ordine.cliente_nome}} | Prevista: {{ordine.data_consegna_prevista}}"}'::jsonb, 100, 200),
    make_action_node('action-2', 'invia_email',
      '{"destinatario":"{{ordine.cliente_email}}","oggetto":"Aggiornamento consegna ordine {{ordine.numero}}","corpo":"Gentile {{ordine.cliente_nome}},\n\nVogliamo aggiornarla proattivamente: il suo ordine {{ordine.numero}} ha subito un ritardo.\nIl nostro team si è già attivato per risolvere la situazione nel minor tempo possibile.\n\nLa contatteremo appena possibile con la nuova data di consegna.\n\nCi scusiamo per il disagio."}'::jsonb, 400, 200),
    make_action_node('action-3', 'crea_task',
      '{"titolo":"🚨 Gestisci ritardo ordine {{ordine.numero}} — contatta {{ordine.cliente_nome}}","priorita":"urgente","scadenza_giorni":0}'::jsonb, 250, 380)
  ),
  jsonb_build_array(
    make_edge('trigger-1', 'action-1'),
    make_edge('trigger-1', 'action-2'),
    make_edge('trigger-1', 'action-3')
  )
) ON CONFLICT DO NOTHING;

-- ════════════════════════════════════════════════════════════════
-- CATEGORIA: MAGAZZINO (T20–T22)
-- ════════════════════════════════════════════════════════════════

-- T20: Scorta minima → Task riordino + Notifica responsabile
INSERT INTO flows (
  id, company_id, nome, categoria, stato, is_template,
  template_descrizione, template_icona, template_difficolta, trigger_tipo, nodi, edges
) VALUES (
  gen_random_uuid(), NULL,
  'Scorta minima → Task riordino automatico',
  'magazzino', 'bozza', true,
  'Quando un prodotto scende sotto la scorta minima: crea task di riordino urgente e notifica il responsabile magazzino.',
  '⚠️', 'base',
  'scorta_minima',
  jsonb_build_array(
    make_trigger_node('scorta_minima'),
    make_action_node('action-1', 'crea_task',
      '{"titolo":"⚠️ Riordina: {{prodotto.nome}} (attuale: {{prodotto.giacenza}} | min: {{prodotto.scorta_minima}})","priorita":"alta","scadenza_giorni":1}'::jsonb, 100, 200),
    make_action_node('action-2', 'invia_notifica_inapp',
      '{"titolo":"Scorta minima: {{prodotto.nome}}","testo":"Giacenza: {{prodotto.giacenza}} pz | Fornitore: {{prodotto.fornitore}}"}'::jsonb, 400, 200)
  ),
  jsonb_build_array(
    make_edge('trigger-1', 'action-1'),
    make_edge('trigger-1', 'action-2')
  )
) ON CONFLICT DO NOTHING;

-- T21: Prodotto esaurito → Alert urgente + Blocco ordini
INSERT INTO flows (
  id, company_id, nome, categoria, stato, is_template,
  template_descrizione, template_icona, template_difficolta, trigger_tipo, nodi, edges
) VALUES (
  gen_random_uuid(), NULL,
  'Prodotto esaurito → Alert urgente e riordino',
  'magazzino', 'bozza', true,
  'Quando un prodotto arriva a zero: notifica urgente al responsabile e task di riordino immediato con nota al commerciale.',
  '🔴', 'intermedio',
  'prodotto_esaurito',
  jsonb_build_array(
    make_trigger_node('prodotto_esaurito'),
    make_action_node('action-1', 'invia_notifica_inapp',
      '{"titolo":"🔴 ESAURITO: {{prodotto.nome}}","testo":"Il prodotto è a zero pezzi. Ordini in sospeso: {{prodotto.ordini_in_attesa}}"}'::jsonb, 100, 200),
    make_action_node('action-2', 'crea_task',
      '{"titolo":"🔴 URGENTE — Riordina {{prodotto.nome}} (ESAURITO, {{prodotto.ordini_in_attesa}} ordini in attesa)","priorita":"urgente","scadenza_giorni":0}'::jsonb, 400, 200),
    make_action_node('action-3', 'invia_notifica_inapp',
      '{"titolo":"⚠️ Attenzione commerciale: {{prodotto.nome}} esaurito","testo":"{{prodotto.ordini_in_attesa}} ordini client in attesa. Aggiorna i clienti!"}'::jsonb, 250, 380)
  ),
  jsonb_build_array(
    make_edge('trigger-1', 'action-1'),
    make_edge('trigger-1', 'action-2'),
    make_edge('action-2', 'action-3')
  )
) ON CONFLICT DO NOTHING;

-- T22: Messaggio WhatsApp ricevuto → Task risposta + Notifica agente
INSERT INTO flows (
  id, company_id, nome, categoria, stato, is_template,
  template_descrizione, template_icona, template_difficolta, trigger_tipo, nodi, edges
) VALUES (
  gen_random_uuid(), NULL,
  'Messaggio WhatsApp ricevuto → Notifica e task risposta',
  'marketing', 'bozza', true,
  'Quando arriva un messaggio WhatsApp da un contatto: notifica l''agente assegnato e crea task di risposta rapida.',
  '💬', 'base',
  'messaggio_whatsapp_ricevuto',
  jsonb_build_array(
    make_trigger_node('messaggio_whatsapp_ricevuto'),
    make_action_node('action-1', 'invia_notifica_inapp',
      '{"titolo":"💬 Messaggio WA da {{contatto.nome}}","testo":"{{messaggio.testo_preview}}"}'::jsonb, 100, 200),
    make_action_node('action-2', 'crea_task',
      '{"titolo":"Rispondi a WhatsApp di {{contatto.nome}}","priorita":"alta","scadenza_giorni":0}'::jsonb, 400, 200)
  ),
  jsonb_build_array(
    make_edge('trigger-1', 'action-1'),
    make_edge('trigger-1', 'action-2')
  )
) ON CONFLICT DO NOTHING;

-- ════════════════════════════════════════════════════════════════
-- CATEGORIA: CANTIERI (T23–T25)
-- ════════════════════════════════════════════════════════════════

-- T23: Cantiere aperto → Onboarding completo (4 task + email cliente)
INSERT INTO flows (
  id, company_id, nome, categoria, stato, is_template,
  template_descrizione, template_icona, template_difficolta, trigger_tipo, nodi, edges
) VALUES (
  gen_random_uuid(), NULL,
  'Cantiere aperto → Onboarding completo',
  'cantieri', 'bozza', true,
  'Alla creazione di un nuovo cantiere: genera automaticamente i 4 task iniziali standard (documentazione, sopralluogo, pianificazione, sicurezza) e notifica il cliente.',
  '🏗️', 'avanzato',
  'cantiere_creato',
  jsonb_build_array(
    make_trigger_node('cantiere_creato'),
    make_action_node('action-1', 'crea_task',
      '{"titolo":"📄 Raccolta documentazione: {{cantiere.nome}}","priorita":"alta","scadenza_giorni":2}'::jsonb, 100, 200),
    make_action_node('action-2', 'crea_task',
      '{"titolo":"🔍 Sopralluogo: {{cantiere.nome}} — {{cantiere.indirizzo}}","priorita":"alta","scadenza_giorni":5}'::jsonb, 400, 200),
    make_action_node('action-3', 'crea_task',
      '{"titolo":"📋 Piano operativo e timeline: {{cantiere.nome}}","priorita":"media","scadenza_giorni":7}'::jsonb, 100, 380),
    make_action_node('action-4', 'crea_task',
      '{"titolo":"⛑️ Piano sicurezza cantiere: {{cantiere.nome}}","priorita":"alta","scadenza_giorni":5}'::jsonb, 400, 380),
    make_action_node('action-5', 'invia_email',
      '{"destinatario":"{{cantiere.cliente_email}}","oggetto":"Cantiere {{cantiere.nome}} aperto — Benvenuto!","corpo":"Gentile {{cantiere.cliente_nome}},\n\nAbbiamo aperto il cantiere per i suoi lavori.\nIl responsabile la contatterà nei prossimi giorni per i dettagli operativi.\n\nCordiali saluti"}'::jsonb, 250, 560)
  ),
  jsonb_build_array(
    make_edge('trigger-1', 'action-1'),
    make_edge('trigger-1', 'action-2'),
    make_edge('trigger-1', 'action-3'),
    make_edge('trigger-1', 'action-4'),
    make_edge('action-3', 'action-5')
  )
) ON CONFLICT DO NOTHING;

-- T24: Fase cantiere completata → Notifica cliente + Prossima fase
INSERT INTO flows (
  id, company_id, nome, categoria, stato, is_template,
  template_descrizione, template_icona, template_difficolta, trigger_tipo, nodi, edges
) VALUES (
  gen_random_uuid(), NULL,
  'Fase cantiere completata → Aggiornamento cliente',
  'cantieri', 'bozza', true,
  'Quando una fase del cantiere viene completata: notifica il cliente con aggiornamento avanzamento lavori e crea task per la fase successiva.',
  '✅', 'intermedio',
  'cantiere_fase_completata',
  jsonb_build_array(
    make_trigger_node('cantiere_fase_completata'),
    make_action_node('action-1', 'invia_email',
      '{"destinatario":"{{cantiere.cliente_email}}","oggetto":"Aggiornamento lavori: {{fase.nome}} completata","corpo":"Gentile {{cantiere.cliente_nome}},\n\nAbbiamo completato la fase {{fase.nome}} del cantiere {{cantiere.nome}}.\n\nStiamo procedendo con la fase successiva nei tempi previsti.\n\nCordiali saluti"}'::jsonb, 100, 200),
    make_action_node('action-2', 'crea_task',
      '{"titolo":"Avvia fase successiva: {{fase.fase_successiva}} — {{cantiere.nome}}","priorita":"alta","scadenza_giorni":1}'::jsonb, 400, 200)
  ),
  jsonb_build_array(
    make_edge('trigger-1', 'action-1'),
    make_edge('trigger-1', 'action-2')
  )
) ON CONFLICT DO NOTHING;

-- T25: Cantiere in ritardo → Escalation e comunicazione
INSERT INTO flows (
  id, company_id, nome, categoria, stato, is_template,
  template_descrizione, template_icona, template_difficolta, trigger_tipo, nodi, edges
) VALUES (
  gen_random_uuid(), NULL,
  'Cantiere in ritardo → Escalation e piano recupero',
  'cantieri', 'bozza', true,
  'Quando un cantiere supera la data di consegna pianificata: notifica management, crea task piano di recupero e informa il cliente.',
  '🚧', 'avanzato',
  'cantiere_in_ritardo',
  jsonb_build_array(
    make_trigger_node('cantiere_in_ritardo'),
    make_action_node('action-1', 'invia_notifica_inapp',
      '{"titolo":"🚧 Cantiere in ritardo: {{cantiere.nome}}","testo":"Ritardo: {{cantiere.giorni_ritardo}} giorni | Cliente: {{cantiere.cliente_nome}}"}'::jsonb, 250, 200),
    make_action_node('action-2', 'crea_task',
      '{"titolo":"Piano recupero ritardo: {{cantiere.nome}} ({{cantiere.giorni_ritardo}} giorni)","priorita":"urgente","scadenza_giorni":0}'::jsonb, 250, 350),
    make_action_node('action-3', 'invia_email',
      '{"destinatario":"{{cantiere.cliente_email}}","oggetto":"Aggiornamento tempistiche cantiere {{cantiere.nome}}","corpo":"Gentile {{cantiere.cliente_nome}},\n\nVogliamo aggiornarla proattivamente: il cantiere {{cantiere.nome}} ha subito un ritardo.\nIl nostro team è già al lavoro per recuperare i tempi.\n\nLa contatteremo a breve con un aggiornamento dettagliato.\n\nCi scusiamo per il disagio."}'::jsonb, 250, 500)
  ),
  jsonb_build_array(
    make_edge('trigger-1', 'action-1'),
    make_edge('action-1', 'action-2'),
    make_edge('action-2', 'action-3')
  )
) ON CONFLICT DO NOTHING;

-- ════════════════════════════════════════════════════════════════
-- CATEGORIA: MARKETING (T26–T28)
-- ════════════════════════════════════════════════════════════════

-- T26: Form web compilato → CRM + Risposta immediata + Opportunità
INSERT INTO flows (
  id, company_id, nome, categoria, stato, is_template,
  template_descrizione, template_icona, template_difficolta, trigger_tipo, nodi, edges
) VALUES (
  gen_random_uuid(), NULL,
  'Form web → CRM + Risposta immediata',
  'marketing', 'bozza', true,
  'Quando qualcuno compila il form sul sito: risposta email automatica, crea contatto e opportunità nel CRM, assegna al commerciale.',
  '📝', 'intermedio',
  'form_compilato',
  jsonb_build_array(
    make_trigger_node('form_compilato'),
    make_action_node('action-1', 'invia_email',
      '{"destinatario":"{{form.email}}","oggetto":"Abbiamo ricevuto la tua richiesta!","corpo":"Gentile {{form.nome}},\n\nGrazie per averci contattato!\nUn nostro consulente ti risponderà nelle prossime ore.\n\nCordiali saluti"}'::jsonb, 100, 200),
    make_action_node('action-2', 'crea_opportunita',
      '{"nome":"Lead web: {{form.nome}}","stage":"nuovo_lead","valore":0,"note":"Compilato da: {{form.pagina_origine}}"}'::jsonb, 400, 200),
    make_action_node('action-3', 'crea_task',
      '{"titolo":"🌐 Lead sito: {{form.nome}} ({{form.telefono}})","priorita":"alta","scadenza_giorni":0}'::jsonb, 250, 380)
  ),
  jsonb_build_array(
    make_edge('trigger-1', 'action-1'),
    make_edge('trigger-1', 'action-2'),
    make_edge('action-2', 'action-3')
  )
) ON CONFLICT DO NOTHING;

-- T27: Email di marketing aperta → Lead caldo + Follow-up
INSERT INTO flows (
  id, company_id, nome, categoria, stato, is_template,
  template_descrizione, template_icona, template_difficolta, trigger_tipo, nodi, edges
) VALUES (
  gen_random_uuid(), NULL,
  'Email aperta → Follow-up commerciale lead caldo',
  'marketing', 'bozza', true,
  'Quando un contatto apre un''email di campagna: notifica immediata al commerciale e task di ricontatto mentre il lead è "caldo".',
  '📧', 'base',
  'email_aperta',
  jsonb_build_array(
    make_trigger_node('email_aperta'),
    make_action_node('action-1', 'crea_task',
      '{"titolo":"🔥 Lead caldo: {{contatto.nome}} ha aperto email — Contattare subito!","priorita":"alta","scadenza_giorni":0}'::jsonb, 250, 200),
    make_action_node('action-2', 'invia_notifica_inapp',
      '{"titolo":"Lead caldo: {{contatto.nome}}","testo":"Ha aperto: {{campagna.nome}} | 📞 {{contatto.telefono}}"}'::jsonb, 250, 380)
  ),
  jsonb_build_array(
    make_edge('trigger-1', 'action-1'),
    make_edge('action-1', 'action-2')
  )
) ON CONFLICT DO NOTHING;

-- T28: Email cliccata → Crea opportunità + Notifica commerciale
INSERT INTO flows (
  id, company_id, nome, categoria, stato, is_template,
  template_descrizione, template_icona, template_difficolta, trigger_tipo, nodi, edges
) VALUES (
  gen_random_uuid(), NULL,
  'Link email cliccato → Crea opportunità CRM',
  'marketing', 'bozza', true,
  'Quando un contatto clicca un link in una email di campagna: crea automaticamente un''opportunità nel CRM e notifica il commerciale.',
  '🖱️', 'intermedio',
  'email_cliccata',
  jsonb_build_array(
    make_trigger_node('email_cliccata'),
    make_action_node('action-1', 'crea_opportunita',
      '{"nome":"Interesse da email: {{contatto.nome}}","stage":"interessato","valore":0,"note":"Link cliccato: {{email.link_cliccato}} | Campagna: {{campagna.nome}}"}'::jsonb, 100, 200),
    make_action_node('action-2', 'invia_notifica_inapp',
      '{"titolo":"🖱️ {{contatto.nome}} ha cliccato email!","testo":"Link: {{email.link_cliccato}} | Opportunità creata"}'::jsonb, 400, 200),
    make_action_node('action-3', 'crea_task',
      '{"titolo":"Contatta: {{contatto.nome}} (ha cliccato su {{email.link_cliccato}})","priorita":"alta","scadenza_giorni":0}'::jsonb, 250, 380)
  ),
  jsonb_build_array(
    make_edge('trigger-1', 'action-1'),
    make_edge('trigger-1', 'action-2'),
    make_edge('action-1', 'action-3')
  )
) ON CONFLICT DO NOTHING;

-- ════════════════════════════════════════════════════════════════
-- CATEGORIA: HR (T29–T31)
-- ════════════════════════════════════════════════════════════════

-- T29: Nuovo dipendente → Onboarding task automatici + Email benvenuto
INSERT INTO flows (
  id, company_id, nome, categoria, stato, is_template,
  template_descrizione, template_icona, template_difficolta, trigger_tipo, nodi, edges
) VALUES (
  gen_random_uuid(), NULL,
  'Nuovo dipendente → Onboarding automatico',
  'hr', 'bozza', true,
  'Quando viene aggiunto un nuovo dipendente: email di benvenuto + 4 task di onboarding progressivi (setup, formazione, check-in settimana 1, check-in mese 1).',
  '🧑‍💼', 'avanzato',
  'dipendente_creato',
  jsonb_build_array(
    make_trigger_node('dipendente_creato'),
    make_action_node('action-1', 'invia_email',
      '{"destinatario":"{{dipendente.email}}","oggetto":"Benvenuto in azienda, {{dipendente.nome}}!","corpo":"Caro/a {{dipendente.nome}},\n\nSiamo felici di averti nel team!\nNei prossimi giorni riceverai tutte le info necessarie per iniziare.\n\nBenvenuto/a!"}'::jsonb, 100, 200),
    make_action_node('action-2', 'crea_task',
      '{"titolo":"Setup credenziali e account: {{dipendente.nome}}","priorita":"alta","scadenza_giorni":1}'::jsonb, 400, 200),
    make_action_node('action-3', 'crea_task',
      '{"titolo":"Formazione iniziale: {{dipendente.nome}} (ruolo: {{dipendente.ruolo}})","priorita":"alta","scadenza_giorni":3}'::jsonb, 100, 380),
    make_action_node('action-4', 'crea_task',
      '{"titolo":"Check-in settimana 1: come va {{dipendente.nome}}?","priorita":"media","scadenza_giorni":7}'::jsonb, 400, 380),
    make_action_node('action-5', 'crea_task',
      '{"titolo":"Check-in mese 1 e valutazione onboarding: {{dipendente.nome}}","priorita":"media","scadenza_giorni":30}'::jsonb, 250, 560)
  ),
  jsonb_build_array(
    make_edge('trigger-1', 'action-1'),
    make_edge('trigger-1', 'action-2'),
    make_edge('action-2', 'action-3'),
    make_edge('action-3', 'action-4'),
    make_edge('action-4', 'action-5')
  )
) ON CONFLICT DO NOTHING;

-- T30: Contratto in scadenza (30 giorni) → Alert HR + Task revisione
INSERT INTO flows (
  id, company_id, nome, categoria, stato, is_template,
  template_descrizione, template_icona, template_difficolta, trigger_tipo, nodi, edges
) VALUES (
  gen_random_uuid(), NULL,
  'Contratto in scadenza → Alert HR 30 giorni prima',
  'hr', 'bozza', true,
  '30 giorni prima della scadenza contrattuale: notifica HR, crea task di revisione e invia promemoria al dipendente.',
  '📄', 'intermedio',
  'contratto_in_scadenza',
  jsonb_build_array(
    make_trigger_node('contratto_in_scadenza', '{"giorni_prima":30}'::jsonb),
    make_action_node('action-1', 'crea_task',
      '{"titolo":"⚠️ Contratto in scadenza fra 30gg: {{dipendente.nome}} ({{contratto.scadenza}})","priorita":"alta","scadenza_giorni":7}'::jsonb, 100, 200),
    make_action_node('action-2', 'invia_notifica_inapp',
      '{"titolo":"Contratto in scadenza: {{dipendente.nome}}","testo":"Scade il {{contratto.scadenza}} — {{contratto.giorni_rimanenti}} giorni rimanenti"}'::jsonb, 400, 200),
    make_action_node('action-3', 'invia_email',
      '{"destinatario":"{{dipendente.email}}","oggetto":"Il tuo contratto scade il {{contratto.scadenza}}","corpo":"Caro/a {{dipendente.nome}},\n\nTi comunichiamo che il tuo contratto scadrà il {{contratto.scadenza}}.\nIl responsabile HR ti contatterà a breve per discutere del rinnovo.\n\nCordiali saluti"}'::jsonb, 250, 380)
  ),
  jsonb_build_array(
    make_edge('trigger-1', 'action-1'),
    make_edge('trigger-1', 'action-2'),
    make_edge('action-1', 'action-3')
  )
) ON CONFLICT DO NOTHING;

-- T31: Ferie richiesta → Notifica manager + Task approvazione
INSERT INTO flows (
  id, company_id, nome, categoria, stato, is_template,
  template_descrizione, template_icona, template_difficolta, trigger_tipo, nodi, edges
) VALUES (
  gen_random_uuid(), NULL,
  'Richiesta ferie → Notifica e approvazione manager',
  'hr', 'bozza', true,
  'Quando un dipendente richiede le ferie: notifica il manager responsabile e crea task di approvazione/verifica copertura.',
  '🏖️', 'base',
  'ferie_richiesta',
  jsonb_build_array(
    make_trigger_node('ferie_richiesta'),
    make_action_node('action-1', 'invia_notifica_inapp',
      '{"titolo":"Richiesta ferie: {{dipendente.nome}}","testo":"Dal {{ferie.data_inizio}} al {{ferie.data_fine}} ({{ferie.giorni}} giorni)"}'::jsonb, 100, 200),
    make_action_node('action-2', 'crea_task',
      '{"titolo":"Approva ferie {{dipendente.nome}}: {{ferie.data_inizio}} → {{ferie.data_fine}}","priorita":"media","scadenza_giorni":2}'::jsonb, 400, 200)
  ),
  jsonb_build_array(
    make_edge('trigger-1', 'action-1'),
    make_edge('trigger-1', 'action-2')
  )
) ON CONFLICT DO NOTHING;

-- ════════════════════════════════════════════════════════════════
-- CATEGORIA: TASK (T32)
-- ════════════════════════════════════════════════════════════════

-- T32: Task scaduto → Escalation al manager
INSERT INTO flows (
  id, company_id, nome, categoria, stato, is_template,
  template_descrizione, template_icona, template_difficolta, trigger_tipo, nodi, edges
) VALUES (
  gen_random_uuid(), NULL,
  'Task scaduto → Escalation manager',
  'task', 'bozza', true,
  'Quando un task supera la scadenza senza essere completato: notifica il manager e crea task di follow-up urgente.',
  '⏰', 'base',
  'task_scaduto',
  jsonb_build_array(
    make_trigger_node('task_scaduto'),
    make_action_node('action-1', 'invia_notifica_inapp',
      '{"titolo":"⚠️ Task scaduto: {{task.titolo}}","testo":"In ritardo di {{task.giorni_ritardo}} giorni | Assegnato a: {{task.assegnato_a}}"}'::jsonb, 250, 200),
    make_action_node('action-2', 'crea_task',
      '{"titolo":"ESCALATION: verifica ritardo {{task.giorni_ritardo}}gg — {{task.titolo}}","priorita":"urgente","scadenza_giorni":0}'::jsonb, 250, 380)
  ),
  jsonb_build_array(
    make_edge('trigger-1', 'action-1'),
    make_edge('action-1', 'action-2')
  )
) ON CONFLICT DO NOTHING;

-- ════════════════════════════════════════════════════════════════
-- CATEGORIA: SCHEDULATI / REPORT (T33–T35)
-- ════════════════════════════════════════════════════════════════

-- T33: Report giornaliero — attività del giorno alle 8:00
INSERT INTO flows (
  id, company_id, nome, categoria, stato, is_template,
  template_descrizione, template_icona, template_difficolta, trigger_tipo, nodi, edges
) VALUES (
  gen_random_uuid(), NULL,
  'Report giornaliero task e attività (8:00)',
  'generale', 'bozza', true,
  'Ogni mattina alle 8:00 invia notifica al manager con riepilogo dei task del giorno e di quelli scaduti.',
  '🌅', 'base',
  'cron_giornaliero',
  jsonb_build_array(
    make_trigger_node('cron_giornaliero', '{"orario":"08:00"}'::jsonb),
    make_action_node('action-1', 'esegui_agente_ai',
      '{"prompt":"Genera un riepilogo dei task in scadenza oggi e quelli già scaduti. Formatta in modo chiaro per il manager."}'::jsonb, 250, 200),
    make_action_node('action-2', 'invia_notifica_inapp',
      '{"titolo":"📋 Buongiorno! Piano del giorno","testo":"Apri la sezione Attività per vedere i task di oggi."}'::jsonb, 250, 380)
  ),
  jsonb_build_array(
    make_edge('trigger-1', 'action-1'),
    make_edge('action-1', 'action-2')
  )
) ON CONFLICT DO NOTHING;

-- T34: Report settimanale KPI vendite (ogni lunedì alle 8:00)
INSERT INTO flows (
  id, company_id, nome, categoria, stato, is_template,
  template_descrizione, template_icona, template_difficolta, trigger_tipo, nodi, edges
) VALUES (
  gen_random_uuid(), NULL,
  'Report settimanale KPI (ogni lunedì)',
  'generale', 'bozza', true,
  'Ogni lunedì alle 8:00 crea task per analizzare i KPI della settimana precedente: trattative, fatturato, ticket aperti.',
  '📊', 'base',
  'cron_settimanale',
  jsonb_build_array(
    make_trigger_node('cron_settimanale', '{"giorno":"lunedi","orario":"08:00"}'::jsonb),
    make_action_node('action-1', 'crea_task',
      '{"titolo":"📊 Analizza KPI settimana precedente e prepara report management","priorita":"media","scadenza_giorni":1}'::jsonb, 250, 200)
  ),
  jsonb_build_array(
    make_edge('trigger-1', 'action-1')
  )
) ON CONFLICT DO NOTHING;

-- T35: Reminder mensile — Verifica scorte e ordini aperti
INSERT INTO flows (
  id, company_id, nome, categoria, stato, is_template,
  template_descrizione, template_icona, template_difficolta, trigger_tipo, nodi, edges
) VALUES (
  gen_random_uuid(), NULL,
  'Report mensile magazzino e ordini aperti',
  'generale', 'bozza', true,
  'Ogni primo del mese: task per verificare le scorte critiche, gli ordini aperti e i preventivi in scadenza nel mese.',
  '📅', 'base',
  'cron_mensile',
  jsonb_build_array(
    make_trigger_node('cron_mensile', '{"giorno":1,"orario":"09:00"}'::jsonb),
    make_action_node('action-1', 'crea_task',
      '{"titolo":"📦 Verifica mensile: scorte critiche, ordini aperti, preventivi in scadenza","priorita":"media","scadenza_giorni":3}'::jsonb, 100, 200),
    make_action_node('action-2', 'invia_notifica_inapp',
      '{"titolo":"📅 Inizio mese: verifica magazzino e pipeline","testo":"Apri il report mensile per i dettagli."}'::jsonb, 400, 200)
  ),
  jsonb_build_array(
    make_edge('trigger-1', 'action-1'),
    make_edge('trigger-1', 'action-2')
  )
) ON CONFLICT DO NOTHING;

-- Cleanup helper functions
DROP FUNCTION IF EXISTS make_trigger_node(TEXT, JSONB);
DROP FUNCTION IF EXISTS make_action_node(TEXT, TEXT, JSONB, INT, INT);
DROP FUNCTION IF EXISTS make_condition_node(TEXT, JSONB, INT, INT);
DROP FUNCTION IF EXISTS make_edge(TEXT, TEXT, TEXT, TEXT);

-- Verifica inserimento finale
SELECT
  categoria,
  template_icona,
  template_difficolta,
  nome,
  trigger_tipo,
  jsonb_array_length(nodi) - 1 as num_azioni
FROM flows
WHERE is_template = true
ORDER BY categoria, nome;
```

---

### STEP 3 — Aggiorna AutomazioniTemplateGallery

```tsx
// src/components/automazioni/AutomazioniTemplateGallery.tsx

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompanyId } from '@/hooks/useCompanyId';
import { useNavigate } from 'react-router-dom';
import { Search, Zap, ChevronDown } from 'lucide-react';

interface Props {
  categoriaFiltro?: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  crm: '🤝 CRM & Vendite',
  marketing: '📣 Marketing',
  preventivi: '📋 Preventivi',
  fatturazione: '💰 Fatturazione',
  ordini: '📦 Ordini',
  assistenza: '🎧 Assistenza',
  magazzino: '🏭 Magazzino',
  cantieri: '🏗️ Cantieri',
  hr: '👥 HR & Personale',
  task: '✅ Task',
  generale: '⚙️ Generale',
};

const DIFFICULTY_BADGE: Record<string, string> = {
  base: 'bg-green-100 text-green-700',
  intermedio: 'bg-yellow-100 text-yellow-700',
  avanzato: 'bg-red-100 text-red-700',
};

export function AutomazioniTemplateGallery({ categoriaFiltro }: Props) {
  const { companyId } = useCompanyId();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [difficolta, setDifficolta] = useState<string | null>(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['flow-templates', categoriaFiltro],
    queryFn: async () => {
      let query = supabase
        .from('flows')
        .select('*')
        .eq('is_template', true)
        .is('company_id', null)
        .order('categoria')
        .order('nome');

      if (categoriaFiltro) {
        query = query.eq('categoria', categoriaFiltro);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const activateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const template = templates.find((t: any) => t.id === templateId);
      if (!template) throw new Error('Template not found');

      const { data, error } = await supabase
        .from('flows')
        .insert({
          company_id: companyId,
          nome: template.nome,
          categoria: template.categoria,
          stato: 'bozza',
          nodi: template.nodi,
          edges: template.edges,
          trigger_tipo: template.trigger_tipo,
          is_template: false,
        })
        .select('id')
        .single();

      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (newFlowId) => {
      queryClient.invalidateQueries({ queryKey: ['flows', companyId] });
      navigate(`/automazioni/${newFlowId}/edit`);
    },
  });

  // Filtra client-side per ricerca e difficoltà
  const filtered = templates.filter((t: any) => {
    const matchSearch =
      !search ||
      t.nome.toLowerCase().includes(search.toLowerCase()) ||
      t.template_descrizione?.toLowerCase().includes(search.toLowerCase()) ||
      t.trigger_tipo.toLowerCase().includes(search.toLowerCase());
    const matchDiff = !difficolta || t.template_difficolta === difficolta;
    return matchSearch && matchDiff;
  });

  // Raggruppa per categoria
  const grouped = filtered.reduce((acc: Record<string, any[]>, t: any) => {
    if (!acc[t.categoria]) acc[t.categoria] = [];
    acc[t.categoria].push(t);
    return acc;
  }, {});

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-pulse">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-32 bg-gray-100 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Barra filtri */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Cerca template..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="flex gap-2">
          {(['base', 'intermedio', 'avanzato'] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDifficolta(difficolta === d ? null : d)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                difficolta === d
                  ? DIFFICULTY_BADGE[d] + ' border-current'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
              }`}
            >
              {d.charAt(0).toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400 ml-auto">
          {filtered.length} template
        </span>
      </div>

      {/* Griglia per categoria */}
      {Object.entries(grouped).map(([cat, items]: any) => (
        <div key={cat}>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            {CATEGORY_LABELS[cat] ?? cat}
            <span className="text-gray-400 font-normal">({items.length})</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {items.map((template: any) => (
              <TemplateCard
                key={template.id}
                template={template}
                onActivate={() => activateMutation.mutate(template.id)}
                isActivating={
                  activateMutation.isPending &&
                  activateMutation.variables === template.id
                }
              />
            ))}
          </div>
        </div>
      ))}

      {filtered.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <Zap className="h-8 w-8 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Nessun template trovato</p>
        </div>
      )}
    </div>
  );
}

function TemplateCard({ template, onActivate, isActivating }: any) {
  const numAzioni = (template.nodi?.length ?? 1) - 1;

  return (
    <div className="border border-gray-200 rounded-xl p-4 hover:border-indigo-300 hover:shadow-sm transition-all bg-white group">
      <div className="flex items-start gap-3">
        <span className="text-2xl flex-shrink-0">{template.template_icona ?? '⚡'}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="font-medium text-gray-900 text-sm leading-tight">{template.nome}</p>
            {template.template_difficolta && (
              <span
                className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                  DIFFICULTY_BADGE[template.template_difficolta]
                }`}
              >
                {template.template_difficolta}
              </span>
            )}
          </div>
          <p className="text-gray-500 text-xs mt-1 line-clamp-2">
            {template.template_descrizione}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">
              ⚡ {template.trigger_tipo?.replace(/_/g, ' ')}
            </span>
            <span className="text-gray-400 text-xs">
              → {numAzioni} {numAzioni === 1 ? 'azione' : 'azioni'}
            </span>
          </div>
        </div>
      </div>

      <button
        onClick={onActivate}
        disabled={isActivating}
        className="w-full mt-3 py-1.5 text-sm bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg border border-indigo-200 transition-colors font-medium disabled:opacity-50"
      >
        {isActivating ? 'Caricamento...' : '+ Usa questo template'}
      </button>
    </div>
  );
}
```
```

---

## Riepilogo template creati (35 totali)

| # | Nome | Categoria | Trigger | Difficoltà |
|---|------|-----------|---------|------------|
| T01 | Lead Facebook → Contatta subito | marketing | campagna_facebook_lead | base |
| T02 | Nuovo contatto → Benvenuto + Follow-up | crm | contatto_creato | base |
| T03 | Deal Vinto → Pipeline post-vendita | crm | opportunita_vinta | avanzato |
| T04 | Deal Perso → Recupero 30 giorni | crm | opportunita_persa | intermedio |
| T05 | Contatto assegnato → Notifica agente | crm | contatto_assegnato | base |
| T06 | Appuntamento confermato → Reminder | crm | appuntamento_confermato | base |
| T07 | No-show → Ricontatto | crm | appuntamento_no_show | base |
| T08 | Preventivo Accettato → Pipeline completa | preventivi | preventivo_accettato | avanzato |
| T09 | Preventivo in scadenza → Follow-up | preventivi | preventivo_in_scadenza | base |
| T10 | Preventivo rifiutato → Analisi e ricontatto | preventivi | preventivo_rifiutato | intermedio |
| T11 | Fattura scaduta → Sollecito 3 livelli | fatturazione | fattura_scaduta | avanzato |
| T12 | Pagamento ricevuto → Conferma e chiudi | fatturazione | pagamento_ricevuto | base |
| T13 | Costo elevato → Alert management | fatturazione | costo_registrato | intermedio |
| T14 | Ticket urgente → Escalation immediata | assistenza | ticket_creato | intermedio |
| T15 | Ticket risolto → Richiedi feedback | assistenza | ticket_stato_cambiato | base |
| T16 | Ticket senza risposta → Escalation | assistenza | ticket_senza_risposta | intermedio |
| T17 | Ordine confermato → Avvia produzione | ordini | ordine_stato_cambiato | intermedio |
| T18 | Ordine spedito → Notifica multicanale | ordini | ordine_stato_cambiato | base |
| T19 | Ordine in ritardo → Alert e comunicazione | ordini | ordine_in_ritardo | intermedio |
| T20 | Scorta minima → Task riordino | magazzino | scorta_minima | base |
| T21 | Prodotto esaurito → Alert urgente | magazzino | prodotto_esaurito | intermedio |
| T22 | Messaggio WhatsApp ricevuto → Risposta | marketing | messaggio_whatsapp_ricevuto | base |
| T23 | Cantiere aperto → Onboarding completo | cantieri | cantiere_creato | avanzato |
| T24 | Fase cantiere completata → Aggiornamento | cantieri | cantiere_fase_completata | intermedio |
| T25 | Cantiere in ritardo → Escalation | cantieri | cantiere_in_ritardo | avanzato |
| T26 | Form web → CRM + Risposta immediata | marketing | form_compilato | intermedio |
| T27 | Email aperta → Follow-up lead caldo | marketing | email_aperta | base |
| T28 | Email cliccata → Crea opportunità CRM | marketing | email_cliccata | intermedio |
| T29 | Nuovo dipendente → Onboarding automatico | hr | dipendente_creato | avanzato |
| T30 | Contratto in scadenza → Alert HR | hr | contratto_in_scadenza | intermedio |
| T31 | Richiesta ferie → Notifica manager | hr | ferie_richiesta | base |
| T32 | Task scaduto → Escalation manager | task | task_scaduto | base |
| T33 | Report giornaliero (8:00) | generale | cron_giornaliero | base |
| T34 | Report settimanale KPI (lunedì) | generale | cron_settimanale | base |
| T35 | Report mensile magazzino e ordini | generale | cron_mensile | base |
