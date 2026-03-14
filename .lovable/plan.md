

## Piano: Pannello Configurazione GHL-Style con Filtri Dinamici e Custom Fields

### Problema attuale
Quando si clicca su un nodo trigger/azione nel canvas, il pannello destro mostra solo "Etichetta nodo" e i campi base del `configSchema` (es. solo "valore_minimo" per il trigger opportunità). Mancano completamente:
1. I **filtri dinamici** stile GHL (campo + operatore + valore) con "Aggiungi Filtri"
2. L'integrazione con i **campi personalizzati** (`marketing_custom_fields`)
3. Il pannello è troppo stretto (300px) e compatto

### Soluzione

Il sistema legacy marketing ha già un componente `TriggerConditionBuilder` completo che fa esattamente quello che serve: filtri dinamici, integrazione custom fields, operatori per tipo, gruppi AND/OR. Lo riutilizzeremo nel nuovo flow builder.

### Modifiche

**1. `FlowBuilderConfigPanel.tsx` — Ristrutturazione completa**

- Allargare il pannello da `w-[300px]` a `w-[380px]`
- Aumentare padding e spacing per leggibilità
- Per nodi **trigger**: mostrare la sezione "FILTRI" con il `TriggerConditionBuilder` esistente, mappando `item.id` → categoria trigger (es. `opportunita_creata` → `"opportunity"`, `contatto_creato` → `"contact"`)
- Per nodi **azione**: mostrare i campi di configurazione specifici (panel specializzati esistenti + configSchema generico), con layout più arioso
- Aggiungere una mappa `TRIGGER_CATEGORY_MAP` che converte l'`itemId` del trigger alla categoria del `TriggerConditionBuilder`:

```text
contatto_creato / contatto_aggiornato / contatto_assegnato → "contact"
opportunita_creata / opportunita_stage_cambiato / opportunita_vinta / opportunita_persa → "opportunity"
appuntamento_creato / appuntamento_confermato / appuntamento_completato / appuntamento_no_show / appuntamento_imminente → "appointment"
email_aperta / email_cliccata / whatsapp_ricevuto / campagna_facebook_lead → "communication"
ordine_creato / ordine_stato_cambiato / ordine_in_ritardo → "order"
fattura_creata / fattura_scaduta / pagamento_ricevuto → "invoice"
ticket_creato / ticket_stato_cambiato / ticket_senza_risposta → "ticket"
task_creato / task_completato / task_scaduto → "task"
cantiere_creato / cantiere_fase_completata / cantiere_in_ritardo → "construction"
```

- Aggiungere campi base per le categorie mancanti (ordine, fattura, ticket, task, cantiere) in `automationBuilder.ts` → `getFieldsForCategory`

**2. `FlowBuilderConfigPanel.tsx` — Layout pannello trigger (stile GHL)**

```text
┌─────────────────────────────┐
│ TRIGGER                     │
│ Nuova opportunità creata    │  ← header con tipo + nome
├─────────────────────────────┤
│ Etichetta nodo              │
│ [Nuova opportunità creata ] │
├─────────────────────────────┤
│ configSchema fields         │  ← campi base dal catalogo
│ (valore_minimo, ecc.)       │
├─────────────────────────────┤
│ FILTRI                      │  ← sezione separata
│ [Campo ▼] [Operatore ▼]    │
│ [Valore...              ]   │
│                             │
│ + Aggiungi Filtro           │
│ + Aggiungi Gruppo           │
├─────────────────────────────┤
│ Descrizione trigger         │
├─────────────────────────────┤
│ [🗑 Elimina nodo]           │
└─────────────────────────────┘
```

**3. `automationBuilder.ts` — Aggiungere campi trigger per categorie mancanti**

Aggiungere definizioni `TriggerFieldDef[]` per: `order`, `invoice`, `ticket`, `task`, `construction` e aggiornarli in `getFieldsForCategory()`.

**4. `FlowBuilderPage.tsx` — Passare `companyId` al config panel**

Il `TriggerConditionBuilder` ha bisogno di `companyId` per caricare i custom fields dal DB. Passare `effectiveCompany.id` attraverso `WorkflowRightPanel` → `FlowBuilderConfigPanel`.

**5. `WorkflowRightPanel.tsx` — Propagare `companyId`**

Aggiungere prop `companyId` e passarla al `FlowBuilderConfigPanel`.

### File da modificare

| File | Cosa |
|------|------|
| `src/components/flow-builder/FlowBuilderConfigPanel.tsx` | Allargare panel (380px), integrare `TriggerConditionBuilder` per trigger, mappa categorie, layout GHL |
| `src/components/flow-builder/WorkflowRightPanel.tsx` | Passare `companyId` al config panel, allargare anche catalog panel |
| `src/components/flow-builder/FlowBuilderPage.tsx` | Passare `effectiveCompany?.id` a `WorkflowRightPanel` |
| `src/types/automationBuilder.ts` | Aggiungere field definitions per categorie mancanti (order, invoice, ticket, task, construction) |

