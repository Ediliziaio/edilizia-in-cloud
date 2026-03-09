

## Analisi Integrazione Ordini d'Acquisto (OdA)

Ho esaminato in dettaglio il modulo OdA e le sue connessioni con ordini, articoli, fornitori e costi. Ecco il risultato dell'analisi.

### ✅ Integrazioni funzionanti

1. **Fornitori** — Il collegamento `supplier_id` funziona correttamente. La lista OdA mostra il nome fornitore via join `suppliers(name, email)`. Il dettaglio OdA carica dati estesi del fornitore (IBAN, indirizzo, P.IVA). Il tab OdA nella vista fornitore operativa (Impostazioni) naviga correttamente al dettaglio OdA.

2. **Routing** — Le route `/azienda/ordini-acquisto` (lista) e `/azienda/ordini-acquisto/:odaId` (dettaglio) sono registrate in `App.tsx`. La sidebar punta correttamente. I link dalla vista fornitori puntano alla route corretta.

3. **Ordini Cliente** — Il campo `order_id` nella tabella `purchase_orders` e `order_item_id` in `purchase_order_items` collegano correttamente OdA agli ordini cliente. Il dettaglio OdA mostra il numero ordine associato via join `orders(order_number)`.

4. **Catalogo Articoli** — La tabella `purchase_order_items` ha il campo `article_template_id` che referenzia `article_templates`. Il DB supporta il collegamento.

5. **Totali** — I campi `subtotal`, `vat_total`, `total` sono calcolati (presumibilmente via trigger DB) e mostrati correttamente nel footer della tabella articoli e nei KPI della lista.

6. **Gestione stati** — Il flusso bozza → inviato → confermato → parziale/ricevuto → chiuso è implementato con `STATUS_FLOW`. La ricezione parziale è gestita con `quantity_received` per articolo.

### ⚠️ Problemi identificati

1. **ArticleCombobox non usato negli OdA** — Nel dettaglio OdA, gli articoli vengono aggiunti con un semplice `Input` di testo per la descrizione, senza usare il `ArticleCombobox` che è disponibile e usato negli ordini cliente e preventivi. Questo significa:
   - L'utente non può selezionare articoli dal catalogo quando crea un OdA
   - Il campo `article_template_id` non viene mai popolato
   - Prezzi, SKU, unità di misura non vengono pre-compilati dal catalogo

2. **Nessun collegamento OdA → Costi** — Quando un OdA viene marcato come "ricevuto", non viene generato automaticamente un costo nella sezione Costi Aziendali. L'integrazione è assente: non c'è logica per creare record in `company_costs` al ricevimento.

3. **Nessun collegamento dall'ordine cliente all'OdA** — Non c'è un pulsante "Crea OdA da ordine" nella vista ordine cliente. Il campo `order_id` esiste nel DB ma non viene mai utilizzato nella UI per collegare un OdA a un ordine.

### Piano di miglioramento proposto

**1. Integrare ArticleCombobox nel dettaglio OdA**
- Sostituire l'Input di testo nella riga articolo con `ArticleCombobox`
- Quando l'utente seleziona un articolo dal catalogo, pre-compilare: descrizione, SKU, prezzo unitario (`standard_cost` per gli acquisti), unità di misura, IVA
- Salvare `article_template_id` nel record `purchase_order_items`

**2. Generazione costo al ricevimento (opzionale)**
- Aggiungere logica per creare un record `company_costs` quando lo stato OdA passa a "ricevuto"
- Collegare il costo al fornitore e all'OdA

**3. Creazione OdA da ordine cliente (opzionale)**
- Aggiungere un'azione nella vista ordine per creare un OdA pre-compilato con gli articoli dell'ordine

Il punto 1 è il più critico per garantire coerenza con il resto della piattaforma. I punti 2 e 3 sono miglioramenti utili ma non bloccanti.

