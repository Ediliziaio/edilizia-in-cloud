

# FASE C1 — Deal Health Score

## Cosa viene implementato

Un punteggio di "salute" per ogni trattativa aperta (0-100), distinto dal lead score che misura la qualita del contatto. Il Deal Health Score misura se una trattativa sta procedendo bene o e in stallo.

## File da creare

### 1. `src/lib/dealHealthScore.ts`
Funzione pura `calculateDealHealth(input: DealHealthInput): DealHealth` con la logica di scoring descritta nel prompt. Input: giorni dall'ultima attivita, giorni nello stage, next_action settata, expected_close_date, probabilita, numero attivita, media storica giorni nello stage. Output: score 0-100, status (healthy/at_risk/critical/dead), badge italiano, classe colore Tailwind, lista di motivazioni.

## File da modificare

### 2. `src/components/opportunities/OpportunityCard.tsx`
- Importare `calculateDealHealth` e calcolare il deal health dal dato dell'opportunita (gia disponibile: `opportunity.updated_at`, `opportunity.next_action`, `opportunity.expected_close_date`, `opportunity.probability`, `opportunity.notes_count`)
- Aggiungere un piccolo badge colorato (pallino + score) nell'angolo in alto a destra della card, accanto all'avatar owner
- Tooltip al hover che mostra score numerico + lista reasons
- Nel layout mini: solo pallino colorato senza testo

### 3. `src/components/opportunities/OpportunityListView.tsx`
- Aggiungere colonna "Salute" tra "Stato" e "Titolare"
- Mostra badge colorato con score e status text
- Aggiornare colSpan da 11 a 12

### 4. `src/pages/azienda/marketing/SalesOSDashboard.tsx`
- Aggiungere componente `DealHealthOverview` nel tab "Pipeline", sopra i grafici esistenti
- 4 mini-card in riga: contatori Healthy / At Risk / Critical / Dead con colori
- Il componente usa le opportunita gia caricate dalla weighted pipeline oppure una query leggera dedicata

### 5. `src/hooks/useSalesOS.ts`
- Aggiungere `useDealHealthData(companyId)` — query che fetcha le opportunita aperte con i campi necessari al calcolo (updated_at, next_action, expected_close_date, probability, notes_count, stage_changed_at o created_at)
- Il calcolo del health score avviene client-side con la funzione pura

## Dettagli tecnici

- Il campo `daysSinceLastActivity` viene derivato da `opportunity.updated_at` (approssimazione accettabile senza campo dedicato)
- Il campo `daysSinceStageChange` viene derivato da `updated_at` come proxy (no campo `stage_changed_at` nel DB attuale — commento TODO)
- `avgStageDays` viene calcolato come media globale dai deal chiusi, oppure default 14 se non disponibile
- `hasDecisionMaker` non e disponibile nel DB attuale — default `true` per non penalizzare, con commento TODO
- Nessuna migration DB necessaria per questa fase

