

# Aggiunta Tab "Preventivi" nel Dialog Opportunità

## Cosa fare

Aggiungere una nuova tab "Preventivi" nella sidebar sinistra del dialog di modifica opportunità, tra "Documenti" e le altre tab esistenti. La tab mostrerà la lista dei preventivi associati al contatto dell'opportunità e un bottone per crearne uno nuovo (pre-popolando il `contact_id`).

## Implementazione

### 1. Creare componente `OpportunityQuotesTab.tsx`

Componente dedicato che riceve `contactId` e `companyId`:
- Query per caricare i preventivi del contatto (`quotes` filtrati per `contact_id` + `company_id`)
- Bottone "Nuovo Preventivo" che naviga a `/azienda/marketing/preventivi/nuovo?contact_id=xxx`
- Lista dei preventivi con numero, titolo, badge stato, totale — click naviga al dettaglio
- Messaggio vuoto se non ci sono preventivi
- Se non c'è un contatto collegato, mostra un avviso

### 2. Modificare `OpportunityDetailDialog.tsx`

- Aggiungere `"quotes"` al tipo `Tab`
- Aggiungere la voce sidebar con icona `Receipt` (da lucide) e label "Preventivi"
- Nel content area, renderizzare `OpportunityQuotesTab` quando `tab === "quotes"`
- Passare `opportunity.contact_id` e `companyId` al componente

### File modificati

| File | Modifica |
|------|----------|
| `src/components/opportunities/OpportunityQuotesTab.tsx` | Nuovo componente |
| `src/components/opportunities/OpportunityDetailDialog.tsx` | Aggiunta tab + rendering |

