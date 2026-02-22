
# Rendere il nome contatto cliccabile sulla card opportunita

## Cosa cambia

### File: `src/components/opportunities/OpportunityCard.tsx`

### 1. Nome contatto cliccabile con navigazione
Il nome del contatto (es. "Contatto 1 - milano", "Enrico Goldoni") sulla card diventa un link cliccabile. Al click, naviga alla pagina di dettaglio contatto `/azienda/marketing/contatti/{contactId}`.

- Al passaggio del mouse: il testo si sottolinea (underline on hover) per indicare che e cliccabile
- Al click: naviga alla pagina del contatto associato (usando `useNavigate` da react-router-dom)
- Il click sul nome NON apre il dettaglio opportunita (stopPropagation)
- Il drag & drop continua a funzionare normalmente (il link si attiva solo su click, non su drag)
- Se non c'e un contatto associato (`contact` e null), il nome resta testo statico non cliccabile

### Dettaglio tecnico

| Azione | Riga | Dettaglio |
|--------|------|-----------|
| Import `useNavigate` | 1 | Aggiungere import da `react-router-dom` |
| Aggiungere `navigate` nel componente | 26 | `const navigate = useNavigate()` |
| Rendere il nome un elemento cliccabile | 143 | Wrappare in un `<span>` con `onClick` che naviga a `/azienda/marketing/contatti/${contact.id}`, con `cursor-pointer hover:underline` e `stopPropagation` + `e.preventDefault()` per non triggerare il drag o l'apertura del dettaglio opportunita |

### Comportamento
- Con contatto associato: testo con hover underline, click naviga al contatto
- Senza contatto: testo statico come prima
- Il resto della card continua ad aprire il dettaglio opportunita come prima
