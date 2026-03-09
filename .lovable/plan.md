

# Creazione Preventivo Integrata nel Popup Opportunità

## Approccio

Embedding del QuoteBuilder completo (841 righe, 4 step) dentro il dialog sarebbe troppo complesso e fragile. L'approccio migliore è creare un **mini-builder semplificato** direttamente nella tab "Preventivi" del popup, che permette di creare un preventivo rapido senza uscire dal contesto, mantenendo anche il link al builder completo per casi avanzati.

## Cosa si aggiunge

Nella tab "Preventivi" (`OpportunityQuotesTab.tsx`), sotto il bottone "Nuovo Preventivo" esistente (che continuerà a funzionare per il builder completo), si aggiunge un **form inline espandibile** con:

### Form rapido preventivo (inline)
1. **Bottone "Crea Rapido"** — toggle per mostrare/nascondere il form
2. **Titolo preventivo** — input testo (default: "Preventivo")
3. **Tabella prodotti** — righe con: nome, quantità, prezzo unitario, IVA%, sconto%, unità di misura
   - Bottone "Aggiungi riga" per nuovi prodotti
   - Import da catalogo articoli (select dal DB `article_templates`)
   - Rimozione riga
4. **Sconto globale %** — input numerico
5. **Riepilogo** — subtotale, sconto, IVA, totale (calcolati live)
6. **Selezione materiali PDF** — checkbox dei materiali disponibili (`quote_pdf_materials`)
7. **Note** — textarea opzionale
8. **Validità** — giorni (default 30)
9. **Bottone "Salva Bozza"** — crea il preventivo in stato `bozza` con i dati del contatto pre-popolati dall'opportunità

### Logica di salvataggio
- Dati cliente pre-popolati automaticamente dal `contact_id` dell'opportunità (nome, email, telefono, indirizzo, CF, P.IVA)
- Genera numero preventivo via `generate_quote_number` RPC
- Inserisce `quotes` + `quote_items` + `quote_pdf_attachments`
- Invalida la query `quotes_by_contact` per aggiornare la lista sotto
- Toast di conferma

### File modificati

| File | Modifica |
|------|----------|
| `src/components/opportunities/OpportunityQuotesTab.tsx` | Aggiunta form inline con tabella prodotti, import catalogo, materiali PDF, calcoli, salvataggio |

Nessuna migration DB necessaria — tutte le tabelle esistono già.

