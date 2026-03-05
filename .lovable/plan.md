

# Miglioramenti Magazzino - Prospettiva Logistica

Dopo aver analizzato tutti i componenti del modulo Magazzino, ecco le aree di miglioramento principali da un punto di vista logistico professionale.

---

## 1. Vista "Ordini Fornitore" (raggruppamento per fornitore)

**Problema**: Quando devi ordinare materiali, vuoi vedere tutti gli articoli "Da Ordinare" raggruppati per fornitore per fare un unico ordine per fornitore. Oggi devi cercarli manualmente tra ordini diversi.

**Soluzione**: Aggiungere un'opzione di raggruppamento "Per fornitore" nel GroupBy della lista. Ogni gruppo mostra il fornitore, il totale articoli da ordinare e il valore totale, con un bottone "Segna tutti come Ordinati" per processare un ordine fornitore in un click.

---

## 2. Articoli Scaduti / In Ritardo

**Problema**: Non esiste nessun filtro o alert per articoli la cui data di posa e' GIA' passata ma che non sono ancora pronti (status da_ordinare o ordinato). Questi sono i problemi piu' critici per un responsabile logistico.

**Soluzione**: Aggiungere un quick filter "In Ritardo" che mostra articoli con data posa nel passato e status non pronto. Aggiungere un contatore nel banner alert e nelle stats.

---

## 3. Collegamento Giacenze ↔ Articoli da Ordinare

**Problema**: Quando un articolo e' "Da Ordinare", il magazziniere non sa se lo ha gia' in giacenza. Le due sezioni (articoli ordini vs. giacenze stock) sono separate.

**Soluzione**: Nella lista articoli "Da Ordinare", mostrare un indicatore se l'articolo e' gia' disponibile in giacenza (match per nome). Un badge "Disponibile in stock" con quantita' permette di evitare ordini inutili.

---

## 4. Stats migliorate: KPI operativi

**Problema**: Le stats attuali mostrano solo conteggi statici. Mancano KPI operativi fondamentali.

**Soluzione**: Aggiungere alla riga stats:
- **In Ritardo**: conteggio articoli con posa passata e non pronti (card rossa)
- Rendere la card "Completamento" piu' informativa con breakdown per stato

---

## 5. Note rapide sugli articoli

**Problema**: Non c'e' modo di aggiungere note a un articolo (es. "attesa conferma fornitore", "pezzo in backorder", "arriva lunedi").

**Soluzione**: Aggiungere un campo `notes` alla tabella `order_items` e un'icona nella lista/kanban per aggiungere/visualizzare note rapide tramite popover.

---

## Piano implementativo

### Fase 1 - Impatto immediato (piu' critico)
- **Quick filter "In Ritardo"** + contatore in stats e alerts
- **GroupBy "Per fornitore"** nella vista lista

### Fase 2 - Efficienza operativa
- **Match giacenze** per articoli da ordinare (badge "Disponibile in stock")
- **Note rapide** su articoli (migration + UI)

### Modifiche tecniche

**Database migration**:
- `ALTER TABLE order_items ADD COLUMN notes TEXT DEFAULT NULL;`

**File da modificare**:
- `src/hooks/useWarehouseData.ts` — aggiungere quick filter "overdue", groupBy "supplier"
- `src/pages/azienda/Warehouse.tsx` — aggiungere opzioni UI per nuovo filter e groupBy
- `src/components/warehouse/WarehouseStats.tsx` — aggiungere card "In Ritardo"
- `src/components/warehouse/WarehouseAlerts.tsx` — includere alert per articoli scaduti
- `src/components/warehouse/WarehouseListView.tsx` — supporto raggruppamento fornitore, badge stock disponibile, icona note
- `src/components/warehouse/WarehouseKanbanCard.tsx` — indicatore note
- `src/types/warehouse.ts` — aggiungere `notes` al tipo `WarehouseItem`, utility `isItemOverdue`

