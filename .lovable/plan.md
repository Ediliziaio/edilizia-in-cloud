
# Bottone Assistenza Super Admin nell'Header Azienda

## Cosa cambia

Nell'header del layout azienda (la barra superiore con il nome dell'azienda), viene aggiunto un bottone "Assistenza" in alto a destra che porta alla sezione ticket/supporto.

## Modifica

### File: `src/components/layouts/CompanyLayout.tsx`

Nella sezione `<header>` (riga 203-209), aggiungere un bottone con icona `HeadphonesIcon` (gia importata nel file) prima del nome azienda:

- Bottone con variante `outline` e dimensione `sm`
- Icona `HeadphonesIcon` + testo "Assistenza"
- Click naviga a `/azienda/assistenza`
- Visibile solo se l'utente ha il permesso `canViewTickets` e il modulo `tickets` e abilitato (coerente con la sidebar)

### Risultato visivo

```text
[Sidebar trigger]          [Assistenza]  Nome Azienda
```

## Dettagli tecnici

- Importare `useNavigate` (gia usato nel file) per la navigazione
- Usare `usePermissions` e `useSubscriptionLimits` (gia disponibili nel componente `CompanySidebar`, vanno richiamati anche nel `CompanyLayout`)
- Nessun nuovo file, nessuna migrazione, nessun componente aggiuntivo
