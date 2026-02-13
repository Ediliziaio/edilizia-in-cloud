

# Piano: Duplicazione Costi Ricorrenti + Sidebar Costi + Miglioramento Previsionale

## 1. Nuova voce "Costi" nella sidebar

Aggiungere una voce dedicata "Costi" nel menu laterale (`CompanyLayout.tsx`) tra "Previsionale" e "Impostazioni", con icona `Receipt`. La rotta sara `/azienda/costi` e il permesso sara lo stesso del previsionale (`canViewForecast`, modulo `forecast`).

**File**: `src/components/layouts/CompanyLayout.tsx`
- Aggiungere `Receipt` alle icone importate
- Inserire `{ title: "Costi", url: "/azienda/costi", icon: Receipt, permissionKey: "canViewForecast", moduleKey: "forecast" }` nell'array `allNavItems`

**File**: `src/App.tsx`
- Aggiungere la rotta `<Route path="costi" element={<CompanyCosts />} />`
- Importare la nuova pagina

## 2. Nuova pagina Costi (`/azienda/costi`)

**File**: `src/pages/azienda/CompanyCosts.tsx` (nuovo)

Pagina dedicata che renderizza il componente `CompanyCostsManager` gia esistente, con header e titolo. Questo sostituisce la navigazione attuale che mostra il manager come overlay nel previsionale.

## 3. Duplicazione automatica costi ricorrenti

**File**: `src/components/forecast/CompanyCostsManager.tsx`

Aggiungere un pulsante "Genera prossimo mese" che:
1. Prende tutti i costi ricorrenti (monthly, quarterly, yearly) non "once"
2. Per ogni costo ricorrente, calcola la prossima data di scadenza:
   - **monthly**: aggiunge 1 mese alla `due_date`
   - **quarterly**: aggiunge 3 mesi
   - **yearly**: aggiunge 12 mesi
3. Verifica se esiste gia un costo con lo stesso nome e data (per evitare duplicati)
4. Crea i nuovi record con `is_paid = false`
5. Mostra un toast con il numero di costi generati

Implementazione:
- Nuova mutation `duplicateRecurringMutation`
- Pulsante nell'header della card, accanto al titolo
- Dialog di conferma prima di procedere con il conteggio dei costi che verranno duplicati

## 4. Miglioramento Previsionale

**File**: `src/pages/azienda/CashFlowForecast.tsx`

Modifiche:
- Rimuovere il toggle `showCostsManager` e il rendering inline del `CompanyCostsManager` (ora ha la sua pagina)
- Sostituire il pulsante "Gestisci Costi" con un link a `/azienda/costi`
- Mantenere la sezione riepilogativa dei costi nel previsionale come card informativa con link alla pagina costi

---

## Riepilogo tecnico

| File | Modifica |
|------|----------|
| `src/components/layouts/CompanyLayout.tsx` | Aggiunta voce "Costi" nella sidebar |
| `src/App.tsx` | Nuova rotta `/azienda/costi` |
| `src/pages/azienda/CompanyCosts.tsx` | **Nuovo** - pagina wrapper per CompanyCostsManager |
| `src/components/forecast/CompanyCostsManager.tsx` | Pulsante "Genera prossimo mese" per duplicazione ricorrenti |
| `src/pages/azienda/CashFlowForecast.tsx` | Rimuove overlay costi, link alla pagina dedicata |

Nessuna migrazione database necessaria: la logica di duplicazione usa la tabella `company_costs` esistente.

