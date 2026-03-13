

## FLOW-EXT-03 — Template Cross-Domain: Piano di Implementazione

### Problema di schema

La spec assume una tabella `flows` con colonne `nodi` e `edges` JSONB. Il sistema reale usa tabelle normalizzate:
- `automation_flows` (id, company_id, name, status, config_json, description, ...)
- `automation_nodes` (id, flow_id, company_id, node_type, position_x, position_y, config_json, label)
- `automation_connections` (id, flow_id, company_id, from_node_id, to_node_id, label)

Inoltre `automation_flows.company_id` ha un FK NOT NULL verso `companies`, quindi non possiamo inserire template globali con `company_id = NULL`.

### Approccio adattato

Invece di inserire template nel DB (che richiederebbe modifiche allo schema e alla RLS per template globali), definiamo i 35 template **in-code** come costanti TypeScript. Quando l'utente clicca "Usa template", il sistema crea un nuovo `automation_flow` e inserisce i nodi/connessioni corrispondenti.

Questo approccio:
- Non richiede modifiche allo schema DB
- Non richiede gestione di `company_id = NULL` 
- Si allinea perfettamente con come `useAutomationBuilder` salva i dati
- Permette aggiornamenti dei template senza migrazioni

### File da modificare

**1. `src/lib/flow-templates.ts`** (nuovo) — Definisce i 35 template come array TypeScript:
```ts
interface FlowTemplate {
  id: string;           // slug stabile (es. "t01-lead-facebook")
  nome: string;
  categoria: string;    // crm, marketing, preventivi, fatturazione, etc.
  descrizione: string;
  icona: string;
  difficolta: 'base' | 'intermedio' | 'avanzato';
  triggerTipo: string;
  nodes: Array<{ id: string; nodeType: string; posX: number; posY: number; configJson: Record<string, any>; label: string }>;
  connections: Array<{ fromId: string; toId: string; label?: string }>;
}
```
Contiene tutti i 35 template dal spec (T01-T35), organizzati per categoria.

**2. `src/components/automazioni/AutomazioniTemplateGallery.tsx`** — Riscrittura completa:
- Importa template da `flow-templates.ts` (niente query DB)
- Props: `categoriaFiltro?: string | null`
- Filtri: ricerca + difficolta pill
- Raggruppamento per categoria
- Bottone "Usa template" → crea flow + nodi + connessioni via Supabase, poi naviga al builder

**3. `src/pages/azienda/AutomazioniUnified.tsx`** — Aggiornare le props passate a `AutomazioniTemplateGallery`:
- Rimuovere la prop `onCustomizza` e il drawer `AutomazioneFormDrawer` (legacy)
- Passare solo `categoriaFiltro`

### Dettagli implementativi

**Attivazione template** (in `AutomazioniTemplateGallery`):
1. Crea un record `automation_flows` con `name`, `company_id`, `status: 'draft'`, `created_by`
2. Inserisce tutti i nodi in `automation_nodes` con `flow_id` del nuovo flow
3. Inserisce le connessioni in `automation_connections`
4. Naviga a `/azienda/marketing/automazioni/{newFlowId}` (il builder)

**Template inclusi** (35 totali, 11 categorie):
- CRM & Vendite (7): Lead Facebook, Nuovo contatto, Deal Vinto, Deal Perso, Contatto assegnato, Appuntamento confermato, No-show
- Preventivi (3): Accettato, In scadenza, Rifiutato
- Fatturazione (3): Fattura scaduta sollecito 3 livelli, Pagamento ricevuto, Costo elevato
- Assistenza (3): Ticket urgente escalation, Ticket risolto feedback, Ticket senza risposta
- Ordini (3): Confermato, Spedito, In ritardo
- Magazzino (3): Scorta minima, Prodotto esaurito, WhatsApp ricevuto
- Cantieri (3): Onboarding completo, Fase completata, In ritardo
- Marketing (3): Form web, Email aperta, Email cliccata
- HR (3): Nuovo dipendente onboarding, Contratto in scadenza, Richiesta ferie
- Task (1): Task scaduto escalation
- Generale (3): Report giornaliero, settimanale, mensile

