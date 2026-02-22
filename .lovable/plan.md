

# Audit Completo: Contatti e Opportunita - Round 2

## BUG TROVATI

### BUG-1 (CRITICO): MarketingContactDetail mostra TUTTI i campi personalizzati invece di solo quelli "contact"
**File:** `src/pages/azienda/marketing/MarketingContactDetail.tsx` (righe 288-302)
**Problema:** La query per i custom fields non filtra per `object_type = "contact"`. Questo significa che anche i campi personalizzati di tipo "opportunity" vengono mostrati nella pagina dettaglio contatto, creando confusione e potenziali sovrascritture errate.
**Confronto:** L'hook `useContactCustomFields` in `useOpportunityDetailData.ts` usa correttamente `.eq("object_type", "contact")`, ma la query inline in MarketingContactDetail no.
**Fix:** Aggiungere `.eq("object_type", "contact")` alla query alla riga 295.

### BUG-2: Unused `_ref` in OpportunityCard forwardRef
**File:** `src/components/opportunities/OpportunityCard.tsx` (riga 26)
**Problema:** Il componente usa `forwardRef` ma `_ref` non viene mai usato. `setNodeRef` di dnd-kit gestisce il ref. Codice morto.
**Fix:** Rimuovere `forwardRef` e usare un componente standard con `memo`.

---

## PULIZIA CODICE

### RIMOZIONE-1: Query custom fields duplicata in MarketingContactDetail
La pagina dettaglio contatto ha una query inline per i custom fields (righe 288-302) invece di usare l'hook centralizzato `useContactCustomFields`. Dopo il fix del BUG-1, sostituire con l'hook gia esistente per evitare duplicazione.

### RIMOZIONE-2: forwardRef non necessario in OpportunityCard
Semplificare la dichiarazione del componente rimuovendo `forwardRef` e il parametro `_ref` inutilizzato.

---

## DETTAGLIO TECNICO DELLE MODIFICHE

### File 1: `src/pages/azienda/marketing/MarketingContactDetail.tsx`

| Azione | Dettaglio |
|--------|-----------|
| Aggiungere import `useContactCustomFields` | Importare l'hook da `@/hooks/useOpportunityDetailData` |
| Sostituire query inline custom fields (righe 288-302) | Usare `const { data: customFields = [] } = useContactCustomFields()` al posto della query manuale. Questo risolve il BUG-1 perche l'hook filtra gia per `object_type = "contact"` |

### File 2: `src/components/opportunities/OpportunityCard.tsx`

| Azione | Dettaglio |
|--------|-----------|
| Rimuovere `forwardRef` dalla riga 1 e 26 | Cambiare in `export const OpportunityCard = memo(function OpportunityCard({ ... })` |
| Rimuovere parametro `_ref` | Non piu necessario |

---

## VERIFICA FUNZIONALITA (Post-fix)

| Area | Stato |
|------|-------|
| Custom fields contatto: solo tipo "contact" visibili | FIX applicato |
| Custom fields opportunita: solo tipo "opportunity" visibili | OK (gia corretto) |
| Assegnazione utenti (Titolare, Follower, Call Center) | OK |
| CRUD contatti | OK |
| CRUD opportunita | OK |
| Drag & drop pipeline | OK |
| Tag sync bidirezionale | OK |
| Filtri avanzati con custom fields | OK |
| Import/Export CSV | OK |
| Badge conteggi (note/documenti) | OK |
| Navigazione contatto da card | OK |
| Cambio contatto nel detail dialog | OK (con city fix precedente) |
| Upsert custom field values | OK (unique constraint verificato su DB) |

---

## Riepilogo

2 file modificati, 0 file eliminati:
1. `MarketingContactDetail.tsx` - Sostituire query inline con hook centralizzato (fix filtro object_type)
2. `OpportunityCard.tsx` - Rimuovere forwardRef inutilizzato

