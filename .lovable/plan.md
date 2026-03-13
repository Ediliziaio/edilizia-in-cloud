

## Piano: Campi Sistema per Tutte le Entità + Fix Catalogo Automazioni

### Obiettivo
Rendere la pagina **Campi Personalizzati** il centro unico di tutte le variabili disponibili nel sistema (per email, automazioni, template). Aggiungere come campi di sistema (non modificabili, con lucchetto) TUTTI i campi delle entità del DB reale: Appuntamenti, Ordini, Fatture, Preventivi, Ticket, Task, Dipendenti, Magazzino. Poi allineare il catalogo automazioni (`flow-node-catalog.ts`) per usare questi stessi nomi reali.

### Step 1 — Espandere BUILTIN_FIELDS in `CustomFieldsConfig.tsx`

Aggiungere ~80 nuovi campi di sistema organizzati per entità, con le colonne DB reali:

**Appuntamento** (folder: `appointment`):
`{{ appointment.title }}`, `{{ appointment.appointment_date }}`, `{{ appointment.appointment_time }}`, `{{ appointment.status }}`, `{{ appointment.appointment_type }}`, `{{ appointment.formatted_address }}`, `{{ appointment.internal_notes }}`, `{{ appointment.contact_id }}`, `{{ appointment.assigned_to }}`

**Ordine** (folder: `order`):
`{{ order.order_code }}`, `{{ order.total_amount }}`, `{{ order.description }}`, `{{ order.expected_date }}`, `{{ order.current_status_id }}`, `{{ order.customer_id }}`, `{{ order.assigned_to }}`, `{{ order.deposit_amount }}`, `{{ order.balance_amount }}`

**Fattura** (folder: `invoice`):
`{{ invoice.invoice_number }}`, `{{ invoice.total }}`, `{{ invoice.subtotal }}`, `{{ invoice.tax_amount }}`, `{{ invoice.status }}`, `{{ invoice.due_date }}`, `{{ invoice.issue_date }}`, `{{ invoice.paid_amount }}`, `{{ invoice.client_company_name }}`, `{{ invoice.client_email }}`, `{{ invoice.client_vat_number }}`, `{{ invoice.payment_method }}`, `{{ invoice.document_type }}`

**Preventivo** (folder: `quote`):
`{{ quote.quote_number }}`, `{{ quote.title }}`, `{{ quote.total }}`, `{{ quote.status }}`, `{{ quote.client_name }}`, `{{ quote.client_email }}`, `{{ quote.client_phone }}`, `{{ quote.expires_at }}`, `{{ quote.validity_days }}`, `{{ quote.contact_id }}`

**Ticket** (folder: `ticket`):
`{{ ticket.subject }}`, `{{ ticket.status }}`, `{{ ticket.priority }}`, `{{ ticket.category }}`, `{{ ticket.customer_id }}`, `{{ ticket.assigned_to }}`, `{{ ticket.internal_notes }}`

**Task** (folder: `task`):
`{{ task.title }}`, `{{ task.status }}`, `{{ task.priority }}`, `{{ task.due_date }}`, `{{ task.assigned_to }}`, `{{ task.notes }}`, `{{ task.category }}`, `{{ task.contact_id }}`

**Dipendente** (folder: `employee`):
`{{ employee.first_name }}`, `{{ employee.last_name }}`, `{{ employee.email }}`, `{{ employee.phone }}`, `{{ employee.role_type }}`, `{{ employee.gross_salary }}`, `{{ employee.net_salary }}`

**Magazzino** (folder: `warehouse`):
`{{ warehouse.name }}`, `{{ warehouse.quantity }}`, `{{ warehouse.min_stock_level }}`, `{{ warehouse.unit_cost }}`, `{{ warehouse.quantity_available }}`

Aggiungere `FOLDER_COLORS` e `FOLDER_LABELS` per ogni nuovo tipo. Espandere il filtro `groupBy` nel Select per includere tutte le nuove entità.

### Step 2 — Fix outputVariables nel catalogo `flow-node-catalog.ts`

Allineare TUTTE le `outputVariables` dei trigger per usare i nomi colonne reali del DB (quelli definiti nei BUILTIN_FIELDS):

**Contatto**: `contatto.nome` → `contatto.first_name` + `contatto.last_name`, `contatto.telefono` → `contatto.phone`, `contatto.fonte` → `contatto.source`, `contatto.citta` → `contatto.city`, `contatto.azienda` → `contatto.company_name`, `contatto.assegnato_a` → `contatto.assigned_to`

**Opportunità**: `opportunita.nome` → `opportunita.name`, `opportunita.valore` → `opportunita.value`, `opportunita.stage` → `opportunita.stage_id`, `opportunita.contatto_nome` → rimuovere (richiede join), `opportunita.data_chiusura_prevista` → `opportunita.expected_close_date`, `opportunita.motivo_perdita` → `opportunita.loss_reason`

**Appuntamento**: `appuntamento.titolo` → `appuntamento.title`, `appuntamento.data_ora` → `appuntamento.appointment_date` + `appuntamento.appointment_time`, `appuntamento.luogo` → `appuntamento.formatted_address`, `appuntamento.note` → `appuntamento.internal_notes`, `appuntamento.esito` → `appuntamento.status`

**Ordine**: `ordine.numero` → `ordine.order_code`, `ordine.importo` → `ordine.total_amount`, `ordine.stato` → `ordine.current_status_id`, rimuovere `ordine.cliente_nome`/`ordine.cliente_email` (join)

**Fattura**: `fattura.numero` → `fattura.invoice_number`, `fattura.importo` → `fattura.total`, `fattura.importo_iva` → `fattura.tax_amount`, `fattura.cliente_nome` → `fattura.client_company_name`, `fattura.data_scadenza` → `fattura.due_date`

**Preventivo**: `preventivo.numero` → `preventivo.quote_number`, `preventivo.importo` → `preventivo.total`, `preventivo.cliente_nome` → `preventivo.client_name`, `preventivo.cliente_email` → `preventivo.client_email`, `preventivo.validita` → `preventivo.expires_at`

**Ticket**: `ticket.oggetto` → `ticket.subject`, `ticket.priorita` → `ticket.priority`, `ticket.categoria` → `ticket.category`, rimuovere `ticket.numero`/`ticket.cliente_nome`/`ticket.cliente_email`

**Task**: `task.titolo` → `task.title`, `task.priorita` → `task.priority`, `task.assegnato_a` → `task.assigned_to`, `task.scadenza` → `task.due_date`

**Dipendente**: `dipendente.nome` → `dipendente.first_name` + `dipendente.last_name`, `dipendente.ruolo` → `dipendente.role_type`, rimuovere `dipendente.data_inizio` (non esiste)

**Magazzino**: `prodotto.nome` → `prodotto.name`, `prodotto.giacenza` → `prodotto.quantity`, `prodotto.scorta_minima` → `prodotto.min_stock_level`, rimuovere `prodotto.sku` (non esiste)

### Step 3 — Fix configSchema nelle azioni

Allineare anche i nomi dei config field delle azioni ai nomi DB reali dove appropriato (es. placeholder che usano `{{contatto.nome}}` → `{{contatto.first_name}}`).

### Step 4 — Fix template `flow-templates.ts`

Aggiornare le variabili nei 35 template per usare i nuovi nomi reali.

### File modificati
1. `src/components/settings/CustomFieldsConfig.tsx` — +80 BUILTIN_FIELDS, nuovi folder/colors, filtri espansi
2. `src/lib/flow-node-catalog.ts` — Fix outputVariables + configSchema placeholders
3. `src/lib/flow-templates.ts` — Fix variabili nei template

