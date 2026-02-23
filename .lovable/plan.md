

# Completamento Condition Builder: Tag Multi-Select, User Select, Custom Fields e NOT

## Cosa manca

Dall'analisi del codice, 4 elementi non sono ancora completi:

1. **Tag**: attualmente e un semplice input di testo. Deve diventare un dropdown multi-select con ricerca che carica i tag da `marketing_tags` filtrati per `company_id`.

2. **Utente assegnato**: attualmente e un input di testo. Deve diventare un select che carica gli utenti dall'azienda (tabella `profiles` filtrata per `company_id`).

3. **Campi personalizzati**: non vengono caricati dinamicamente da `marketing_custom_fields` (filtrati per `object_type = 'contact'` e `company_id`). Devono apparire come gruppo separato "Campi personalizzati" nel dropdown campo.

4. **Negazione (NOT)**: manca un toggle per negare una singola condizione (es. "NOT email contains gmail.com").

## Piano implementazione

### 1. ConditionValueInput.tsx - Tag Multi-Select

Sostituire l'input testo per `field.type === "tags"` con un componente che:
- Carica i tag da `marketing_tags` tramite Supabase query (filtro `company_id` dall'AuthContext)
- Mostra un Popover con lista filtrata (ricerca testuale)
- Supporta selezione multipla (chip con X per rimuovere)
- Salva come array di stringhe nel valore

### 2. ConditionValueInput.tsx - User Select

Sostituire l'input testo per `field.type === "user"` con un Select che:
- Carica i profili utente da `profiles` filtrati per `company_id`
- Mostra nome completo (first_name + last_name) come label
- Salva l'`id` utente come valore

### 3. TriggerConditionBuilder.tsx - Custom Fields dinamici

Modificare il componente per:
- Accettare un prop `companyId: string`
- Fare una query a `marketing_custom_fields` con filtro `company_id` e `object_type` mappato alla categoria trigger (contact -> 'contact')
- Trasformare ogni custom field in un `TriggerFieldDef` con:
  - `key`: `"custom_field." + field.field_key`
  - `label`: nome del campo
  - `type`: mappatura tipo (text/number/date/select/boolean)
  - `group`: "Campi personalizzati"
  - `options`: per campi select, parsare le opzioni dal campo
- Concatenare questi campi ai campi standard della categoria
- Passare i campi risultanti alle `ConditionRow`

### 4. TriggerCondition - Supporto NOT

Aggiungere campo opzionale `negate?: boolean` all'interfaccia `TriggerCondition` in `automationBuilder.ts`.

Nella `ConditionRow`:
- Aggiungere un piccolo toggle/bottone "NOT" accanto al campo
- Quando attivo, mostrare un badge "NOT" con stile rosso/warning
- Salvare `negate: true` nella condizione

### 5. AutomationNodeConfig.tsx

Passare `companyId` al `TriggerConditionBuilder`. Recuperare il `company_id` dall'AuthContext.

## Dettaglio tecnico per file

### `src/types/automationBuilder.ts`
- Aggiungere `negate?: boolean` a `TriggerCondition`

### `src/components/marketing/automations/ConditionValueInput.tsx`
- Sezione tags: sostituire Input con componente Popover multi-select che query `marketing_tags`
- Sezione user: sostituire Input con Select che query `profiles`
- Importare `supabase` e `useAuth` (o ricevere `companyId` come prop)
- Aggiungere prop `companyId?: string`

### `src/components/marketing/automations/TriggerConditionBuilder.tsx`
- Aggiungere prop `companyId: string`
- Aggiungere `useEffect` per caricare custom fields da `marketing_custom_fields`
- Unire campi standard + custom fields nel dropdown
- Passare `companyId` a `ConditionValueInput`
- Aggiungere toggle NOT nella `ConditionRow`

### `src/components/marketing/automations/AutomationNodeConfig.tsx`
- Importare `useAuth` per ottenere `companyId`
- Passare `companyId` a `TriggerConditionBuilder`

Nessuna modifica al database. Nessun file nuovo.

