

# Riga Espandibile nella Lista Aziende

## Cosa cambia

Ogni riga della tabella aziende avra un bottone freccia (chevron) che, cliccato, espande una sezione sotto la riga con una panoramica rapida dell'azienda -- senza dover navigare alla pagina di dettaglio.

---

## Contenuto della panoramica espandibile

Per ogni azienda, il pannello mostra:

**4 mini-card in riga:**
- Ordini totali (conteggio)
- MRR (prezzo piano mensile)
- Stato abbonamento con badge colorato
- Data creazione account

**Info aggiuntive:**
- Settore e email
- Piano attuale
- Azioni rapide: "Apri dettaglio" e "Accedi come azienda"

Il tutto in uno sfondo leggermente diverso (`bg-muted/30`) per distinguerlo dalla riga principale.

---

## Comportamento

- Click sulla freccia: espande/comprime la panoramica (con animazione)
- Click sulla riga (fuori dalla freccia): naviga al dettaglio come oggi
- Solo una riga espansa alla volta (opzionale, per pulizia visiva)
- La freccia ruota di 180 gradi quando espansa

---

## Dettagli Tecnici

### File modificato
**`src/pages/admin/CompaniesList.tsx`**:
- Aggiungere stato `expandedId: string | null` per tracciare quale riga e espansa
- Aggiungere colonna freccia (ChevronDown) come prima colonna della tabella
- Dopo ogni `TableRow`, renderizzare condizionalmente una seconda `TableRow` con `colSpan` pieno contenente la panoramica
- La freccia usa `stopPropagation` per non triggerare la navigazione
- Animazione CSS con `transition-transform rotate-180` sulla freccia

### Dati utilizzati
Tutti i dati necessari sono gia disponibili nel componente:
- `company.status`, `company.sector`, `company.email`, `company.created_at`
- `subscription_plans.name`, `subscription_plans.price_monthly`
- `orderCounts[company.id]`

Nessun file aggiuntivo e nessuna query extra necessaria.

