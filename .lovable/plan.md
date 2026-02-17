

# Fix Bug Salvataggio Automazione - effectiveCompany null

## Problema Identificato

Quando si clicca "Crea automazione", il salvataggio fallisce con:

**"Errore: Cannot read properties of null (reading 'id')"**

Causa: la funzione `handleSave` in `AutomationDialog.tsx` (riga 145) usa `effectiveCompany!.id` e `user!.id` senza verificare che siano definiti. Quando l'utente e' un Super Admin senza impersonazione attiva, `effectiveCompany` e' null.

## Soluzione

### File: `src/components/settings/AutomationDialog.tsx`

Aggiungere un controllo di sicurezza in `handleSave` prima di costruire il payload:

```tsx
// Prima di costruire il payload (riga 137-138)
if (!effectiveCompany?.id || !user?.id) {
  toast({ 
    title: "Errore", 
    description: "Seleziona un'azienda prima di creare un'automazione.", 
    variant: "destructive" 
  });
  return;
}
```

Questo sostituisce le asserzioni non-null (`!`) con un guard clause sicuro.

## Verifiche Completate

| Area | Stato | Note |
|------|-------|------|
| Tab Automazioni visibile | OK | Appare correttamente nella barra delle impostazioni |
| Stato vuoto | OK | Mostra messaggio con CTA "Crea Automazione" |
| Dialog apertura | OK | Si apre con blocchi QUANDO/SE/ALLORA |
| Trigger selector | OK | 5 opzioni disponibili, cambio stato mostra sub-opzione |
| Condizioni | OK | Aggiunta/rimozione funziona |
| Azioni - Crea attivita | OK | Tutti i campi presenti (titolo, note, priorita, assegnatario, scadenza relativa) |
| Offset giorni | OK | Helper text "5 giorni prima" corretto |
| Azioni - Cambia stato | OK | Mostra stati dell'azienda |
| Azioni - Crea promemoria | OK | Titolo, note, giorni |
| Salvataggio | BUG | Crash su effectiveCompany null |
| Trigger database | OK | `automation_on_order_insert` e `automation_on_order_update` presenti |
| Funzione execute_automation | OK | Presente e corretta nel database |
| Toggle attiva/disattiva | OK | Struttura corretta |
| Eliminazione | OK | AlertDialog con conferma |

## Impatto

Un singolo fix (guard clause) risolve il crash e rende la sezione pienamente operativa.

