
# Personalizza Scheda Opportunita - Sheet Laterale

## Cosa viene creato

Un pannello laterale (Sheet) che si apre da destra quando si clicca "Gestisci campi" nella pagina Opportunita. Questo pannello, ispirato a GoHighLevel, permette di scegliere quali campi mostrare sulla scheda (card) dell'opportunita nella vista Kanban.

## Struttura del pannello (come da screenshot GHL)

1. **Titolo**: "Personalizza scheda" con pulsante X per chiudere
2. **Anteprima della scheda**: mini-preview della card con i campi attivi
3. **Layout della scheda**: radio group con opzioni "Predefinito", "Compatto", "Senza etichetta"
4. **Due tab**: "Campi" e "Attivita rapida"
5. **Barra di ricerca**: per filtrare i campi
6. **Lista campi attivi**: con checkbox attive, drag handle (6 puntini), e icona lucchetto per campi obbligatori (es. "Nome opportunita")
7. **Sezione "Aggiungi campi"**: divisa in sotto-sezioni espandibili:
   - "Altri dettagli" (Creato il, Aggiornato il, ecc.)
   - "PRIMARIO Contatto Dettagli" (Contatto, Nome azienda, ecc.)
   - "Opportunita Dettagli" (Sequenza, Fase, Stato, Citta, ecc.)
8. **Footer fisso**: pulsanti "Annulla" e "Applica"

## Come funziona

- Le preferenze dei campi visibili vengono salvate in `localStorage` per company (non serve una tabella DB per ora, cosi e istantaneo)
- La chiave localStorage sara `opp_card_fields_{companyId}` con un array di field keys attivi
- I campi di default attivi sono: nome opportunita, etichette, titolare, fonte, valore, motivo perdita, email contatto, telefono contatto
- Il componente `OpportunityCard` legge queste preferenze e mostra solo i campi selezionati
- Il layout (predefinito/compatto/senza etichetta) viene salvato come `opp_card_layout_{companyId}`

## File da creare/modificare

| File | Tipo | Descrizione |
|------|------|-------------|
| `src/components/opportunities/CardCustomizeSheet.tsx` | Nuovo | Il pannello laterale completo con anteprima, selezione campi, layout, ricerca |
| `src/hooks/useCardFieldPreferences.ts` | Nuovo | Hook per leggere/salvare preferenze localStorage con i default |
| `src/components/opportunities/OpportunityCard.tsx` | Modifica | Leggere le preferenze e mostrare solo i campi selezionati |
| `src/pages/azienda/marketing/MarketingOpportunities.tsx` | Modifica | Cambiare il pulsante "Gestisci campi" per aprire il sheet invece di navigare |

## Dettagli tecnici

### Campi disponibili (con chiavi interne)

**Campi attivi di default (sezione principale):**
- `opp_name` - Nome opportunita (bloccato, non disattivabile)
- `tags` - Etichette intelligenti
- `owner` - Titolare dell'opportunita
- `source` - Fonte dell'opportunita
- `value` - Valore dell'opportunita
- `lost_reason` - Motivo della perdita
- `contact_email` - Email del contatto
- `contact_phone` - Telefono del contatto

**Sezione "Altri dettagli":**
- `created_at` - Creato il
- `updated_at` - Aggiornato il
- `status_changed_at` - Data ultima modifica stato
- `stage_changed_at` - Data ultima modifica fase

**Sezione "PRIMARIO Contatto Dettagli":**
- `contact_name` - Contatto (nome completo)
- `contact_company` - Nome dell'azienda
- `contact_city` - Citta
- `contact_source` - Fonte contatto

**Sezione "Opportunita Dettagli":**
- `pipeline` - Sequenza
- `stage` - Fase
- `status` - Stato

Eventuali campi personalizzati (da `marketing_custom_fields` con `object_type = "opportunity"`) vengono aggiunti dinamicamente nella sezione "Opportunita Dettagli".

### Layout della card
- **Predefinito**: mostra etichetta + valore su righe separate (come ora)
- **Compatto**: solo valori senza etichette, font piu piccolo
- **Senza etichetta**: solo valori, senza label

### Hook `useCardFieldPreferences`
```typescript
// Ritorna { activeFields, layout, setActiveFields, setLayout }
// I default sono i campi attivi di base
// Salva in localStorage con chiave basata su companyId
```

### Modifica OpportunityCard
- Importare `useCardFieldPreferences`
- Nel render dei "Detail rows", iterare solo sui campi attivi
- Supportare i 3 layout (predefinito, compatto, senza etichetta)

### Modifica MarketingOpportunities
- Aggiungere state `cardCustomizeOpen`
- Cambiare onClick del pulsante "Gestisci campi" da navigazione a `setCardCustomizeOpen(true)`
- Renderizzare `<CardCustomizeSheet open={cardCustomizeOpen} onOpenChange={setCardCustomizeOpen} />`
