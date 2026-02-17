

# Aggiornamento testo branding nella pagina Login

## Problema
Il testo attuale nel pannello sinistro del login ("Gestisci la tua azienda edile in modo semplice e veloce" e "Ordini, clienti, dipendenti, magazzino e previsionale...") e' rivolto solo agli amministratori aziendali, ma dalla stessa pagina accedono anche i clienti.

## Soluzione
Sostituire il copy con un messaggio neutro e accogliente, adatto a tutti i tipi di utente (admin, dipendenti, clienti, venditori).

### Nuovo testo proposto
- **Titolo**: "La piattaforma per l'edilizia moderna"
- **Sottotitolo**: "Accedi per gestire i tuoi progetti, ordini e molto altro — tutto in un unico posto."

## Dettaglio tecnico

### File da modificare
`src/components/auth/LoginForm.tsx`

- Riga ~117: cambiare il tag `h1` con il nuovo titolo
- Riga ~120: cambiare il tag `p` con il nuovo sottotitolo

Modifica minima, solo due stringhe di testo.
