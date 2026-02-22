

# Opportunita identica a GHL - Elementi mancanti e correzioni

## Analisi differenze tra la nostra implementazione e GHL

### Elementi mancanti nella CARD:
1. **Layout nome**: GHL usa "Nome - Citta" come testo semplice (bold), senza avatar circolare
2. **Icona assegnato**: GHL mostra iniziali dell'utente assegnato (es. "SP") in un badge colorato in alto a destra, non un'icona generica
3. **Label complete**: GHL usa label estese: "Fonte dell'opportunita:", "Valore dell'opportunita:", "Email del contatto:", "Telefono del contatto:" - noi usiamo label abbreviate con icone
4. **Valore sempre visibile**: GHL mostra sempre il valore anche se e $0.00, noi lo nascondiamo quando e 0
5. **Barra azioni in basso**: GHL ha una riga di icone piccole in fondo alla card (telefono, email, copia, nota, calendario, cartella, cestino) - COMPLETAMENTE MANCANTE

### Elementi mancanti nell'HEADER pagina:
6. **Tab "Tutto" e "+ Elenco"**: GHL ha tabs sotto il selettore pipeline
7. **Toggle vista** (griglia/lista): due icone per cambiare visualizzazione
8. **Pulsante "Importa"**: per importazione bulk
9. **Menu tre puntini**: azioni aggiuntive
10. **Barra filtri**: "Filtri avanzati" e "Ordina (1)" come pulsanti separati
11. **Campo "Cerca Lead"**: ricerca testuale dedicata con icona lente
12. **Link "Gestisci campi"**: collegamento rapido alla gestione campi personalizzati

### Elementi mancanti nella COLONNA:
13. **Formato header**: GHL mostra "N Opportunita $0.00" in una sola riga compatta, senza badge separato per il conteggio

---

## Piano di implementazione

### A. Riscrittura Card (`OpportunityCard.tsx`)
- Rimuovere avatar circolare, usare solo testo "Nome - Citta" in bold
- Icona assegnato in alto a destra con iniziali reali dell'utente (se disponibili) in un badge colorato
- Label complete in italiano: "Fonte dell'opportunita:", "Valore dell'opportunita:", "Email del contatto:", "Telefono del contatto:"
- Mostrare SEMPRE tutti i campi (anche se vuoti/zero), come GHL
- Aggiungere barra azioni in basso con icone: telefono, email, copia, nota, calendario, cartella, cestino
- Ogni icona della barra azioni avra un tooltip e un'azione corrispondente (es. click su telefono = copia numero, click su email = apri mailto, click su cestino = elimina opportunita)

### B. Header pagina completo (`MarketingOpportunities.tsx`)
- Prima riga: selettore pipeline, badge lead count (verde), toggle vista griglia/lista, "Importa", "+ Aggiungi opportunita", menu tre puntini
- Seconda riga (sotto): tab "Tutto" e "+ Elenco"
- Terza riga: "Filtri avanzati" (pulsante con icona filtro), "Ordina" (pulsante), a destra "Cerca Lead" (input ricerca), "Gestisci campi" (link)
- Implementare ricerca locale: filtrare le opportunita per nome contatto, email, telefono

### C. Header colonna semplificato (`OpportunityKanbanView.tsx`)
- Una sola riga: nome fase in bold
- Sotto: "N Opportunita $0.00" in testo piccolo grigio (formato GHL esatto)
- Rimuovere il Badge separato per il conteggio

### D. Integrazione con `useOpportunitiesData.ts`
- Aggiungere hook `useDeleteOpportunity` se non presente (per il cestino nella card)
- Le azioni della barra card useranno i dati del contatto collegato

---

## Dettaglio tecnico

### File modificati (3)
1. **`src/components/opportunities/OpportunityCard.tsx`** - Riscrittura completa layout GHL con barra azioni
2. **`src/pages/azienda/marketing/MarketingOpportunities.tsx`** - Header completo con filtri, ricerca, toggle vista
3. **`src/components/opportunities/OpportunityKanbanView.tsx`** - Header colonna semplificato formato GHL

### Barra azioni card (icone da sinistra a destra)
| Icona | Azione |
|---|---|
| Phone | Copia numero telefono contatto |
| Mail | Apri mailto: con email contatto |
| Copy | Copia nome opportunita |
| StickyNote | Apri dialog note (toast "funzionalita in arrivo") |
| Calendar | Apri calendario (toast "funzionalita in arrivo") |
| Folder | Apri documenti (toast "funzionalita in arrivo") |
| Trash2 | Elimina opportunita con conferma |

### Ricerca locale
Il campo "Cerca Lead" filtrera le opportunita gia caricate in memoria, cercando in:
- Nome opportunita
- Nome contatto (first_name, last_name)
- Email contatto
- Telefono contatto

### Cosa NON cambia
- Drag & drop tra colonne rimane invariato
- Dialog dettaglio (click su card) rimane invariato
- Dialog creazione rimane invariato
- Pipeline selector rimane invariato
- Database e RLS non cambiano

